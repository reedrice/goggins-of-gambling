#!/usr/bin/env node
/**
 * live-watch.mjs — live line-movement checker for one Polymarket US game.
 *
 * WHY: Reed wants "sharp" alerts during a live game: tell him when a bet's
 * price has moved a lot from its pregame (opening) line, so he can spot
 * bets that got "juicy". Polymarket US prices are free to pull, so this
 * compares Polymarket's live price to its own opening price (no Odds API
 * credits are used).
 *
 * USAGE
 *   node scripts/live-watch.mjs snapshot [--slug nfl-was-sf-2026-10-19]
 *       Save pregame "opening" prices for the moneyline, main spread, main
 *       total and key player props to /workspace/live/<tag>-open.json.
 *   node scripts/live-watch.mjs check [--slug ...] [--open-move 10] [--step-move 6]
 *       Pull current prices, compare to the opening line AND the previous
 *       check, print only notable moves. Saves state to <tag>-last.json.
 *
 *   node scripts/live-watch.mjs watch [--every 150] [--max-checks 200]
 *       Run "check" every N seconds until the game ends (or max checks) and
 *       append alerts to data/live/<slug>-alerts.json (prices only).
 *
 *   node scripts/live-watch.mjs publish [--slug ...]
 *       Build the site file data/live/<slug>.json for the Live Bets view
 *       (js/live-bets.js): open prices + current edges vs open. Takes the
 *       opening snapshot first if none exists. Prices only.
 *
 * Options: --dir (default /workspace/live), --players "Purdy,Daniels,..."
 *
 * PRIVACY: files hold only public market prices — never dollar amounts,
 * bankrolls, stakes or keys. The working files live outside the repo.
 *
 * HOW PRICES ARE READ: the event payload's bestBidQuote / bestAskQuote for
 * the market's "Yes" (long) side. Fair probability = mid of bid and ask.
 * A market is "thin" (ignored) when bid/ask are missing or more than
 * MAX_WIDTH points apart, or it is basically decided (<4% or >96%).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GATEWAY = 'https://gateway.polymarket.us';
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i > 0 ? args[i + 1] : d; };
const SLUG = opt('slug', 'nfl-was-sf-2026-10-19');
const DIR = opt('dir', '/workspace/live');
// "nfl-was-sf-2026-10-19" -> "was-sf-2026-10-19". The date is kept (Oct 19)
// so a rematch later in the season doesn't overwrite this game's snapshot.
export const tagOf = slug => slug.split('-').slice(1).join('-');
const TAG = tagOf(SLUG);
const OPEN_FILE = path.join(DIR, `${TAG}-open.json`);
const LAST_FILE = path.join(DIR, `${TAG}-last.json`);
const OPEN_MOVE = Number(opt('open-move', 10));   // pts of implied prob vs open
const STEP_MOVE = Number(opt('step-move', 6));    // pts vs previous check
const MAX_WIDTH = 6;
const ALERTS_DIR = opt('alerts-dir', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'live'));                              // max bid/ask gap in pts
// Default player list is only for the WAS @ SF trial; other games watch props
// only for players named with --players.
const DEFAULT_PLAYERS = SLUG === 'nfl-was-sf-2026-10-19' ? 'Purdy,Daniels,McCaffrey,Kittle,Evans,Samuel,McLaurin,Aiyuk,Pearsall,Croskey-Merritt,Ertz,Jennings' : '';
const PLAYERS = opt('players', DEFAULT_PLAYERS).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/**
 * Per-sport market types, keyed by the slug's league prefix. Names were checked
 * against real gateway.polymarket.us events on Oct 19, 2026 (nfl-was-sf, nba-bos-det,
 * wnba-atl-gsv, nhl-col-phi, mlb-cle-tb). Moneyline/spread/total are
 * `<prefix>_team_full_game_{winner,spread,total}`; props match `props`.
 */
