/**
 * live-kalshi.mjs — "is this Live Bets card also on Kalshi?" (Oct 20, 2026,
 * Reed's bot, with Reed's OK; see HANDOFF "For Pablo: Kalshi badges").
 *
 * After live-tick publishes a game, annotateGame() sets on every edge:
 *   kalshi: true   Kalshi lists the SAME market (same game line, or same
 *                  player + stat + "N+" threshold), verified from Kalshi's API
 *           false  we checked Kalshi's series for that kind of bet and it's not there
 *           null   we couldn't check (Kalshi down, no series for this bet type,
 *                  team totals / quarters / halves, non-game events)
 * Never true unless a Kalshi market was actually found.
 *
 * COST: free public API, no key. Per game ~2-11 GETs (one per Kalshi series),
 * cached in .cache/live-kalshi/<slug>.json for 10 min, so most ticks make 0.
 * Series tickers mirror KALSHI_SERIES in scripts/fetch-markets.mjs (that file
 * runs on import, so the table is copied, not imported).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(REPO, '.cache', 'live-kalshi');
const API = 'https://api.elections.kalshi.com/trade-api/v2';
const TTL_MS = 10 * 60e3;

/** Kalshi series per league. props: Polymarket stat words -> series. */
export const SERIES = {
  nba: { game: 'KXNBAGAME', spread: 'KXNBASPREAD', total: 'KXNBATOTAL',
    props: { points: 'KXNBAPTS', rebounds: 'KXNBAREB', assists: 'KXNBAAST', threes: 'KXNBA3PT', steals: 'KXNBASTL', blocks: 'KXNBABLK', pra: 'KXNBAPRA' } },
  wnba: { game: 'KXWNBAGAME', spread: 'KXWNBASPREAD', total: 'KXWNBATOTAL',
    props: { points: 'KXWNBAPTS', rebounds: 'KXWNBAREB', assists: 'KXWNBAAST' } },
  nhl: { game: 'KXNHLGAME', spread: 'KXNHLSPREAD', total: 'KXNHLTOTAL',
    props: { goals: 'KXNHLGOAL', points: 'KXNHLPTS', assists: 'KXNHLAST' } },
  nfl: { game: 'KXNFLGAME', spread: 'KXNFLSPREAD', total: 'KXNFLTOTAL', props: { receptions: 'KXNFLREC' } },
  mlb: { game: 'KXMLBGAME', spread: 'KXMLBSPREAD', total: 'KXMLBTOTAL',
    props: { hits: 'KXMLBHIT', 'home runs': 'KXMLBHR', strikeouts: 'KXMLBKS', 'total bases': 'KXMLBTB' } }
};
const ALIASES = { was: ['WSH'], wsh: ['WAS'], jac: ['JAX'], jax: ['JAC'], la: ['LAK', 'LAR'], sj: ['SJS'], tb: ['TBL', 'TBR'], nj: ['NJD'],
  uta: ['UTAH'], mon: ['MTL'], mtl: ['MON'], pho: ['PHX'], phx: ['PHO'], ny: ['NYK'], gs: ['GSW'], no: ['NOP'], sa: ['SAS'], lv: ['VGK'],
  cws: ['CHW'], chw: ['CWS'], az: ['ARI'], kc: ['KCR'], sd: ['SDP'], sf: ['SFG'], ath: ['OAK'] };
export const codes = abbr => [...new Set([abbr.toUpperCase(), ...(ALIASES[abbr] || [])])];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "2026-10-20" -> "26OCT20" */
export const kDate = d => d.slice(2, 4) + MON[Number(d.slice(5, 7)) - 1] + d.slice(8, 10);
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');

/** Pure: Polymarket prop question -> {player, stat, n} or null. */
export function parseProp(q) {
  const m = /Will (.+?) (?:record|score|have|get) at least (\d+) (.+?) in /i.exec(q || '');
  if (!m) return null;
  const w = m[3].toLowerCase();
  const stat = /point.*rebound.*assist/.test(w) ? 'pra' : /three|3-point/.test(w) ? 'threes'
    : /^(points?|rebounds?|assists?|steals?|blocks?|goals?|receptions?|hits?|strikeouts?)$/.test(w) ? w.replace(/s?$/, 's')
    : /home run/.test(w) ? 'home runs' : /total bases/.test(w) ? 'total bases' : null;
  return stat ? { player: m[1], stat, n: Number(m[2]) } : null;
}

/** Kalshi market -> code part of ticker: "...-BOS27" -> "BOS". */
const tail = t => (String(t).split('-').pop() || '').replace(/\d+$/, '');
const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

/**
 * Pure matcher. o = one entry from the live file's `open` list (same market_id
 * as the edge), q = the edge question, k = { ok, game, spread, total, props:{stat:[markets]} }
 * (a key missing/null = that series couldn't be fetched), team = {Celtics:'BOS',...}.
 * Returns true / false / null (see header).
 */
