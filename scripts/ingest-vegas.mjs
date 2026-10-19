#!/usr/bin/env node
/**
 * scripts/ingest-vegas.mjs — add sportsbook odds READ BY HAND (e.g. from
 * bovada.lv) to data/vegas-manual.json, so Build a Bet rows, pick cards and
 * slip legs show "Vegas: +110 (Bovada)" for props the Odds API run didn't
 * cover (HANDOFF §27).
 *
 * USAGE
 *   node scripts/ingest-vegas.mjs <read-odds.json> [--dry-run] [--commit] [--no-push]
 *
 * INPUT (a file you write while reading the sportsbook):
 *   { "book": "bovada", "read_at": "2026-10-19T17:40:00Z", "source": "bovada-manual",
 *     "entries": [
 *       { "game": "nfl-was-sf-2026-10-19", "player": "Brock Purdy", "stat": "football_player_interceptions_thrown",
 *         "ou": 0.5, "over": "+110", "under": "-145" },              // over/under line X.5
 *       { "game": "nhl-sj-tor-2026-10-19", "player": "Auston Matthews", "stat": "hockey_player_goals",
 *         "plus": 1, "yes": "+115" } ] }                             // "N+" / anytime: Yes only
 *   stat = the Polymarket snapshot prop type (`smt`, see data/markets/events/*.json).
 *
 * MATCHING (exact only, nothing is guessed)
 *   Polymarket "N+" == Over (N - 0.5). So ou 252.5 matches a "253+" market
 *   and nothing else. A book line with no same-line Polymarket market is
 *   reported as unmatched and NOT written. Alt lines are separate entries.
 *   over/yes -> the market's Yes side; under/no -> its No side. Yes-only
 *   markets (anytime TD/goal, "1+ points" posted one way) get no No price.
 *   Player names match ignoring accents/case (Jose Ramirez = José Ramírez).
 *
 * OUTPUT data/vegas-manual.json, same shape as data/vegas-lines.json plus
 *   per-entry time and source: {"<market_id>|yes": {p:"+110", b:"bovada", n:1,
 *   at:"…", src:"bovada-manual"}}. Re-ingesting replaces the same keys;
 *   entries older than 36h are dropped. js/vegas.js hides entries older than
 *   36h and, when both files price a side, shows the bigger payout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data/vegas-manual.json');
const MK = path.join(ROOT, 'data/markets');
const MAX_AGE_MS = 36 * 3600e3;
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const AMERICAN = /^[+-]\d{3,5}$/;

/** Check one American odds value ("+110", "-145"); |n| >= 100. */
export const validAmerican = v => typeof v === 'string' && AMERICAN.test(v) && Math.abs(Number(v)) >= 100;

/**
 * Turn read entries into {key: value} for markets of a snapshot event.
 * Exported for tests. @param {object[]} entries @param {(slug:string)=>object|null} eventOf
 * @param {{book:string, at:string, src:string}} meta
 * @returns {{lines:object, unmatched:string[], bad:string[]}}
 */
export function match(entries, eventOf, meta) {
  const lines = {}, unmatched = [], bad = [];
  for (const e of entries || []) {
    const what = `${e.player} ${e.stat} ${e.ou !== undefined ? 'o/u ' + e.ou : (e.plus || '?') + '+'}`;
    const yes = e.over ?? e.yes, no = e.under ?? e.no;
    if ((yes !== undefined && !validAmerican(yes)) || (no !== undefined && !validAmerican(no)) || (yes === undefined && no === undefined)) { bad.push(what + ': bad odds'); continue; }
    let n;
    if (e.ou !== undefined) { n = Number(e.ou) + 0.5; if (!Number.isInteger(n)) { bad.push(what + ': o/u line must end in .5'); continue; } }
    else n = Number(e.plus);
    if (!(n >= 1)) { bad.push(what + ': no line'); continue; }
    const ev = eventOf(e.game);
    const m = ev && ev.markets.find(x => x.type === 'prop' && x.smt === e.stat && norm(x.player) === norm(e.player) && x.line === n);
    if (!m) { unmatched.push(`${e.game}: ${what} (no Polymarket ${n}+ market)`); continue; }
    const val = p => ({ p, b: meta.book, n: 1, at: meta.at, src: meta.src });
    if (yes !== undefined) lines[m.id + '|yes'] = val(yes);
    if (no !== undefined) lines[m.id + '|no'] = val(no);
  }
  return { lines, unmatched, bad };
}

// ------------------------------------------------------------------ main
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage: node scripts/ingest-vegas.mjs <read-odds.json> [--dry-run] [--commit] [--no-push]'); process.exit(2); }
  const input = JSON.parse(fs.readFileSync(file, 'utf8'));
  const at = input.read_at;
  if (!at || !isFinite(Date.parse(at))) { console.error('read_at (ISO time you read the odds) is required.'); process.exit(2); }
  const meta = { book: String(input.book || '').toLowerCase(), at: new Date(at).toISOString(), src: input.source || `${input.book}-manual` };
  if (!/^[a-z0-9_]+$/.test(meta.book)) { console.error('book (e.g. "bovada") is required.'); process.exit(2); }
  const cache = new Map();
  const eventOf = slug => {
    if (!cache.has(slug)) { try { cache.set(slug, JSON.parse(fs.readFileSync(path.join(MK, 'events', slug + '.json'), 'utf8'))); } catch (e) { cache.set(slug, null); } }
    return cache.get(slug);
  };
  const { lines, unmatched, bad } = match(input.entries, eventOf, meta);
  let doc = { schema_version: 1, source: 'Hand-read sportsbook odds (scripts/ingest-vegas.mjs)', lines: {} };
  try { doc = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* new file */ }
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries(doc.lines || {}).filter(([, v]) => now - Date.parse(v.at) <= MAX_AGE_MS));
  doc.lines = Object.assign(kept, lines);
  doc.updated_at = new Date().toISOString();
  console.log(`Matched ${Object.keys(lines).length} sides from ${(input.entries || []).length} entries (${meta.book}, read ${meta.at}).`);
  unmatched.forEach(u => console.log('  unmatched: ' + u));
  bad.forEach(u => console.log('  skipped: ' + u));
  if (flag('--dry-run')) process.exit(0);
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log(`Wrote ${OUT} (${Object.keys(doc.lines).length} sides).`);
  if (flag('--commit')) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
    git('add', '--', 'data/vegas-manual.json');
    git('commit', '-m', `Add hand-read ${meta.book} odds (${Object.keys(lines).length} sides, read ${meta.at})`);
    if (!flag('--no-push')) { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push', 'origin', 'main'); console.log('Pushed.'); }
  }
}
