#!/usr/bin/env node
/**
 * scripts/fetch-book-odds.mjs — daily "other apps" price check via The Odds API.
 *
 * PURPOSE
 *   For every pick and parlay leg in data/picks.json that names a Polymarket
 *   US market (market_id + market_side), look up the same bet at the
 *   sportsbooks in APP_CONFIG.platforms and record how their price compares
 *   with Polymarket US at the same moment. Output: data/book-odds.json,
 *   which feeds the Record tab's "From odds feed" column and the
 *   "Other apps" line on pick cards. Schema: HANDOFF.md §17.
 *
 * USAGE (run after update-picks.mjs and fetch-markets.mjs)
 *   ODDS_API_KEY=… node scripts/fetch-book-odds.mjs [--commit] [--no-push]
 *       [--max-credits 12] [--floor 50] [--no-props] [--dry-run]
 *     --max-credits N  most credits ONE run may spend (default 12). If the
 *                      plan is over budget, player props are dropped first.
 *     --floor N        never let the account go below N remaining credits
 *                      (default 50); the run stops cleanly instead.
 *     --no-props       game lines only (who wins / spread / total)
 *     --dry-run        show the plan and its cost, make no paid calls
 *     --commit         commit data/book-odds.json (+ push unless --no-push)
 *
 * THE KEY
 *   Read only from process.env.ODDS_API_KEY. It is never printed, logged,
 *   written to disk or committed: URLs are logged without their query string
 *   and error messages are scrubbed.
 *
 * BUDGET (free plan: 500 credits/month)
 *   Cost of /v4/sports/{sport}/odds = (number of markets) x (regions). We
 *   pass `bookmakers=` with <= 10 books, which counts as ONE region, and we
 *   only request the market types today's picks actually use. Per-game player
 *   props (/events/{id}/odds) cost 1 credit per prop market per game and are
 *   only fetched for games we have a prop pick in, if the total still fits
 *   --max-credits. A typical day (3 sports + 1-2 prop games) is 6-12
 *   credits, i.e. at most ~370/month at the default cap. /v4/sports and
 *   /v4/sports/{sport}/events are free.
 *
 * MATCHING
 *   game     Odds API event whose home/away teams match the Polymarket game's
 *            two teams (full name or nickname) and starts within 36h of it.
 *   h2h      outcome.name = our side's team
 *   spreads  outcome.name = our side's team AND outcome.point = our signed line
 *            (parsed from the side label, e.g. "Guardians +1.5")
 *   totals   outcome.name = Over|Under AND point = line
 *   props    outcome.description = player; Polymarket "N+" == Over N-0.5;
 *            anytime-TD / anytime-goal markets use outcome.name "Yes"
 *   Price = American odds -> cents (implied chance incl. the book's fee),
 *   compared with the live Polymarket US cost of the same side
 *   (gateway.polymarket.us bbo, falling back to the snapshot).
 *   diff = book cents - Polymarket cents (positive = that app charges more).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Core = require(path.join(ROOT, 'js/markets-core.js'));
const PICKS = path.join(ROOT, 'data/picks.json');
const OUT = path.join(ROOT, 'data/book-odds.json');
const MK_DIR = path.join(ROOT, 'data/markets');
const API = 'https://api.the-odds-api.com/v4';
const KEEP_DAYS = 60;   // history kept in book-odds.json

// ------------------------------------------------------------------ config

/** APP_CONFIG from config.js (a browser script), evaluated in a sandbox. */
function loadConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx);
  return ctx.window.APP_CONFIG;
}
const CFG = loadConfig();
/** Odds API bookmaker key -> our platform id (only books in our list). */
const BOOK_TO_PLATFORM = Object.fromEntries(CFG.platforms.filter(p => p.oddsApi && p.id !== 'polymarket_us').map(p => [p.oddsApi, p.id]));
const BOOKMAKERS = Object.keys(BOOK_TO_PLATFORM);   // 8 keys -> 1 "region" of cost

