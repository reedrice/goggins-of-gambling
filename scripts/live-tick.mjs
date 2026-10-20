#!/usr/bin/env node
/**
 * live-tick.mjs — ONE fast pass over every game that is about to start or is
 * live, so the Live Bets view keeps updating without a long-running watcher.
 *
 * WHY (Oct 20, 2026): during MNF WAS@SF nothing kept `live-watch.mjs watch`
 * running after the afternoon test, so data/live/nfl-was-sf-2026-10-19.json
 * stayed "pregame" from 3:39 PM CT all night. A scheduler that runs this every
 * ~10 minutes replaces the need for a babysat process.
 *
 * USAGE
 *   node scripts/live-tick.mjs [--push] [--lead 30] [--dry]
 *   node scripts/live-watch.mjs tick [--push]        (same thing)
 *
 * WHAT ONE TICK DOES
 *   1. Lists Polymarket US events (free, no key) that start within --lead
 *      minutes (default 30) or started up to 8 h ago, in the leagues
 *      live-watch.mjs knows (nfl, nba, wnba, nhl, mlb). Also re-checks any
 *      data/live/<slug>.json from the last 24 h that isn't "final" yet.
 *   2. For each game not already "final": runs `live-watch.mjs publish --slug X --players all`
 *      (every liquid player prop Polymarket lists for the game, no hand-picked list;
 *      all markets come from the ONE event request, so props cost no extra calls)
 *      (takes the opening snapshot if missing, edges, alerts, ESPN context,
 *      status pregame/live/final). Final games are never touched again.
 *   3. Rewrites data/live/index.json (list of games for the view).
 *   4. With --push: commits data/live/ and pushes to main, ONLY if git sees a
 *      change there. Without --push it never touches git.
 * Exits 0 even when one game fails (logged), so a scheduler won't spam errors.
 *
 * PRIVACY: prices only. No Odds API calls (no ODDS_API_KEY use), no dollar
 * amounts, no keys. Discord is NOT posted from here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const LIVE = path.join(REPO, 'data', 'live');
const GATEWAY = 'https://gateway.polymarket.us';
const LEAGUES = ['nfl', 'nba', 'wnba', 'nhl', 'mlb'];
const GAME = /^([a-z0-9]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/;
const args = process.argv.slice(2);
const flag = k => args.includes('--' + k);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

/** Pure: should this game get a publish now? (tested) */
export function shouldTick({ start, status }, nowMs, leadMin = 30) {
  if (status === 'final') return false;
  const s = Date.parse(start);
  if (isNaN(s)) return false;
  return s - nowMs <= leadMin * 60e3 && nowMs - s <= 24 * 3600e3;
}

/** Pure: build index.json from published game files. */
export function buildIndex(files) {
  const games = files.map(d => ({ slug: d.slug, game: d.game, status: d.status, start_time: d.start_time, updated: d.updated }))
    .filter(g => g.slug).sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));
  return { _note: 'Games published by scripts/live-tick.mjs. Prices live in <slug>.json. No dollar amounts.', games };
}

const readPublished = () => fs.readdirSync(LIVE).filter(f => GAME.test(f.replace(/\.json$/, '')) && f.endsWith('.json'))
  .map(f => { try { return JSON.parse(fs.readFileSync(path.join(LIVE, f), 'utf8')); } catch { return null; } }).filter(Boolean);

async function listGames(nowMs, leadMin) {
  const min = new Date(nowMs - 8 * 3600e3).toISOString(), max = new Date(nowMs + leadMin * 60e3).toISOString();
  const out = [];
  for (let off = 0; off < 2000; off += 200) {
    const r = await fetch(`${GATEWAY}/v1/events?limit=200&offset=${off}&active=true&closed=false&startDateMin=${min}&startDateMax=${max}`);
    if (!r.ok) throw new Error(`Polymarket US list returned ${r.status}`);
    const page = (await r.json()).events || [];
    out.push(...page);
    if (page.length < 200) break;
  }
  return out.filter(e => { const m = GAME.exec(e.slug || ''); return m && LEAGUES.includes(m[1]); })
    .map(e => ({ slug: e.slug, start: e.startTime || e.startDate }));
}

/** --dry helper: how many game lines / props the publish would watch (one free request). */
async function propCount(slug) {
  try {
    const { selectMarkets, sportOf } = await import('./live-watch.mjs');
    const r = await fetch(`${GATEWAY}/v1/events/slug/${slug}`); const j = await r.json();
    const ms = selectMarkets(j.event || j, sportOf(slug), ['all']);
    const props = ms.filter(m => m.group === 'prop');
    return `(${ms.length - props.length} game lines, ${props.length} props, ${new Set(props.map(m => m.player)).size} players)`;
  } catch (e) { return `(count failed: ${e.message})`; }
}

export async function tick() {
  const now = Date.now(), lead = Number(opt('lead', 30));
  fs.mkdirSync(LIVE, { recursive: true });
  const pub = Object.fromEntries(readPublished().map(d => [d.slug, d]));
  const cands = new Map();
  try { for (const g of await listGames(now, lead)) cands.set(g.slug, g); }
  catch (e) { console.error('tick: could not list games:', e.message); }
  for (const d of Object.values(pub)) if (!cands.has(d.slug)) cands.set(d.slug, { slug: d.slug, start: d.start_time });
  const todo = [...cands.values()].filter(g => shouldTick({ start: g.start, status: pub[g.slug]?.status }, now, lead));
  console.log(`tick ${new Date(now).toISOString()}: ${cands.size} candidate game(s), ${todo.length} to update`);
  let ok = 0;
  for (const g of todo) {
    if (flag('dry')) { console.log('  would publish', g.slug, await propCount(g.slug)); continue; }
    try {
      const o = execFileSync(process.execPath, [path.join(HERE, 'live-watch.mjs'), 'publish', '--slug', g.slug, '--players', 'all'],
        { cwd: REPO, timeout: 90e3, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(`  ${g.slug}: ${o.trim().split('\n').pop()}`); ok++;
    } catch (e) { console.error(`  ${g.slug}: publish failed: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
  }
  if (!flag('dry')) {
    const idx = buildIndex(readPublished());
    const file = path.join(LIVE, 'index.json'), txt = JSON.stringify(idx, null, 1) + '\n';
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== txt) fs.writeFileSync(file, txt);
  }
  if (flag('push') && !flag('dry')) push(ok);
}

function push(n) {
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' });
  if (!git('status', '--porcelain', '--', 'data/live').trim()) { console.log('tick: no data/live changes, nothing to push'); return; }
  git('add', '--', 'data/live');
  git('commit', '-q', '-m', `live: tick update (${n} game(s)) ${new Date().toISOString().slice(0, 16)}Z`);
  try { git('pull', '-q', '--rebase', '--autostash', 'origin', 'main'); git('push', '-q', 'origin', 'HEAD:main'); console.log('tick: pushed'); }
  catch (e) { console.error('tick: push failed (commit kept locally, next tick retries):', String(e.stderr || e.message).trim().split('\n').pop()); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  tick().catch(e => { console.error('live-tick error:', e.message); process.exit(0); });
}
