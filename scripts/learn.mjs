#!/usr/bin/env node
/**
 * scripts/learn.mjs — the self-learning loop: what our graded picks say about
 * how to set hit_prob and stakes next time. Writes data/learning.json (ours).
 *
 * INPUTS (real graded results only; nothing is made up)
 *   data/pick-history.json  every published pick: hit_prob, publish + closing
 *                           price, real result (scripts/capture-closing.mjs)
 *   data/predictions.json   game predictions graded win/loss (update-picks grade)
 *   <store>/predictions.csv Reed's bot's own prediction log (date, sport, game,
 *                           predicted_winner, win_prob, …, correct). Rows already
 *                           in predictions.json (same date + game) are not counted twice.
 *
 * OUTPUT data/learning.json
 *   calibration.picks / .predictions: 10-point buckets of our stated chance ->
 *     n, average said, actual hit rate, adjustment_pts. The adjustment is
 *     (actual − said) × n / (n + 100) (pulled toward 0 for small n) and is ONLY
 *     applied once the bucket has MIN graded (30); before that it is 0 with
 *     status "collecting data".
 *   market_shrink: weight w for hit_prob' = market + w × (hit_prob − market).
 *     w = 1 means trust our number, w < 1 pulls toward the market price. Fitted
 *     by least squares on graded picks, then pulled toward 1 the same way;
 *     w = 1 until MIN graded picks.
 *   categories: sport × bet type × prop stat -> W-L, hit rate, flat-1u units +
 *     ROI, average CLV, and a staking trust multiplier = clamp(1 + ROI × n/(n+100),
 *     0.5, 1.25) once n >= MIN, else 1 ("collecting data").
 *   clv: average closing − publish price (chance points) where both are known.
 *
 * USAGE  node scripts/learn.mjs [--commit] [--dry-run] [--csv <path>]
 * HOW THE DIGEST USES IT: HANDOFF §36.
 * PRIVACY: chance points, units and percentages only. No dollars, no "$".
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIN = 30;
const OUT = path.join(ROOT, 'data/learning.json');
const CSV = '/cursor/stores/store-a88d2fa7-3dbe-4f34-bfdc-df4a306ef53f/predictions.csv';
const r1 = x => +x.toFixed(1), r2 = x => +x.toFixed(2), clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const shrink = n => n / (n + 100);

/** Minimal CSV parser (quotes, commas inside quotes). */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(c => c.trim()));
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()]))) : [];
}

/** Graded game predictions [{p, y, sport}] from predictions.json + CSV (deduped by date + game). */
export function gradedPredictions(predDoc, csvRows) {
  const out = [], seen = new Set();
  const key = (d, g) => `${d}|${String(g).toLowerCase().replace(/\s+/g, ' ')}`;
  for (const x of (predDoc && predDoc.predictions) || []) {
    seen.add(key(x.date, x.game));
    if ((x.result === 'win' || x.result === 'loss') && x.win_prob > 0) out.push({ p: Number(x.win_prob), y: x.result === 'win' ? 1 : 0, sport: x.sport || null });
  }
  for (const c of csvRows || []) {
    if (seen.has(key(c.date, c.game))) continue;
    const ok = /^(true|yes|1|win|correct)$/i.test(c.correct), bad = /^(false|no|0|loss|wrong)$/i.test(c.correct);
    if ((ok || bad) && Number(c.win_prob) > 0) out.push({ p: Number(c.win_prob), y: ok ? 1 : 0, sport: c.sport || null });
  }
  return out;
}

/** Market chance of a whole pick from publish prices (product for combos). */
export const marketChance = legs => legs.every(l => l.publish > 0) ? legs.reduce((m, l) => m * l.publish / 100, 1) * 100 : null;

/** 10-point calibration buckets with shrunk, gated adjustments. rows: [{p, y}] */
export function calibration(rows) {
  const b = {};
  for (const r of rows) { const lo = Math.min(90, Math.floor(r.p / 10) * 10); (b[lo] = b[lo] || { lo, hi: lo + 10, n: 0, sp: 0, sy: 0 }); b[lo].n++; b[lo].sp += r.p; b[lo].sy += r.y; }
  return Object.values(b).sort((x, y) => x.lo - y.lo).map(x => {
    const said = x.sp / x.n, actual = 100 * x.sy / x.n, ready = x.n >= MIN;
    return { lo: x.lo, hi: x.hi, n: x.n, avg_said: r1(said), actual: r1(actual), adjustment_pts: ready ? r1((actual - said) * shrink(x.n)) : 0, status: ready ? 'applied' : 'collecting data' };
  });
}

/** Market-shrink weight from graded picks [{h, m, y}] (all 0-100). */
export function marketShrink(rows) {
  const ok = rows.filter(r => r.h != null && r.m != null);
  if (ok.length < MIN) return { n: ok.length, weight: 1, status: 'collecting data' };
  let num = 0, den = 0;
  for (const r of ok) { num += (100 * r.y - r.m) * (r.h - r.m); den += (r.h - r.m) ** 2; }
  const raw = den ? clamp(num / den, 0, 1) : 1;
  return { n: ok.length, raw_weight: r2(raw), weight: r2(1 - (1 - raw) * shrink(ok.length)), status: 'applied' };
}

