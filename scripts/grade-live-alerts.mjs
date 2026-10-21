#!/usr/bin/env node
/**
 * scripts/grade-live-alerts.mjs — permanent, graded record of live alerts.
 *
 * OWNERSHIP: this script and data/live-record.json are REED'S BOT'S files.
 * data/live/ and scripts/live-* are Pablo's (Richie's bot): we only READ
 * data/live/*.json here, never write there (HANDOFF §32, §35).
 *
 * WHAT IT DOES (run any time; safe to repeat)
 *   1. Reads every data/live/*.json. Each "bet" alert (type "new_edge", or the
 *      older watcher format with no type) becomes one entry in
 *      data/live-record.json, keyed by the alert id. Entries are NEVER deleted
 *      or rewritten once logged, even if Pablo's file later drops the alert
 *      (his file keeps only the newest 50). Losses stay.
 *   2. Grades every pending entry from the REAL Polymarket US settlement
 *      (public gateway /v1/events/slug/<game>): when the market is closed the
 *      side priced "1" won, "0" lost; settled at a middle price = push;
 *      archived/closed with no price = void. Not settled yet = stays pending.
 *      Nothing is guessed.
 *   3. Totals per tier (big / slight) and overall: W-L-P, hit rate, units at a
 *      flat 1 unit per alert (win pays the American odds at alert time), ROI,
 *      expected win rate (the alert price's own chance) vs actual, sample size.
 *
 * USAGE
 *   node scripts/grade-live-alerts.mjs            # update data/live-record.json
 *   node scripts/grade-live-alerts.mjs --dry-run  # print, write nothing
 *   node scripts/grade-live-alerts.mjs --commit   # update + commit + pull --rebase + push (only if changed)
 *
 * PRIVACY: American odds and chance points only. Units are a flat 1u, never
 * dollars; no "$" text, no cents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_DIR = path.join(ROOT, 'data/live');          // Pablo's, read-only
const OUT = path.join(ROOT, 'data/live-record.json');   // ours
const GATEWAY = 'https://gateway.polymarket.us';
const RESULTS = ['pending', 'win', 'loss', 'push', 'void'];

/** Chance points (0-100) -> American odds text ("+150" / "-150"; 50 = "+100"). */
export function american(c) {
  c = Number(c);
  if (!(c > 0 && c < 100)) return null;
  return c > 50 ? `-${Math.round(100 * c / (100 - c))}` : `+${Math.round(100 * (100 - c) / c)}`;
}
/** American odds -> chance points. */
export function chanceOf(odds) {
  const n = Number(String(odds || '').replace('−', '-'));
  if (!n || Math.abs(n) < 100) return null;
  return n > 0 ? 10000 / (n + 100) : (100 * -n) / (-n + 100);
}
/** Profit of a 1u win at these American odds. */
export function winUnits(odds) {
  const n = Number(String(odds || '').replace('−', '-'));
  return n > 0 ? n / 100 : n < 0 ? 100 / -n : null;
}
const ct = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

/**
 * Turn one of Pablo's alert docs into record entries (pure). Only bet alerts
 * ("new_edge", or no type = older watcher format). side_index 0 = the market's
 * "Yes"/first side, 1 = the other; from the alert key "<market>:<n>", else by
 * matching the side text to the snapshot's sides, else null (can't grade).
 */
export function entriesFrom(doc, fileSlug) {
  const slug = doc.slug || fileSlug;
  const opens = Object.fromEntries((doc.open || []).map(o => [String(o.market_id), o]));
  const edges = Object.fromEntries((doc.edges || []).map(e => [e.key, e]));
  const out = [];
  for (const a of doc.alerts || []) {
    if (!a || (a.type && a.type !== 'new_edge') || !a.at || isNaN(Date.parse(a.at))) continue;
    const mid = String(a.market_id || (a.key || '').split(':')[0] || '');
    if (!mid) continue;
    const o = opens[mid];
    let idx = /:(\d)$/.test(a.key || '') ? Number(a.key.slice(-1)) : null;
    if (idx == null && o && Array.isArray(o.sides)) { const i = o.sides.indexOf(a.side); if (i >= 0) idx = i; }
    const atOdds = a.now_odds || american(a.now_chance);
    const e = edges[a.key] || {};
    const openOdds = a.open_odds || e.open_odds || (o && idx != null ? american(idx === 0 ? o.yes_buy : o.no_buy) : null);
    out.push({
      id: String(a.id || `${slug}|${mid}|${idx}|${a.at}`), at: a.at, time_ct: ct(a.at), game: doc.game || doc.title || slug, slug,
      market: a.market || a.kind || (o && o.market) || null, market_id: mid, side: a.side || null, side_index: idx,
      tier: a.tier === 'big' || a.tier === 'slight' ? a.tier : 'untiered',
      odds_at_alert: atOdds || null, opening_odds: openOdds || null, edge_pts: typeof a.edge === 'number' ? a.edge : null,
      link: /^https:\/\//.test(a.url || '') ? a.url : (/^https:\/\//.test(doc.url || '') ? doc.url : null),
      result: 'pending', graded_at: null, graded_from: null
    });
  }
  return out;
}

/** Merge new entries in; existing ids are kept exactly as they are (never deleted). */
export function mergeEntries(record, fresh) {
  const have = new Set(record.entries.map(e => e.id));
  let added = 0;
  for (const e of fresh) if (!have.has(e.id)) { record.entries.push(e); have.add(e.id); added++; }
  record.entries.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  return added;
}

/**
 * Result of one entry from a Polymarket US event payload (pure).
 * @returns {'win'|'loss'|'push'|'void'|null} null = not settled yet / can't tell
 */