export const SPORTS = {
  nfl:  { prefix: 'football',   props: /^football_player_(passing_yards|rushing_yards|receiving_yards|receptions|touchdowns|passing_touchdowns|interceptions_thrown)$/ },
  nba:  { prefix: 'basketball', props: /^basketball_player_(points|rebounds|assists|threes)$/ },
  wnba: { prefix: 'basketball', props: /^basketball_player_(points|rebounds|assists|threes)$/ },
  nhl:  { prefix: 'hockey',     props: /^hockey_player_(points|goals|assists)$/ },
  mlb:  { prefix: 'baseball',   props: /^baseball_player_(hits|home_runs|total_bases|rbis|strikeouts)$/ },
};
export const sportOf = slug => {
  const sp = SPORTS[slug.split('-')[0]];
  if (!sp) throw new Error(`Unknown league in slug "${slug}". Known: ${Object.keys(SPORTS).join(', ')}`);
  return { ...sp, winner: `${sp.prefix}_team_full_game_winner`, spread: `${sp.prefix}_team_full_game_spread`, total: `${sp.prefix}_team_full_game_total` };
};

/** Fetch the whole event (all markets + quotes) in one call. */
async function fetchEvent() {
  const r = await fetch(`${GATEWAY}/v1/events/slug/${SLUG}`);
  if (!r.ok) throw new Error(`Polymarket US returned ${r.status}`);
  const j = await r.json();
  return j.event || j;
}

/** Yes-side quote in probability points (0-100), or null if missing. */
export function quote(m) {
  const b = Number(m.bestBidQuote?.value), a = Number(m.bestAskQuote?.value);
  if (!(b > 0) || !(a > 0)) return null;
  return { bid: b * 100, ask: a * 100, mid: (a + b) * 50, width: (a - b) * 100 };
}
export const isOpen = m => m.active && !m.closed && m.status === 'MARKET_STATUS_OPEN';
export const liquid = q => q && q.width <= MAX_WIDTH && q.mid >= 4 && q.mid <= 96;

// ------------------------------------------------------------ game lines
// Periods we watch for game lines, from the real gateway type names
// (`<prefix>_(team|game)_<period>_(winner|spread|total)`, checked Oct 19, 2026).
const PERIODS = { full_game: 'Full game', first_half: '1st half', second_half: '2nd half',
  first_quarter: 'Q1', second_quarter: 'Q2', third_quarter: 'Q3', fourth_quarter: 'Q4' };
// Team-total types per sport prefix (football: points_full_game_total; basketball: total_points).
const TEAM_TOTAL = { football: /^football_team_points_full_game_total$/, basketball: /^basketball_team_total_points$/ };

/**
 * What kind of game line a market is, or null if it isn't one we watch.
 * Returns { mtype: winner|spread|total|team_total, period, periodLabel }.
 */
export function lineInfo(type, prefix) {
  if (TEAM_TOTAL[prefix]?.test(type)) return { mtype: 'team_total', period: 'full_game', periodLabel: PERIODS.full_game };
  const m = new RegExp(`^${prefix}_(?:team|game)_(${Object.keys(PERIODS).join('|')})_(winner|spread|total)$`).exec(type);
  return m ? { mtype: m[2], period: m[1], periodLabel: PERIODS[m[1]] } : null;
}

/** Team alias of a market side ("Commanders"), or null for game-wide sides. */
const teamOf = s => s?.team?.alias || s?.team?.name || null;

/**
 * Plain-English names of the "Yes" and "No" sides, plus the team each side is
 * FOR (used by the score/injury checks in live-context.mjs).
 * Returns { sides: [yes, no], teams: [yesTeam|null, noTeam|null] }.
 */
