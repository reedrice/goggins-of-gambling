#!/usr/bin/env node
/**
 * scripts/fetch-positions.mjs — player positions from ESPN's public roster API.
 *
 * WHAT IT DOES
 *   For every player who has a prop in the market snapshot
 *   (data/markets/index.json -> events[].players), find his position in
 *   ESPN's public rosters and write data/positions.json (format: header of
 *   js/positions.js). The browser shows it as a badge ("Brock Purdy · QB").
 *
 *   node scripts/fetch-positions.mjs [--commit] [--no-push] [--force]
 *     --force   ignore the roster cache (default: rosters < 20 h old are reused)
 *   fetch-markets.mjs runs this automatically after writing the snapshot
 *   (unless --no-positions), so the daily routine needs no extra step.
 *
 * SOURCES (public, no key)
 *   teams:   https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams
 *   roster:  …/teams/{id}/roster       position {abbreviation, displayName}
 *   depth:   …/teams/{id}/depthcharts  (basketball only: the roster just
 *            says G/F/C, the depth chart says PG/SG/SF/PF/C; we take each
 *            player's highest spot in it, else the roster code)
 *   MLB rosters already say SP/RP for pitchers, so no extra step there.
 *
 * GENERIC BY DESIGN
 *   Positions and their full names come from ESPN for each league, so
 *   nothing breaks for a new sport. To cover a new Polymarket league, add
 *   one line to ESPN_PATHS (league -> ESPN sport/league path). Leagues
 *   without a path are skipped and listed in the output.
 *
 * CACHE
 *   Raw ESPN responses are kept in .cache/espn/ (git-ignored) for 20 hours,
 *   so re-running fetch-markets during the day doesn't re-download rosters.
 *
 * Unmatched players are never guessed: they get no badge and are listed in
 * positions.json -> unmatched and in the console. Writes no dollars/tokens.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = createRequire(import.meta.url)(path.join(ROOT, 'js/positions.js'));
const INDEX = path.join(ROOT, 'data/markets/index.json');
const OUT = path.join(ROOT, 'data/positions.json');
const CACHE = path.join(ROOT, '.cache/espn');
const TTL = 20 * 3600e3;
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

/** Polymarket league -> ESPN "sport/league". Add a line to cover a new league. */
const ESPN_PATHS = {
  nfl: 'football/nfl', nba: 'basketball/nba', wnba: 'basketball/wnba', nhl: 'hockey/nhl', mlb: 'baseball/mlb',
  epl: 'soccer/eng.1', eflch: 'soccer/eng.2', lal: 'soccer/esp.1', sea: 'soccer/ita.1', bun: 'soccer/ger.1', bl1: 'soccer/ger.1',
  fl1: 'soccer/fra.1', lig1: 'soccer/fra.1', mls: 'soccer/usa.1', lmx: 'soccer/mex.1',
  ucl: 'soccer/uefa.champions', uel: 'soccer/uefa.europa', uecl: 'soccer/uefa.europa.conf'
};
/** Polymarket abbreviation -> ESPN abbreviation, where they differ (same idea as js/teams.js). */
const ABBR = {
  '*': { was: 'wsh', jac: 'jax', pho: 'phx', uta: 'utah', mon: 'mtl', cws: 'chw', az: 'ari' },
  wnba: { gsv: 'gs', con: 'con' }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lc = s => String(s || '').toLowerCase();

/**
 * GET JSON with a file cache. @param {string} url @param {boolean} force
 * @returns {Promise<object|null>} null on 404 / repeated failure
 */
async function getJSON(url, force) {
  const f = path.join(CACHE, url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_') + '.json');
  if (!force && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < TTL) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.status === 404) return null;
      if (r.ok) { const j = await r.json(); fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(j)); return j; }
    } catch (e) { /* retry */ }
    await sleep(400 * 2 ** i);
  }
  return null;
}

/** ESPN team for a Polymarket team: abbreviation (with per-league aliases), full name, nickname, then a unique city match. */
function espnTeam(teams, t, lg) {
  const al = Object.assign({}, ABBR['*'], ABBR[lg] || {});
  const want = lc(al[lc(t.abbr)] || t.abbr), disp = lc(t.display);
  const n = s => P.normName(s);
  return teams.find(x => lc(x.abbreviation) === want || lc(x.abbreviation) === lc(t.abbr) || (disp && lc(x.abbreviation) === disp)) ||
    teams.find(x => t.full && n(x.displayName) === n(t.full)) ||
    teams.find(x => t.short && (n(x.name) === n(t.short) || n(x.shortDisplayName) === n(t.short))) ||
    // city only ("Golden State" -> "Golden State Valkyries"), accepted when unique
    ((c => (c.length === 1 ? c[0] : null))(teams.filter(x => t.full && n(x.displayName).startsWith(n(t.full) + ' '))));
}

/** Flatten a roster payload (grouped for NFL/NHL/MLB, flat for NBA) to [{name, pos, posName}]. */
function rosterList(d) {
  const out = [];
  const add = a => a && a.position && a.position.abbreviation && out.push({ name: a.fullName || a.displayName, pos: a.position.abbreviation, posName: a.position.displayName || a.position.name || a.position.abbreviation });
  for (const g of (d && d.athletes) || []) { if (Array.isArray(g.items)) g.items.forEach(add); else add(g); }
  return out;
}