/** Polymarket league -> Odds API sport key. Add here to cover more sports. */
const SPORT_KEYS = { nfl: 'americanfootball_nfl', nhl: 'icehockey_nhl', mlb: 'baseball_mlb', nba: 'basketball_nba', wnba: 'basketball_wnba' };
/** Polymarket game-line type -> Odds API featured market. */
const LINE_MARKETS = { moneyline: 'h2h', spread: 'spreads', total: 'totals' };
/**
 * Polymarket prop type (smt) -> Odds API player market. `yes` = the market
 * is a Yes-only "anytime" market (no line). Function form picks by line.
 */
const PROP_MARKETS = {
  football_player_receptions: 'player_receptions',
  football_player_interceptions_thrown: 'player_pass_interceptions',
  football_player_passing_touchdowns: 'player_pass_tds',
  football_player_passing_yards: 'player_pass_yds',
  football_player_rushing_yards: 'player_rush_yds',
  football_player_receiving_yards: 'player_reception_yds',
  football_player_touchdowns: line => (line === 1 ? 'player_anytime_td' : null),
  hockey_player_goals: line => (line === 1 ? 'player_goal_scorer_anytime' : 'player_goals'),
  hockey_player_points: 'player_points',
  hockey_player_assists: 'player_assists',
  baseball_player_hits: 'batter_hits',
  baseball_player_home_runs: 'batter_home_runs',
  baseball_player_strikeouts: 'pitcher_strikeouts',
  baseball_player_total_bases: 'batter_total_bases',
  basketball_player_points: 'player_points',
  basketball_player_rebounds: 'player_rebounds',
  basketball_player_assists: 'player_assists',
  basketball_player_threes: 'player_threes'
};
const YES_ONLY = new Set(['player_anytime_td', 'player_goal_scorer_anytime']);

// ------------------------------------------------------------------ args/util

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const num = (f, d) => { const i = args.indexOf(f); const v = i >= 0 ? Number(args[i + 1]) : NaN; return isFinite(v) ? v : d; };
const MAX_CREDITS = num('--max-credits', 12);
const FLOOR = num('--floor', 50);
const KEY = process.env.ODDS_API_KEY || '';
const scrub = s => (KEY ? String(s).split(KEY).join('***') : String(s));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** American odds -> cents (implied chance, 1 decimal). */
function americanToCents(a) {
  const n = Number(a);
  if (!isFinite(n) || n === 0 || (n > -100 && n < 100)) return null;
  return Math.round((n > 0 ? 100 / (n + 100) : -n / (-n + 100)) * 1000) / 10;
}
const fmtAmerican = a => (a > 0 ? '+' + a : String(a));

let credits = { remaining: null, used: null, spent: 0 };

/**
 * GET an Odds API path. The key is appended here and never logged.
 * @param {string} p path after /v4, e.g. "/sports" @param {object} q query params
 * @returns {Promise<any>}
 */