export function describe(m, info) {
  const yes = m.marketSides?.find(s => s.long), no = m.marketSides?.find(s => !s.long);
  const per = info && info.period !== 'full_game' ? ` (${info.periodLabel})` : '';
  const q = String(m.question).replace(/^Will /, '').replace(/\?$/, '');
  const ty = teamOf(yes), tn = teamOf(no);
  const t = info?.mtype || (/winner$/.test(m.sportsMarketType) ? 'winner' : /spread$/.test(m.sportsMarketType) ? 'spread' : /total$/.test(m.sportsMarketType) ? 'total' : 'prop');
  if (t === 'winner') {
    // Moneyline: two different teams. Period winner ("Will SF win the 1st half?")
    // and "ends tied" markets have one team or none, so they read as Yes/No.
    if (ty && tn && ty !== tn) return { sides: [`${ty} win${per}`, `${tn} win${per}`], teams: [ty, tn] };
    return { sides: [`Yes: ${q}`, `No: ${q}`], teams: [ty, null] };
  }
  if (t === 'spread') return { sides: [`${ty || 'Away'} ${yes?.description}${per}`, `${tn || 'Home'} ${no?.description}${per}`], teams: [ty, tn] };
  if (t === 'team_total') return { sides: [`${ty} Over ${m.line} points`, `${ty} Under ${m.line} points`], teams: [ty, ty] };
  if (t === 'total') {
    // Game totals have no team; per-team half totals carry the team on both sides.
    const who = ty && ty === tn ? `${ty} ` : '';
    return { sides: [`${who}Over ${m.line}${per}`, `${who}Under ${m.line}${per}`], teams: who ? [ty, ty] : [null, null] };
  }
  return { sides: [`Yes: ${q}`, `No: ${q}`], teams: [ty, ty] };
}
/** Back-compat: just the two side names. */
export const sides = m => describe(m).sides;

/** Player name from a prop question: "Will Brock Purdy throw 1+ ..." -> "Brock Purdy". */
export const playerOf = question => String(question).replace(/^Will /, '').split(/ (?:record|throw|score|have|catch|rush|get|make)\b/)[0].trim();

/**
 * Pick the markets worth watching:
 *  - GAME LINES (group "game"): moneyline, every liquid full-game spread and
 *    total (the one nearest 50% is "Main", the rest "Alt"), team totals, and
 *    half/quarter winners, spreads and totals. Added Oct 19 so the list isn't
 *    all props (the first snapshot was 117 props vs 3 game lines).
 *  - PLAYER PROPS (group "prop"): liquid props for the --players list.
 * Thin (> 6 pt gap) and extreme (< 4% / > 96%) markets are left out.
 */
export function selectMarkets(ev, sp = sportOf(SLUG), players = PLAYERS) {
  const ms = ev.markets.filter(isOpen).map(m => ({ m, q: quote(m) })).filter(x => liquid(x.q));
  const near50 = t => ms.filter(x => x.m.sportsMarketType === t).sort((a, b) => Math.abs(a.q.mid - 50) - Math.abs(b.q.mid - 50))[0];
  const main = new Set([near50(sp.spread)?.m.id, near50(sp.total)?.m.id]);
  const out = [];
  for (const x of ms) {
    const info = lineInfo(x.m.sportsMarketType, sp.prefix);
    if (info) {
      const label = info.mtype === 'team_total' ? 'Team total'
        : info.period === 'full_game' ? (info.mtype === 'winner' ? 'Moneyline' : `${main.has(x.m.id) ? 'Main' : 'Alt'} ${info.mtype}`)
        : `${info.periodLabel} ${info.mtype === 'winner' ? 'winner' : info.mtype}`;
      out.push({ x, kind: label, group: 'game', info });
    } else if (sp.props.test(x.m.sportsMarketType)) {
      const ql = x.m.question.toLowerCase();
      if (players.some(p => ql.includes(p))) out.push({ x, kind: 'Player prop', group: 'prop', info: null });
    }
  }
  // Order: moneyline, main lines, alt lines, team totals, periods, then props.
  const rank = o => o.group === 'prop' ? 9 : o.kind === 'Moneyline' ? 0 : o.kind.startsWith('Main') ? 1 : o.kind.startsWith('Alt') ? 2 : o.kind === 'Team total' ? 3 : 4;
  out.sort((a, b) => rank(a) - rank(b));
  return out.map(({ x: { m, q }, kind, group, info }) => {
    const d = describe(m, info);
    return { id: m.id, slug: m.slug, kind, group, mtype: info?.mtype || 'prop', period: info?.period || 'full_game',
      line: m.line ?? null, type: m.sportsMarketType, question: m.question, sides: d.sides, teams: d.teams,
      player: group === 'prop' ? playerOf(m.question) : null, mid: +q.mid.toFixed(1),
      // Buy prices (prob pts) of each side at open, so open and now are measured the same way.
      yesBuy: +q.ask.toFixed(1), noBuy: +(100 - q.bid).toFixed(1) };
  });
}