/** Category key: sport × bet type (× prop stat). */
export const catKey = p => [p.sport || '?', p.type || '?', p.stat].filter(Boolean).join(' · ');

/** Per-category stats + trust multipliers. picks: graded history entries. */
export function categories(picks) {
  const g = {};
  for (const p of picks) {
    const k = catKey(p), c = g[k] || (g[k] = { key: k, sport: p.sport, type: p.type, stat: p.stat || null, n: 0, w: 0, l: 0, units: 0, clv: [] });
    const clv = p.legs.length === 1 && p.legs[0].close != null && p.legs[0].publish != null ? p.legs[0].close - p.legs[0].publish : null;
    if (clv != null) c.clv.push(clv);
    if (p.result !== 'win' && p.result !== 'loss') continue;
    const m = marketChance(p.legs);
    c.n++;
    if (p.result === 'win') { c.w++; c.units += 100 / m - 1; } else { c.l++; c.units -= 1; }
  }
  return Object.values(g).map(c => {
    const roi = c.n ? c.units / c.n : null, ready = c.n >= MIN;
    return { key: c.key, sport: c.sport, type: c.type, stat: c.stat, n: c.n, w: c.w, l: c.l,
      hit_rate: c.n ? r1(100 * c.w / c.n) : null, units: r2(c.units), roi: roi == null ? null : r1(100 * roi),
      avg_clv: c.clv.length ? r1(c.clv.reduce((a, b) => a + b, 0) / c.clv.length) : null, clv_n: c.clv.length,
      trust: ready ? r2(clamp(1 + roi * shrink(c.n), 0.5, 1.25)) : 1, status: ready ? 'applied' : 'collecting data' };
  }).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/** Build the whole learning doc (pure). */
export function learn(hist, predDoc, csvRows) {
  const picks = (hist && hist.picks) || [];
  const graded = picks.filter(p => p.result === 'win' || p.result === 'loss');
  const preds = gradedPredictions(predDoc, csvRows);
  const pickRows = graded.filter(p => p.hit_prob != null).map(p => ({ p: p.hit_prob, h: p.hit_prob, m: marketChance(p.legs), y: p.result === 'win' ? 1 : 0 }));
  const clvs = picks.flatMap(p => p.legs).filter(l => l.close != null && l.publish != null).map(l => l.close - l.publish);
  const cats = categories(picks);
  const ranked = cats.filter(c => c.n >= 10).sort((a, b) => b.roi - a.roi);
  return {
    schema_version: 1, min_samples: MIN,
    note: 'Learned only from real graded results. Adjustments stay at 0 (and trust at 1) until a bucket or category has 30 graded picks. Small samples are noisy.',
    sample: { picks_logged: picks.length, picks_graded: graded.length, predictions_graded: preds.length, clv_legs: clvs.length },
    calibration: { picks: calibration(pickRows), predictions: calibration(preds) },
    market_shrink: marketShrink(pickRows),
    clv: { n: clvs.length, avg_pts: clvs.length ? r1(clvs.reduce((a, b) => a + b, 0) / clvs.length) : null, beat_close_pct: clvs.length ? r1(100 * clvs.filter(x => x > 0).length / clvs.length) : null },
    categories: cats,
    best: ranked.slice(0, 3).map(c => c.key), worst: ranked.slice(-3).reverse().filter(k => !ranked.slice(0, 3).includes(k)).map(c => c.key)
  };
}

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  const csvPath = opt('csv', CSV);
  const csv = fs.existsSync(csvPath) ? parseCsv(fs.readFileSync(csvPath, 'utf8')) : [];
  const doc = learn(read(path.join(ROOT, 'data/pick-history.json')), read(path.join(ROOT, 'data/predictions.json')), csv);
  const old = read(OUT);
  const strip = d => JSON.stringify(Object.assign({}, d, { updated_at: null }));
  const changed = !old || strip(old) !== strip(doc);
  doc.updated_at = changed ? new Date().toISOString() : old.updated_at;
  const s = doc.sample;
  console.log(`learning: ${s.picks_graded}/${s.picks_logged} picks graded, ${s.predictions_graded} predictions graded, CLV on ${s.clv_legs} legs (avg ${doc.clv.avg_pts ?? '–'} pts), shrink weight ${doc.market_shrink.weight} (${doc.market_shrink.status}).`);
  if (args.includes('--dry-run')) return;
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  if (args.includes('--commit') && changed) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
    git('add', '--', 'data/learning.json');
    git('commit', '-q', '-m', `Learning loop: ${s.picks_graded} graded picks, ${s.predictions_graded} graded predictions, CLV on ${s.clv_legs} legs`);
    git('pull', '-q', '--rebase'); git('push', '-q', 'origin', 'HEAD:main');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('learn:', e.message); process.exit(1); });