/**
 * Basketball: each player's specific position from the depth chart (his
 * highest spot, e.g. 1st at PG beats 3rd at SG).
 * @returns {Map<string, {pos, posName}>} normName -> position
 */
function depthPositions(d) {
  const best = new Map();
  for (const chart of (d && d.depthchart) || []) {
    for (const [k, v] of Object.entries(chart.positions || {})) {
      const pos = (v.position && v.position.abbreviation) || k.toUpperCase();
      const posName = (v.position && v.position.displayName) || pos;
      (v.athletes || []).forEach((a, rank) => {
        const nm = P.normName(a.displayName || a.fullName);
        const cur = best.get(nm);
        if (!cur || rank < cur.rank) best.set(nm, { pos: pos.toUpperCase(), posName, rank });
      });
    }
  }
  return best;
}

/**
 * Build data/positions.json from the current snapshot.
 * @param {{force?:boolean, quiet?:boolean}} [opt]
 * @returns {Promise<{doc:object, summary:string[]}>}
 */
export async function refreshPositions(opt = {}) {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  // league -> { teams: Map(abbr -> team), players: [[name, abbr]] }
  const want = {};
  for (const ev of idx.events) {
    if (!(ev.players || []).length) continue;
    const w = want[ev.league] || (want[ev.league] = { teams: new Map(), players: new Map() });
    (ev.teams || []).forEach(t => w.teams.set(t.abbr, t));
    ev.players.forEach(([name, abbr]) => w.players.set(`${abbr}|${name}`, [name, abbr]));
  }
  const doc = { schema_version: 1, updated_at: new Date().toISOString(), source: 'ESPN public roster API (site.api.espn.com), matched to Polymarket US player names', leagues: {}, stats: {}, unmatched: {}, skipped_leagues: [] };
  const summary = [];
  for (const [lg, w] of Object.entries(want)) {
    const ep = ESPN_PATHS[lg];
    if (!ep) { doc.skipped_leagues.push(lg); continue; }
    const tl = await getJSON(`${BASE}/${ep}/teams?limit=200`, opt.force);
    const teams = (((tl || {}).sports || [])[0] || { leagues: [{}] }).leagues[0].teams || [];
    const espnTeams = teams.map(x => x.team);
    const basketball = ep.startsWith('basketball/');
    const rosters = new Map();   // poly abbr -> [{name,pos,posName}]
    const names = {};
    for (const [abbr, t] of w.teams) {
      const et = espnTeam(espnTeams, t, lg);
      if (!et) { console.log(`  ${lg}: no ESPN team for ${abbr} (${t.full || t.name})`); continue; }
      let list = rosterList(await getJSON(`${BASE}/${ep}/teams/${et.id}/roster`, opt.force));
      if (basketball) {
        const dp = depthPositions(await getJSON(`${BASE}/${ep}/teams/${et.id}/depthcharts`, opt.force));
        list = list.map(x => Object.assign({}, x, dp.get(P.normName(x.name)) || {}));
      }
      list.forEach(x => (names[x.pos] = names[x.pos] || x.posName));
      rosters.set(abbr, list);
    }
    const league = [...rosters.values()].flat();
    const players = {};
    const unmatched = [];
    const how = {};
    for (const [name, abbr] of w.players.values()) {
      const m = P.matchName(name, rosters.get(abbr) || [], league);
      if (m) { players[P.key(abbr, name)] = m.pos; how[m.how] = (how[m.how] || 0) + 1; }
      else unmatched.push(`${name} (${abbr})`);
    }
    const total = w.players.size, ok = Object.keys(players).length;
    doc.leagues[lg] = { names: Object.fromEntries(Object.entries(names).filter(([k]) => Object.values(players).includes(k))), players };
    doc.stats[lg] = { players: total, matched: ok, rate: total ? +(ok / total).toFixed(3) : null, by: how };
    if (unmatched.length) doc.unmatched[lg] = unmatched.sort();
    summary.push(`${lg}: ${ok}/${total} players matched (${total ? Math.round(100 * ok / total) : 0}%)${unmatched.length ? `; unmatched: ${unmatched.join(', ')}` : ''}`);
  }
  if (doc.skipped_leagues.length) summary.push(`no ESPN path (add to ESPN_PATHS): ${doc.skipped_leagues.join(', ')}`);
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  if (!opt.quiet) summary.forEach(l => console.log('Positions ' + l));
  return { doc, summary };
}

// Run directly: node scripts/fetch-positions.mjs [--commit] [--no-push] [--force]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const { summary } = await refreshPositions({ force: args.includes('--force') });
  if (args.includes('--commit')) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
    git('add', '--', 'data/positions.json');
    if (!git('diff', '--cached', '--name-only')) console.log('No position changes to commit.');
    else {
      git('commit', '-m', `Refresh player positions\n\n${summary.join('\n')}\n\nWritten by scripts/fetch-positions.mjs from ESPN's public roster API.\nNo dollar amounts or tokens.`);
      if (!args.includes('--no-push')) { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push', 'origin', 'main'); console.log('Pushed.'); }
    }
  }
}