/** Probability points -> American odds string, e.g. 40 -> "+150". */
export function american(p) {
  if (!(p > 0 && p < 100)) return '—';
  // Even odds (50) show as +100, not -100 (fix Oct 19, 2026).
  return p > 50 ? `-${Math.round(100 * p / (100 - p))}` : `+${Math.round(100 * (100 - p) / p)}`;
}
/** What $10 returns (stake + profit) at price p (prob points), in WHOLE dollars,
 *  rounded down so we never overstate it (no cents, fix Oct 19, 2026). */
export const pays = p => String(Math.floor(1000 / p));
const marketUrl = () => `https://polymarket.us/sports/${SLUG.split('-')[0]}/${SLUG}`;

/**
 * Pure core of "check" (no network, no files) so tests can feed it saved
 * sample data. open = the snapshot object, last = { marketId: mid } from the
 * previous check, ev = a Polymarket US event payload.
 * Returns { mids, alerts: [{size, text}], watched, skipped }.
 */
export function findMoves(open, last, ev, cfg = {}) {
  const openMove = cfg.openMove ?? OPEN_MOVE, stepMove = cfg.stepMove ?? STEP_MOVE;
  const byId = Object.fromEntries(ev.markets.map(m => [m.id, m]));
  const mids = {}, alerts = [];
  let watched = 0, skipped = 0;
  for (const o of open.markets) {
    const m = byId[o.id]; const q = m && quote(m);
    if (!m || !isOpen(m) || !liquid(q)) { skipped++; continue; }   // settled, paused or thin now
    watched++;
    mids[o.id] = +q.mid.toFixed(1);
    // Moves are detected on the Yes-side MID (bid/ask noise cancels out).
    const dOpen = q.mid - o.mid, dLast = last[o.id] != null ? q.mid - last[o.id] : 0;
    const bigOpen = Math.abs(dOpen) >= openMove, bigStep = Math.abs(dLast) >= stepMove;
    if (!bigOpen && !bigStep) continue;
    // Pick the side that got cheaper, using whichever move actually fired.
    // (Fix Oct 19: a step-only alert used to follow the open move, which could
    // point at the side that just got MORE expensive.)
    const trigger = bigOpen ? dOpen : dLast;
    const yesCheaper = trigger < 0;
    const side = yesCheaper ? o.sides[0] : o.sides[1];
    // Open and now are both real BUY prices for that side (fix Oct 19: open used
    // the mid and now used the ask, which overstated every move by half the gap).
    // Old snapshots without buy prices fall back to the mid.
    const nowP = yesCheaper ? q.ask : 100 - q.bid;
    const openP = yesCheaper ? (o.yesBuy ?? o.mid) : (o.noBuy ?? 100 - o.mid);
    // Signed from THIS side's point of view: negative = cheaper (pays more).
    const sideOpen = yesCheaper ? dOpen : -dOpen, sideLast = yesCheaper ? dLast : -dLast;
    const sgn = x => `${x > 0 ? '+' : ''}${x.toFixed(0)}`;
    alerts.push({ kind: o.kind, id: o.id, size: Math.max(Math.abs(dOpen), Math.abs(dLast)), side, nowP, openP, text:
      `• ${side} (${o.kind})\n` +
      `  Opened ${american(openP)} → now ${american(nowP)}. $10 pays $${pays(nowP)} now (was about $${pays(openP)}).\n` +
      `  Chance of this side ${sgn(sideOpen)} pts from open` + (dLast ? `, ${sgn(sideLast)} since last check` : '') + `.\n` +
      `  Bet it: ${open.url}` });
  }
  return { mids, alerts, watched, skipped };
}

