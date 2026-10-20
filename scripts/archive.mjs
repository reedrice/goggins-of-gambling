#!/usr/bin/env node
/**
 * scripts/archive.mjs — append-only, dated data cache for self-learning, backtests and
 * weight-tuning (HANDOFF §59; schema in data/archive/README.md).
 *
 *   node scripts/archive.mjs [--date YYYY-MM-DD] [--commit] [--no-push] [--no-net]
 *
 * Writes gzip NDJSON under data/archive/<kind>/<YYYY-MM>/<YYYY-MM-DD>.ndjson.gz (one record per line).
 * Idempotent: a day file is rebuilt from its existing records + today's, deduped by `key`,
 * and only rewritten when the content changes. Price histories are fetched once per market,
 * after its game started + 4 h (closed), and never again. Cheap: local files + a few public
 * GETs (Polymarket US, ESPN).
 * PRIVACY: never dollars, bankroll, stakes (stake_units dropped), tokens or keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AR = path.join(ROOT, 'data/archive');
const req = createRequire(import.meta.url);
const args = process.argv.slice(2), flag = f => args.includes(f), opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const ctDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const DAY = opt('--date') || ctDay();
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };
const PRIVATE = /^(stake|stake_units|stakes|bankroll|amount|dollars|usd|unit_size|token|api_key|apikey|secret|password)$/i;
/** Deep copy without private fields. */
const clean = o => Array.isArray(o) ? o.map(clean) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !PRIVATE.test(k)).map(([k, v]) => [k, clean(v)])) : o;

const written = [];
/** Merge records into kind/<month>/<day>.ndjson.gz (dedupe by key, newest wins). Returns records added/changed. */
export function put(kind, day, records) {
  const dir = path.join(AR, kind, day.slice(0, 7)), file = path.join(dir, day + '.ndjson.gz');
  const old = fs.existsSync(file) ? zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const m = new Map(old.map(r => [r.key, r]));
  const body = r => JSON.stringify(Object.assign({}, r, { at: undefined }));
  for (const r of records) { const c = clean(r), o = m.get(r.key); if (!o || body(o) !== body(c)) m.set(r.key, c); }   // unchanged content keeps its first 'at'
  const text = [...m.values()].sort((a, b) => String(a.key).localeCompare(String(b.key))).map(r => JSON.stringify(r)).join('\n') + '\n';
  const before = old.map(r => JSON.stringify(r)).sort().join('\n'), after = [...m.values()].map(r => JSON.stringify(r)).sort().join('\n');
  if (before === after) return 0;
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, zlib.gzipSync(text, { level: 9 }));
  written.push(file); return m.size - old.length || 1;
}
const has = (kind, key) => fs.existsSync(path.join(AR, kind, '.done', key.replace(/[^a-z0-9._-]/gi, '_')));
const mark = (kind, key) => { const d = path.join(AR, kind, '.done'); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, key.replace(/[^a-z0-9._-]/gi, '_')); fs.writeFileSync(f, ''); written.push(f); };
const getJSON = async u => { try { const r = await fetch(u); return r.ok ? r.json() : null; } catch { return null; } };

async function main() {
  const at = new Date().toISOString(), counts = {};
  const add = (k, n) => { counts[k] = (counts[k] || 0) + n; };
  // 1. daily picks (+ Analytics inputs/outputs per bet)
  const picks = read('data/picks.json');
  if (picks) {
    const recs = [], an = [];
    for (const [sec, list] of Object.entries(picks.sections || {})) for (const pk of list || []) {
      recs.push({ key: `${pk.slate_date || picks.slate_date}|${pk.id || pk.game}`, at, section: sec, slate_date: pk.slate_date || picks.slate_date, pick: pk });
      const legs = Array.isArray(pk.legs) && pk.legs.length ? pk.legs : [pk];
      legs.forEach((l, i) => { if (l.our_chance != null) an.push({ key: `${pk.id}|${i}`, at, pick_id: pk.id, market_id: l.market_id, side: l.market_side || null, market_chance: l.market_chance, analytics: l.our_chance, why: l.our_chance_why, hit_prob: pk.hit_prob ?? null }); });
    }
    add('picks', put('picks', DAY, recs)); add('analytics', put('analytics', DAY, an));
  }
  // 2. results / settlement + closing prices
  const hist = read('data/pick-history.json');
  if (hist) add('results', put('results', DAY, (hist.picks || []).filter(p => p.result && p.result !== 'pending').map(p => ({ key: p.id, at, ...p }))));
  // 3. Vegas lines (both files)
  for (const f of ['vegas-lines', 'vegas-manual']) { const v = read(`data/${f}.json`); if (v && v.lines) add('vegas', put('vegas', DAY, Object.entries(v.lines).map(([k, x]) => ({ key: `${f}|${k}|${v.updated_at || ''}`, src: f, updated_at: v.updated_at || null, market: k.split('|')[0], side: k.split('|')[1], ...x })))); }
  // 4. Trent bets + outcomes (+ dev overrides)
  const tr = read('data/trent-picks.json'), ov = read('data/trent-overrides.json');
  if (tr) add('trent', put('trent', DAY, (tr.picks || []).map(p => ({ key: p.id, at, ...p, override: (ov && ov.overrides && ov.overrides[p.id]) || null }))));
  if (flag('--no-net')) return { counts };
  // 5. Polymarket price history, once per market after its game (start + 4 h)
  const legs = [];
  for (const p of (hist && hist.picks) || []) for (const l of p.legs || []) if (l.market_id && l.start_time) legs.push(l);
  for (const l of legs) {
    if (has('prices', l.market_id) || Date.now() < Date.parse(l.start_time) + 4 * 3600e3) continue;
    const base = `https://gateway.polymarket.us/v1/price-history?symbol=${encodeURIComponent(l.market_id)}`;
    const [all, day] = await Promise.all([getJSON(base + '&fixedInterval=INTERVAL_ALL&fidelity=180'), getJSON(base + '&fixedInterval=INTERVAL_1D&fidelity=1')]);
    if (!all && !day) continue;
    const gd = ctDay(l.start_time);
    add('prices', put('prices', gd, [{ key: l.market_id, at, market_id: l.market_id, start_time: l.start_time, all_3h: (all && all.history) || [], day_1m: (day && day.history) || [] }]));
    mark('prices', l.market_id);
  }
  // 6. ESPN team results used by Analytics, once per team per day (compact rows)
  const OC = req(path.join(ROOT, 'js/our-chance.js')), teams = new Set();
  for (const l of legs) { const s = OC.parseSlug(l.market_id); if (s && OC.ESPN[s.league]) { teams.add(`${s.league}|${s.away}`); teams.add(`${s.league}|${s.home}`); } }
  for (const t of teams) {
    if (has('espn', `${DAY}|${t}`)) continue;
    const [lg, ab] = t.split('|'), gs = await OC.teamGames(lg, ab);
    if (gs.length) { add('espn', put('espn', DAY, [{ key: t, at, league: lg, team: ab, games: gs }])); mark('espn', `${DAY}|${t}`); }
  }
  return { counts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { counts } = await main();
  console.log(`Archive ${DAY}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'no changes'}.`);
  if (flag('--commit') && written.length) {
    const git = (...g) => execFileSync('git', g, { cwd: ROOT, encoding: 'utf8' }).trim();
    git('add', '--', 'data/archive'); git('commit', '-q', '-m', `Archive ${DAY}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (!flag('--no-push')) { git('pull', '-q', '--rebase', '--autostash', 'origin', 'main'); git('push', '-q', 'origin', 'HEAD:main'); }
  }
  process.exit(0);
}
