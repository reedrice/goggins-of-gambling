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
// "nfl-was-sf-2026-10-19" -> "was-sf"
const TAG = SLUG.split('-').slice(1, 3).join('-');
const OPEN_FILE = path.join(DIR, `${TAG}-open.json`);
const LAST_FILE = path.join(DIR, `${TAG}-last.json`);
const OPEN_MOVE = Number(opt('open-move', 10));   // pts of implied prob vs open
const STEP_MOVE = Number(opt('step-move', 6));    // pts vs previous check
const MAX_WIDTH = 6;
const ALERTS_DIR = opt('alerts-dir', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'live'));                              // max bid/ask gap in pts
const PLAYERS = opt('players', 'Purdy,Daniels,McCaffrey,Kittle,Evans,Samuel,McLaurin,Aiyuk,Pearsall,Croskey-Merritt,Ertz,Jennings')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const PROP_TYPES = /player_(passing_yards|rushing_yards|receiving_yards|receptions|touchdowns|passing_touchdowns|interceptions_thrown)$/;

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

/** Plain-English name of the "Yes" and "No" sides of a market. */
export function sides(m) {
  const yes = m.marketSides?.find(s => s.long), no = m.marketSides?.find(s => !s.long);
  const tn = s => s?.team?.alias || s?.team?.name;
  if (/winner$/.test(m.sportsMarketType)) return [`${tn(yes)} win`, `${tn(no)} win`];
  if (/spread$/.test(m.sportsMarketType)) return [`${tn(yes) || 'Away'} ${yes?.description}`, `${tn(no) || 'Home'} ${no?.description}`];
  if (/total$/.test(m.sportsMarketType)) return [`Over ${m.line} points`, `Under ${m.line} points`];
  const q = String(m.question).replace(/^Will /, '').replace(/\?$/, '');
  return [`Yes: ${q}`, `No: ${q}`];
}

/** Pick the markets worth watching: ML, main spread, main total, key props. */
export function selectMarkets(ev) {
  const ms = ev.markets.filter(isOpen).map(m => ({ m, q: quote(m) })).filter(x => liquid(x.q));
  const near50 = t => ms.filter(x => x.m.sportsMarketType === t).sort((a, b) => Math.abs(a.q.mid - 50) - Math.abs(b.q.mid - 50))[0];
  const out = [];
  const ml = ms.find(x => x.m.sportsMarketType === 'football_team_full_game_winner');
  if (ml) out.push(['Moneyline', ml]);
  const sp = near50('football_team_full_game_spread'); if (sp) out.push(['Main spread', sp]);
  const tot = near50('football_team_full_game_total'); if (tot) out.push(['Main total', tot]);
  for (const x of ms) {
    if (!PROP_TYPES.test(x.m.sportsMarketType)) continue;
    const ql = x.m.question.toLowerCase();
    if (PLAYERS.some(p => ql.includes(p))) out.push(['Player prop', x]);
  }
  return out.map(([kind, { m, q }]) => ({ id: m.id, slug: m.slug, kind, type: m.sportsMarketType, question: m.question, sides: sides(m), mid: +q.mid.toFixed(1),
    // Buy prices (prob pts) of each side at open, so open and now are measured the same way.
    yesBuy: +q.ask.toFixed(1), noBuy: +(100 - q.bid).toFixed(1) }));
}

/** Probability points -> American odds string, e.g. 40 -> "+150". */
export function american(p) {
  if (!(p > 0 && p < 100)) return '—';
  return p >= 50 ? `-${Math.round(100 * p / (100 - p))}` : `+${Math.round(100 * (100 - p) / p)}`;
}
/** What $10 returns (stake + profit) buying at price p (prob points). */
export const pays = p => (10 * 100 / p).toFixed(2);
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

// Only run the CLI when executed directly (tests import the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const run = { snapshot, check, watch }[cmd];
  if (!run) { console.log('Usage: node scripts/live-watch.mjs snapshot|check|watch [--slug ...]'); process.exit(1); }
  run().catch(e => { console.error('live-watch error:', e.message); process.exit(1); });
}