async function odds(p, q = {}) {
  const u = new URL(API + p);
  Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set('apiKey', KEY);
  let r;
  try { r = await fetch(u); } catch (e) { throw new Error(`network error on ${p}: ${scrub(e.message)}`); }
  const rem = r.headers.get('x-requests-remaining'), last = r.headers.get('x-requests-last');
  if (rem !== null) credits.remaining = Number(rem);
  if (r.headers.get('x-requests-used') !== null) credits.used = Number(r.headers.get('x-requests-used'));
  if (last !== null) credits.spent += Number(last) || 0;
  console.log(`  GET ${p}${q.markets ? ' [' + q.markets + ']' : ''} -> ${r.status}, cost ${last ?? '?'}, remaining ${rem ?? '?'}`);
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}: ${scrub((await r.text()).slice(0, 200))}`);
  return r.json();
}

/** Live Polymarket US cost (cents) of one side; null if unavailable. */
async function polyPrice(marketId, side) {
  try {
    const r = await fetch(`${Core.GATEWAY}/v1/markets/${encodeURIComponent(marketId)}/bbo`);
    if (!r.ok) return null;
    const p = Core.bboPrices(await r.json());
    return side === 'no' ? p.no_cost : p.yes_ask;
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ targets

/**
 * Every distinct (market_id, side) used by a pick or leg, with refs back to
 * the picks, joined to the Polymarket snapshot for type/line/teams.
 * @returns {{slate:string, targets:object[], missing:string[]}}
 */
function loadTargets() {
  const picks = JSON.parse(fs.readFileSync(PICKS, 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(MK_DIR, 'index.json'), 'utf8'));
  const markets = {};
  for (const e of index.events) {
    let ev;
    try { ev = JSON.parse(fs.readFileSync(path.join(MK_DIR, e.file), 'utf8')); } catch (x) { continue; }
    ev.markets.forEach(m => (markets[m.id] = { ev, m }));
  }
  const byKey = new Map(), missing = [];
  const add = (o, pick_id, leg) => {
    if (!o.market_id || !['yes', 'no'].includes(o.market_side)) return;
    const k = o.market_id + '|' + o.market_side;
    if (!byKey.has(k)) {
      const hit = markets[o.market_id];
      if (!hit) { missing.push(o.market_id); return; }
      byKey.set(k, { market_id: o.market_id, side: o.market_side, ev: hit.ev, m: hit.m, refs: [] });
    }
    byKey.get(k).refs.push({ pick_id, leg });
  };
  Object.values(picks.sections || {}).forEach(list => (list || []).forEach(p => {
    add(p, p.id, null);
    (p.legs || []).forEach((l, i) => add(l, p.id, i));
  }));
  return { slate: picks.slate_date, targets: [...byKey.values()], missing: [...new Set(missing)] };
}

/** Odds API market key for a target, or null if we can't price it. */
function oddsMarketFor(t) {
  if (LINE_MARKETS[t.m.type]) return LINE_MARKETS[t.m.type];
  if (t.m.type === 'prop') {
    const v = PROP_MARKETS[t.m.smt];
    return typeof v === 'function' ? v(t.m.line) : v || null;
  }
  return null;
}

/** Our side's label ("Guardians +1.5", "Under 6.5", "Yes"). */
const sideLabel = t => (t.side === 'yes' ? t.m.side_yes_label : t.m.side_no_label);
/** Our side's team object (moneyline/spread), from the snapshot event. */
function sideTeam(t) {
  const abbr = t.side === 'yes' ? t.m.yes_team : t.m.no_team;
  return (t.ev.teams || []).find(x => x.abbr === abbr) || null;
}
/** Does an Odds API team name refer to this snapshot team? */
function sameTeam(name, team) {
  if (!team) return false;
  const n = norm(name);
  return n === norm(team.name) || (team.short && n.endsWith(norm(team.short)));
}

/** Find the Odds API event for a snapshot game (both teams, start within 36h). */
function findEvent(list, ev) {
  const [A, B] = ev.teams || [];
  const t0 = Date.parse(ev.start_time);
  return (list || []).find(o =>
    Math.abs(Date.parse(o.commence_time) - t0) < 36 * 3600e3 &&
    ((sameTeam(o.home_team, A) && sameTeam(o.away_team, B)) || (sameTeam(o.home_team, B) && sameTeam(o.away_team, A)))) || null;
}

/** The bookmaker outcome matching our side, or null. */
function findOutcome(t, mkey, outcomes) {
  const lab = sideLabel(t);
  if (mkey === 'h2h') return outcomes.find(o => sameTeam(o.name, sideTeam(t)));
  if (mkey === 'spreads') {
    const pt = Number((/([+-]\d+(?:\.\d+)?)\s*$/.exec(lab) || [])[1]);
    return isFinite(pt) ? outcomes.find(o => sameTeam(o.name, sideTeam(t)) && Math.abs(o.point - pt) < 1e-6) : null;
  }
  if (mkey === 'totals') {
    const want = /^under/i.test(lab) ? 'under' : 'over';
    return outcomes.find(o => norm(o.name) === want && Math.abs(o.point - t.m.line) < 1e-6);
  }
  // player props
  const player = norm(t.m.player);
  const mine = outcomes.filter(o => norm(o.description) === player);
  if (YES_ONLY.has(mkey)) return mine.find(o => norm(o.name) === t.side);
  const want = t.side === 'yes' ? 'over' : 'under';
  return mine.find(o => norm(o.name) === want && Math.abs(o.point - (t.m.line - 0.5)) < 1e-6);
}

// ------------------------------------------------------------------ main

if (!KEY && !flag('--dry-run')) { console.error('ODDS_API_KEY is not set. Nothing fetched.'); process.exit(2); }

const { slate, targets, missing } = loadTargets();
if (missing.length) console.log(`Not in the market snapshot (run fetch-markets first?): ${missing.join(', ')}`);

// Plan: featured markets per sport, prop markets per game.
const plan = {};   // league -> {lines:Set, props: Map<eventSlug, Set>}
const unpriceable = [];
for (const t of targets) {
  const sk = SPORT_KEYS[t.ev.league], mk = oddsMarketFor(t);
  if (!sk || !mk) { unpriceable.push(t.market_id); continue; }
  t.mkey = mk;
  const p = plan[t.ev.league] || (plan[t.ev.league] = { lines: new Set(), props: new Map() });
  if (t.m.type === 'prop') { if (!p.props.has(t.ev.slug)) p.props.set(t.ev.slug, new Set()); p.props.get(t.ev.slug).add(mk); }
  else p.lines.add(mk);
}
const lineCost = Object.values(plan).reduce((s, p) => s + p.lines.size, 0);
const propCost = Object.values(plan).reduce((s, p) => s + [...p.props.values()].reduce((a, x) => a + x.size, 0), 0);
let withProps = !flag('--no-props') && propCost > 0;
let propsNote = flag('--no-props') ? 'skipped (--no-props)' : propCost ? '' : 'none needed';
if (withProps && lineCost + propCost > MAX_CREDITS) { withProps = false; propsNote = `skipped: ${lineCost + propCost} credits would exceed --max-credits ${MAX_CREDITS}`; }
const planned = lineCost + (withProps ? propCost : 0);
console.log(`Slate ${slate}: ${targets.length} distinct picks/legs to price (${unpriceable.length} without an Odds API market).`);
for (const [lg, p] of Object.entries(plan)) console.log(`  ${lg}: lines [${[...p.lines].join(', ') || '-'}], prop games ${p.props.size} [${[...p.props.values()].map(s => [...s].join('+')).join('; ') || '-'}]`);
console.log(`Planned cost: ${planned} credits (lines ${lineCost}, props ${withProps ? propCost : 0}${propsNote ? '; props ' + propsNote : ''}).`);
if (flag('--dry-run')) process.exit(0);

// Free call: confirms the key, the sports in season, and the remaining credits.
const sports = await odds('/sports');
const active = new Set(sports.filter(s => s.active).map(s => s.key));
if (credits.remaining !== null && credits.remaining - planned < FLOOR) {
  console.log(`Stopping: ${credits.remaining} credits left; this run needs ${planned} and the floor is ${FLOOR}. book-odds.json left unchanged.`);
  process.exit(0);
}

const fetchedAt = new Date().toISOString();
const quotes = new Map();   // target key -> [{book, outcome}]
const booksSeen = new Set();
const keyOf = t => t.market_id + '|' + t.side;
const take = (t, bookmakers, mkey) => {
  for (const b of bookmakers || []) {
    const pid = BOOK_TO_PLATFORM[b.key];
    if (!pid) continue;
    booksSeen.add(pid);
    const mk = (b.markets || []).find(x => x.key === mkey);
    const o = mk && findOutcome(t, mkey, mk.outcomes || []);
    if (o && isFinite(o.price)) {
      if (!quotes.has(keyOf(t))) quotes.set(keyOf(t), []);
      quotes.get(keyOf(t)).push({ book: pid, odds_api_key: b.key, price: o.price });
    }
  }
};
const canSpend = n => credits.remaining === null || credits.remaining - n >= FLOOR;

for (const [lg, p] of Object.entries(plan)) {
  const sk = SPORT_KEYS[lg];
  if (!active.has(sk)) { console.log(`  ${lg}: not in season per /sports, skipped`); continue; }
  const mine = targets.filter(t => t.ev.league === lg && t.mkey);
  let events = null;
  if (p.lines.size && canSpend(p.lines.size)) {
    events = await odds(`/sports/${sk}/odds`, { bookmakers: BOOKMAKERS.join(','), markets: [...p.lines].join(','), oddsFormat: 'american' });
    for (const t of mine.filter(x => x.m.type !== 'prop')) {
      const oe = findEvent(events, t.ev);
      if (oe) take(t, oe.bookmakers, t.mkey);
    }
  }
  if (withProps && p.props.size) {
    if (!events) events = await odds(`/sports/${sk}/events`);   // free: event ids only
    for (const [slug, mkeys] of p.props) {
      const ev = mine.find(t => t.ev.slug === slug).ev;
      const oe = findEvent(events, ev);
      if (!oe) { console.log(`  ${slug}: no matching Odds API game for props`); continue; }
      if (!canSpend(mkeys.size)) { console.log(`  ${slug}: props skipped to stay above the ${FLOOR}-credit floor`); continue; }
      const d = await odds(`/sports/${sk}/events/${oe.id}/odds`, { bookmakers: BOOKMAKERS.join(','), markets: [...mkeys].join(','), oddsFormat: 'american' });
      for (const t of mine.filter(x => x.ev.slug === slug && x.m.type === 'prop')) take(t, d.bookmakers, t.mkey);
    }
  }
}

// Build rows (Polymarket price taken now, right after the book prices).
const rows = [];
for (const t of targets) {
  const qs = quotes.get(keyOf(t));
  if (!qs || !qs.length) continue;
  let pm = await polyPrice(t.market_id, t.side);
  if (pm === null) pm = t.side === 'no' ? t.m.no_cost : t.m.yes_ask;
  if (!(pm > 0 && pm < 100)) continue;
  for (const q of qs) {
    const c = americanToCents(q.price);
    if (c === null) continue;
    rows.push({
      date: slate, market_id: t.market_id, side: t.side,
      label: `${sideLabel(t) === 'Yes' || sideLabel(t) === 'No' ? t.m.label + ' — ' + sideLabel(t) : sideLabel(t)}`,
      refs: t.refs, book: q.book, odds_api_key: q.odds_api_key,
      book_price: fmtAmerican(q.price), book_chance: c, polymarket_price: pm,
      diff: Math.round((c - pm) * 10) / 10, fetched_at: fetchedAt
    });
  }
}

// Merge with history: replace today's rows, keep KEEP_DAYS of past days.
let doc = {};
try { doc = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* new file */ }
const cutoff = new Date(Date.parse(slate + 'T12:00:00Z') - KEEP_DAYS * 86400e3).toISOString().slice(0, 10);
const history = (doc.comparisons || []).filter(r => r && r.date !== slate && r.date >= cutoff && Array.isArray(r.refs));
const comparisons = [...history, ...rows];
const books = {};
for (const r of comparisons) { const b = books[r.book] || (books[r.book] = { priced: 0, sum: 0 }); b.priced++; b.sum += r.diff; }
Object.values(books).forEach(b => { b.avg_diff = Math.round((b.sum / b.priced) * 100) / 100; delete b.sum; });

const out = {
  schema_version: 1,
  status: 'active',
  updated_at: fetchedAt,
  source: 'The Odds API (https://the-odds-api.com) + live Polymarket US prices',
  baseline: 'polymarket_us',
  last_run: {
    at: fetchedAt, slate_date: slate,
    sports: Object.keys(plan), books_requested: BOOKMAKERS, books_returned: [...booksSeen].sort(),
    priced_today: new Set(rows.map(r => r.market_id + '|' + r.side)).size, targets: targets.length,
    rows_today: rows.length, props: withProps ? 'included' : propsNote,
    credits_used: credits.spent, credits_remaining: credits.remaining
  },
  books,
  comparisons
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

const summary = [
  `Slate ${slate}: priced ${out.last_run.priced_today}/${targets.length} picks/legs, ${rows.length} app prices`,
  `Apps returned: ${out.last_run.books_returned.join(', ') || 'none'}`,
  `Props: ${out.last_run.props}`,
  `Credits: used ${credits.spent} this run, ${credits.remaining} remaining`
];
summary.forEach(l => console.log(l));

if (flag('--commit')) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
  git('add', '--', 'data/book-odds.json');
  if (!git('diff', '--cached', '--name-only')) console.log('No odds changes to commit.');
  else {
    git('commit', '-m', `Update other-app prices for ${slate}\n\n${summary.join('\n')}\n\nWritten by scripts/fetch-book-odds.mjs from The Odds API and live\nPolymarket US prices. Prices only; no dollar amounts, no API key.`);
    if (!flag('--no-push')) { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push', 'origin', 'main'); console.log('Pushed.'); }
  }
}