async function snapshot() {
  const ev = await fetchEvent();
  const picks = selectMarkets(ev);
  fs.mkdirSync(DIR, { recursive: true });
  const data = { slug: SLUG, title: ev.title, start_time: ev.startTime, taken_at: new Date().toISOString(), url: marketUrl(), markets: picks };
  fs.writeFileSync(OPEN_FILE, JSON.stringify(data, null, 1));
  const kinds = picks.reduce((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {});
  console.log(`Saved opening prices for ${picks.length} markets (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}) -> ${OPEN_FILE}`);
}

async function check() {
  if (!fs.existsSync(OPEN_FILE)) throw new Error(`No opening snapshot at ${OPEN_FILE}. Run "snapshot" first.`);
  const open = JSON.parse(fs.readFileSync(OPEN_FILE, 'utf8'));
  const last = fs.existsSync(LAST_FILE) ? JSON.parse(fs.readFileSync(LAST_FILE, 'utf8')).mids : {};
  const ev = await fetchEvent();
  const { mids, alerts, watched, skipped } = findMoves(open, last, ev);
  fs.writeFileSync(LAST_FILE, JSON.stringify({ at: new Date().toISOString(), mids }, null, 1));
  const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  if (!alerts.length) { console.log(`${now} CT — no big moves (${watched} markets watched, ${skipped} thin/settled skipped).`); return { alerts, ev }; }
  console.log(`${now} CT — ${alerts.length} big move(s) on ${open.title}:`);
  alerts.sort((a, b) => b.size - a.size).forEach(a => console.log(a.text));
  return { alerts, ev };
}

/**
 * Append alerts to <dir>/<slug>-alerts.json. PRICES ONLY: side, kind and
 * American odds / chance points. No dollar figures, stakes or bankrolls.
 */
export function appendAlerts(dir, slug, alerts, at = new Date().toISOString()) {
  const file = path.join(dir, `${slug}-alerts.json`);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { slug, alerts: [] };
  for (const a of alerts) data.alerts.push({ at, market_id: a.id, kind: a.kind, side: a.side,
    open_odds: american(a.openP), now_odds: american(a.nowP), open_chance: +a.openP.toFixed(1), now_chance: +a.nowP.toFixed(1) });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
  return file;
}

/** Game is over when the event says so or every watched market is closed. */
export const gameOver = ev => !!(ev.ended || ev.closed || (ev.markets || []).every(m => m.closed || !m.active));

/** Loop "check" until the game ends. Errors on one check don't stop the loop. */
async function watch() {
  const every = Number(opt('every', 150)) * 1000, max = Number(opt('max-checks', 200));
  for (let i = 1; i <= max; i++) {
    try {
      const r = await check();
      if (r && r.alerts.length) console.log('  saved ->', appendAlerts(ALERTS_DIR, SLUG, r.alerts));
      if (r && gameOver(r.ev)) { console.log('Game over, stopping.'); return; }
    } catch (e) { console.error('check failed (will retry):', e.message); }
    if (i < max) await new Promise(res => setTimeout(res, every));
  }
}

// ------------------------------------------------------------ publish (§33)
// Edge = how many points CHEAPER a side's live buy price is than its opening
// buy price. Big = 10+, slight = 4-9. Thin/extreme markets never count.
export const BIG_EDGE = 10, SLIGHT_EDGE = 4;
export const tierOf = e => (e >= BIG_EDGE ? 'big' : e >= SLIGHT_EDGE ? 'slight' : null);

/**
 * Pure: build the site JSON. open = snapshot, ev = live event payload,
 * prev = last published file (keeps first_seen, marks dropped edges "gone").
 * Stores chances (prob points) and American odds only; the browser works out
 * "$10 pays $X" (HANDOFF §32), so no dollar figures are committed.
 */
export function buildLive(open, ev, prev, nowIso = new Date().toISOString()) {
  const byId = Object.fromEntries((ev.markets || []).map(m => [m.id, m]));
  const prevEdges = Object.fromEntries(((prev && prev.edges) || []).map(e => [e.key, e]));
  const edges = [], seen = new Set();
  for (const o of open.markets) {
    const m = byId[o.id], q = m && quote(m);
    if (!m || !isOpen(m) || !liquid(q)) continue;   // gone, paused, wide gap or extreme
    // Each side's buy price now vs at open (old snapshots fall back to the mid).
    const both = [
      { i: 0, now: q.ask, open: o.yesBuy ?? o.mid },
      { i: 1, now: 100 - q.bid, open: o.noBuy ?? 100 - o.mid },
    ];
    for (const sd of both) {
      const edge = +(sd.open - sd.now).toFixed(1), tier = tierOf(edge);
      if (!tier) continue;
      const key = `${o.id}:${sd.i}`; seen.add(key);
      edges.push({ key, market_id: o.id, market: o.kind, group: o.group || (o.kind === 'Player prop' ? 'prop' : 'game'),
        question: o.question, side: o.sides[sd.i],
        open_chance: +sd.open.toFixed(1), now_chance: +sd.now.toFixed(1),
        open_odds: american(sd.open), now_odds: american(sd.now), edge, tier,
        first_seen: prevEdges[key]?.first_seen || nowIso, status: 'open' });
    }
  }
  // Edges from the last publish that no longer qualify stay listed as "gone".
  for (const e of Object.values(prevEdges)) if (!seen.has(e.key)) edges.push({ ...e, status: 'gone' });
  edges.sort((a, b) => (a.status === 'gone') - (b.status === 'gone') || b.edge - a.edge);
  const started = open.start_time && Date.parse(nowIso) >= Date.parse(open.start_time);
  return {
    _note: 'Real Polymarket US prices (gateway.polymarket.us). Chances in points (0-100). No dollar amounts.',
    slug: open.slug, game: open.title, url: open.url, start_time: open.start_time,
    status: gameOver(ev) ? 'final' : started ? 'live' : 'pregame',
    updated: nowIso, open_taken_at: open.taken_at, thresholds: { big: BIG_EDGE, slight: SLIGHT_EDGE },
    open: open.markets.map(o => ({ market_id: o.id, market: o.kind, group: o.group, mtype: o.mtype, period: o.period, line: o.line,
      question: o.question, sides: o.sides, teams: o.teams, player: o.player, mid: o.mid, yes_buy: o.yesBuy, no_buy: o.noBuy })),
    edges,
  };
}

/** Rebuild an opening snapshot from a published data/live/<slug>.json. */
export const openFromPublished = p => ({ slug: p.slug, title: p.game, url: p.url, start_time: p.start_time, taken_at: p.open_taken_at,
  markets: p.open.map(o => ({ id: o.market_id, kind: o.market, group: o.group, mtype: o.mtype, period: o.period, line: o.line,
    question: o.question, sides: o.sides, teams: o.teams, player: o.player, mid: o.mid, yesBuy: o.yes_buy, noBuy: o.no_buy })) });

/** Write data/live/<slug>.json (snapshot first if there is no opening file). */
async function publish() {
  const file = path.join(ALERTS_DIR, `${SLUG}.json`);
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  // Opening prices: the local snapshot, else the ones already published in the
  // repo (so any machine/runner keeps the SAME open), else take one now.
  if (!fs.existsSync(OPEN_FILE) && !prev) await snapshot();
  const open = fs.existsSync(OPEN_FILE) ? JSON.parse(fs.readFileSync(OPEN_FILE, 'utf8')) : openFromPublished(prev);
  const out = buildLive(open, await fetchEvent(), prev);
  fs.mkdirSync(ALERTS_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`Published ${out.edges.filter(e => e.status === 'open').length} edge(s), status ${out.status} -> ${file}`);
}

// Only run the CLI when executed directly (tests import the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const run = { snapshot, check, watch, publish }[cmd];
  if (!run) { console.log('Usage: node scripts/live-watch.mjs snapshot|check|watch|publish [--slug ...]'); process.exit(1); }
  run().catch(e => { console.error('live-watch error:', e.message); process.exit(1); });
}