export function gradeFrom(ev, entry) {
  const e = (ev && ev.event) || ev || {};
  const m = (e.markets || []).find(x => String(x.id) === entry.market_id);
  if (!m || entry.side_index == null) return null;
  if (!m.closed) return null;
  const long = (m.marketSides || []).find(s => s.long);
  const p = long && long.price !== undefined && long.price !== '' ? Number(long.price) : NaN;
  if (isNaN(p)) return m.archived ? 'void' : null;
  if (p !== 0 && p !== 1) return 'push';
  const yesWon = p === 1;
  return (entry.side_index === 0) === yesWon ? 'win' : 'loss';
}

/** Totals for a list of entries (pure). Flat 1u per graded win/loss. */
export function totals(list) {
  let w = 0, l = 0, p = 0, v = 0, pending = 0, units = 0, risked = 0, expSum = 0, expN = 0;
  for (const e of list) {
    if (e.result === 'pending') { pending++; continue; }
    if (e.result === 'push') { p++; continue; }
    if (e.result === 'void') { v++; continue; }
    const wu = winUnits(e.odds_at_alert), ch = chanceOf(e.odds_at_alert);
    if (wu == null) continue;
    risked += 1;
    if (e.result === 'win') { w++; units += wu; } else { l++; units -= 1; }
    if (ch != null) { expSum += ch; expN++; }
  }
  const n = w + l;
  return { n: list.length, graded: n, w, l, p, void: v, pending,
    hit_rate: n ? +(100 * w / n).toFixed(1) : null, units: +units.toFixed(2), roi: risked ? +(100 * units / risked).toFixed(1) : null,
    expected_rate: expN ? +(expSum / expN).toFixed(1) : null };
}

export function sportCategory(entry) {
 const league=String(entry.slug || '').split('-')[0].toLowerCase();
 if(['cfb','ncaaf'].includes(league))return 'ncaaf';
 if(['cbb','ncaab','ncaam'].includes(league))return 'ncaab';
 if(['ncaaw','wncaab'].includes(league))return 'wncaab';
 if(['atp','wta','atpdb','wtadb','sixkings','tennis'].includes(league))return 'tennis';
 if(['epl','ucl','uel','uecl','lal','sea','bun','bl1','fl1','lig1','mls','lmx','eflch'].includes(league))return 'soccer';
 if(['pga','lpga','dpwt','pgatc','golf'].includes(league))return 'golf';
 return ['nba','wnba','nfl','nhl','mlb'].includes(league) ? league : 'other';
}
export function summarize(record) {
  const by = t => record.entries.filter(e => e.tier === t);
  record.totals = { all: totals(record.entries), big: totals(by('big')), slight: totals(by('slight')) };
  if (by('untiered').length) record.totals.untiered = totals(by('untiered'));
  const categories=['nba','wnba','nfl','ncaaf','ncaab','wncaab','nhl','mlb','soccer','tennis','golf'];
  const grouped=new Map(categories.map(k=>[k,[]]));
  for(const e of record.entries){const k=sportCategory(e);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(e);}
  record.by_sport=Object.fromEntries([...grouped].map(([key,entries])=>[key,totals(entries)]));
  return record;
}

const evCache = new Map();
const fetchEvent = slug => evCache.get(slug) || evCache.set(slug, fetch(`${GATEWAY}/v1/events/slug/${slug}`).then(r => (r.ok ? r.json() : null)).catch(() => null)).get(slug);

async function main() {
  const args = process.argv.slice(2);
  const record = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { schema_version: 1, entries: [] };
  const before = JSON.stringify(record.entries);
  let added = 0;
  for (const f of fs.existsSync(LIVE_DIR) ? fs.readdirSync(LIVE_DIR).filter(x => x.endsWith('.json')) : []) {
    let doc; try { doc = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, f), 'utf8')); } catch (e) { console.warn('skip unreadable', f); continue; }
    added += mergeEntries(record, entriesFrom(doc, f.replace(/(-alerts)?\.json$/, '')));
  }
  let graded = 0;
  for (const e of record.entries.filter(x => x.result === 'pending')) {
    const r = gradeFrom(await fetchEvent(e.slug), e);
    if (r) { e.result = r; e.graded_at = new Date().toISOString(); e.graded_from = `Polymarket US settlement (${GATEWAY}/v1/events/slug/${e.slug})`; graded++; }
  }
  summarize(record);
  record.note = 'Every live alert, logged for good and graded on real Polymarket US results. Flat 1 unit per alert. Small samples are noisy: a few games can swing these numbers a lot.';
  const changed = JSON.stringify(record.entries) !== before;
  if (changed || !record.updated_at) record.updated_at = new Date().toISOString();
  const t = record.totals.all;
  console.log(`${added} new alert(s), ${graded} graded. All: ${t.w}-${t.l}-${t.p} (${t.hit_rate ?? '–'}% vs ${t.expected_rate ?? '–'}% expected), ${t.units}u, ROI ${t.roi ?? '–'}%, ${t.pending} pending, ${t.n} logged.`);
  if (args.includes('--dry-run')) return;
  fs.writeFileSync(OUT, JSON.stringify(record, null, 1) + '\n');
  if (args.includes('--commit') && changed) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
    git('add', '--', 'data/live-record.json');
    git('commit', '-q', '-m', `Live alerts record: ${added} new, ${graded} graded (all-time ${t.w}-${t.l}-${t.p}, ${t.units}u)`);
    git('pull', '-q', '--rebase'); git('push', '-q', 'origin', 'HEAD:main');
  } else if (args.includes('--commit')) console.log('No change, no commit.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('grade-live-alerts:', e.message); process.exit(1); });