export function matchOne(o, q, k, team) {
  if (!k || !k.ok || !o) return null;
  if (o.period && o.period !== 'full_game') return null;     // Kalshi series here are full game only
  if (o.mtype === 'winner') {
    if (!k.game) return null;
    const want = (o.teams || []).map(t => team[t]).filter(Boolean);
    return want.length === 2 && want.every(c => k.game.some(m => tail(m.ticker) === c));
  }
  if (o.mtype === 'total') return k.total ? k.total.some(m => same(m.floor_strike, o.line)) : null;
  if (o.mtype === 'spread') {
    if (!k.spread || typeof o.line !== 'number') return null;
    const fav = o.line < 0 ? team[o.teams[0]] : team[o.teams[1]];   // the minus team
    if (!fav) return null;
    return k.spread.some(m => tail(m.ticker) === fav && same(m.floor_strike, Math.abs(o.line)));
  }
  if (o.mtype === 'prop') {
    const p = parseProp(q || o.question || (o.sides || [])[0]);
    if (!p) return null;
    const list = k.props && k.props[p.stat];
    if (!list) return null;                                   // no Kalshi series for this stat / fetch failed
    return list.some(m => norm(String(m.title).split(':')[0]) === norm(p.player) &&
      (same(m.floor_strike, p.n - 0.5) || new RegExp(`:\\s*${p.n}\\+`).test(m.title)));
  }
  return null;                                                // team totals etc.
}

async function get(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return { markets: [] };
  if (!r.ok) throw new Error(`Kalshi ${r.status}`);
  return r.json();
}

/** Fetch every series for one game (cached). Returns k for matchOne. */
export async function fetchGame(slug, needStats) {
  const m = /^([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/.exec(slug);
  const cfg = m && SERIES[m[1]];
  if (!cfg) return null;
  const file = path.join(CACHE, slug + '.json');
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (Date.now() - c.at < TTL_MS && needStats.every(s => s in c.k.props)) return c.k; } catch {}
  const d = kDate(m[4]);
  let suffix = null, game = null;
  try {
    for (const a of codes(m[2])) for (const b of codes(m[3])) for (const s of [a + b, b + a]) {
      if (suffix) break;
      const j = await get(`${API}/markets?event_ticker=${cfg.game}-${d}${s}&limit=100`);
      if ((j.markets || []).length) { suffix = d + s; game = j.markets; }
    }
  } catch { return null; }                                    // Kalshi unreachable -> null everywhere
  const k = { ok: true, event: suffix, game: game || [], spread: null, total: null, props: {} };
  const one = async series => { if (!suffix) return []; try { return (await get(`${API}/markets?event_ticker=${series}-${suffix}&limit=500`)).markets || []; } catch { return null; } };
  k.spread = await one(cfg.spread); k.total = await one(cfg.total);
  for (const s of needStats) k.props[s] = cfg.props[s] ? await one(cfg.props[s]) : null;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), k }));
  return k;
}

/** Team nickname -> Polymarket code, from "BOS Celtics vs. DET Pistons". */
export function teamMap(game) {
  const out = {};
  for (const part of String(game || '').split(/\s+vs\.?\s+/i)) {
    const [code, ...rest] = part.trim().split(' ');
    if (code && rest.length) out[rest.join(' ')] = code;
  }
  return out;
}

/** Annotate one published live file in place. Returns counts. */
export async function annotateGame(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = Object.fromEntries((d.open || []).map(o => [o.market_id, o]));
  const stats = [...new Set((d.edges || []).map(e => parseProp(e.question)?.stat).filter(Boolean))];
  const k = await fetchGame(d.slug, stats);
  const tm = teamMap(d.game);
  const team = {};   // nickname -> Kalshi code actually used in the event ticker
  for (const [nick, code] of Object.entries(tm)) {
    const ev = k && k.event ? k.event.slice(7) : '';
    team[nick] = codes(code.toLowerCase()).find(c => ev.startsWith(c) || ev.endsWith(c)) || code.toUpperCase();
  }
  const n = { yes: 0, no: 0, unchecked: 0 };
  for (const e of d.edges || []) {
    // No Kalshi event found for this game = we can't say, so null (not false).
    e.kalshi = k && k.event ? matchOne(byId[e.market_id], e.question, k, team) : null;
    n[e.kalshi === true ? 'yes' : e.kalshi === false ? 'no' : 'unchecked']++;
  }
  d.kalshi_checked = k ? { at: new Date().toISOString(), event: k.event || null } : null;
  fs.writeFileSync(file, JSON.stringify(d, null, 1) + '\n');
  return n;
}
