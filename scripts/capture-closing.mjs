#!/usr/bin/env node
/**
 * scripts/capture-closing.mjs — permanent pick history for the learning loop.
 *
 * WHY: data/picks.json is replaced every day, so nothing would be left to learn
 * from. This keeps every published pick in data/pick-history.json (ours) with:
 *   - publish price  (picks.json "price" / leg "price": Polymarket US buy price
 *                     in chance points when the pick was written)
 *   - closing price  (live Polymarket US buy price for that side, captured in
 *                     the last CLOSE_WINDOW minutes before the game starts)
 *   - result         (real Polymarket US settlement, graded after the game)
 * and CLV = closing − publish in chance points (positive = the market moved
 * our way after we published, a sign the pick was sharp).
 *
 * ONE COMMAND does all three steps every run (safe to repeat):
 *   node scripts/capture-closing.mjs [--commit] [--window 20] [--dry-run]
 *     1. log:   add picks from data/picks.json not seen before (never removes any)
 *     2. close: for games starting within --window minutes (default 20) and not
 *               started yet, save the live price as the closing price (once)
 *     3. grade: picks whose markets settled get win/loss/push/void
 *   Run it after publishing picks, every ~10 min while games are about to
 *   start, and the next morning. A pick whose start passed with no capture
 *   keeps close = null (never back-filled or guessed).
 *
 * PRICES: the public gateway https://gateway.polymarket.us/v1/events/slug/<game>.
 * Yes buy = bestAskQuote; No buy = 100 − bestBidQuote (chance points).
 * Results: closed market, the "long" (yes) side priced "1" = yes won, "0" = lost;
 * a middle price = push; archived with no price = void.
 *
 * PRIVACY: chance points, units and American odds only. No dollars, no "$".
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIST = path.join(ROOT, 'data/pick-history.json');
const GATEWAY = 'https://gateway.polymarket.us';
const SECTIONS = { singles: 'single', props: 'prop', parlays: 'parlay', longshots: 'longshot', nonsports: 'nonsports' };

/** Game/event slug: from the Polymarket US link, else from the market id. */
export function slugOf(o, pk = {}) {
  const u = o.polymarket_url || o.link || pk.polymarket_url || pk.link || '';
  const m = /polymarket\.us\/(?:sports\/[a-z0-9]+|event)\/([a-z0-9-]+)/.exec(u);
  if (m) return m[1];
  const g = /^[a-z]+-([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})/.exec(String(o.market_id || ''));
  return g ? g[1] : null;
}

/**
 * Bet type + prop stat from a market id:
 * aec = who wins, asc = spread, tsc = total, astatc-…-<stat>-<player>-gte<N> = player prop.
 */
export function kindOf(marketId) {
  const id = String(marketId || '');
  if (/^astatc-/.test(id)) { const m = /-\d{4}-\d{2}-\d{2}-([a-z0-9]+)-[a-z]+-gte\d+/.exec(id); return { type: 'prop', stat: m ? m[1] : 'other' }; }
  if (/^aec-/.test(id)) return { type: 'moneyline', stat: null };
  if (/^asc-/.test(id)) return { type: 'spread', stat: null };
  if (/^tsc-/.test(id)) return { type: 'total', stat: null };
  return { type: 'other', stat: null };
}

/** picks.json -> history entries (pure). Skips predictions and picks with no real market. */
export function entriesFromPicks(doc) {
  const out = [];
  for (const [sec, cat] of Object.entries(SECTIONS)) {
    for (const pk of (doc.sections || {})[sec] || []) {
      const raw = Array.isArray(pk.legs) && pk.legs.length ? pk.legs : [pk];
      const legs = raw.map(l => ({ market_id: l.market_id || null, side: l.market_side || null, slug: slugOf(l, pk), desc: String(l.desc || pk.side || '').slice(0, 120),
        start_time: l.start_time || pk.start_time || null, ...kindOf(l.market_id), publish: typeof l.price === 'number' ? l.price : null, close: null, close_at: null, result: null }));
      if (!legs.every(l => l.market_id && (l.side === 'yes' || l.side === 'no') && l.slug && l.publish > 0)) continue;
      out.push({ id: pk.id, slate_date: pk.slate_date || doc.slate_date, sport: pk.sport || null, category: cat,
        type: legs.length > 1 ? 'parlay' : legs[0].type, stat: legs.length > 1 ? null : legs[0].stat,
        hit_prob: typeof pk.hit_prob === 'number' ? pk.hit_prob : null, stake_units: typeof pk.stake_units === 'number' ? pk.stake_units : null,
        published_at: doc.updated_at || null, legs, result: 'pending', graded_at: null });
    }
  }
  return out;
}

/** Add unseen picks (by id + slate day); existing entries are never removed or replaced. */
export function mergeHistory(hist, fresh) {
  const have = new Set(hist.picks.map(p => p.id + '|' + p.slate_date));
  let added = 0;
  for (const p of fresh) if (!have.has(p.id + '|' + p.slate_date)) { hist.picks.push(p); have.add(p.id + '|' + p.slate_date); added++; }
  return added;
}

/** Yes/no BUY price (chance points) for a market in an event payload, or null. */
export function buyPrice(ev, marketId, side) {
  const m = (((ev && ev.event) || ev || {}).markets || []).find(x => x.slug === marketId);
  if (!m || m.closed) return null;
  const a = Number(m.bestAskQuote && m.bestAskQuote.value), b = Number(m.bestBidQuote && m.bestBidQuote.value);
  if (side === 'yes') return a > 0 && a < 1 ? +(a * 100).toFixed(1) : null;
  return b > 0 && b < 1 ? +(100 - b * 100).toFixed(1) : null;
}

/** Leg result from settlement: 'win'|'loss'|'push'|'void'|null. */
export function legResult(ev, marketId, side) {
  const m = (((ev && ev.event) || ev || {}).markets || []).find(x => x.slug === marketId);
  if (!m || !m.closed) return null;
  const long = (m.marketSides || []).find(s => s.long);
  const p = long && long.price !== undefined && long.price !== '' ? Number(long.price) : NaN;
  if (isNaN(p)) return m.archived ? 'void' : null;
  if (p !== 0 && p !== 1) return 'push';
  return (side === 'yes') === (p === 1) ? 'win' : 'loss';
}

/** Whole-pick result from its legs: any loss = loss; all decided: wins = win, else push/void. */
export function pickResult(legs) {
  const r = legs.map(l => l.result);
  if (r.includes('loss')) return 'loss';
  if (r.some(x => x == null)) return 'pending';
  if (r.includes('win')) return 'win';
  return r.includes('push') ? 'push' : 'void';
}

/** Should we capture the closing price now? Not started, starts within the window, none yet. */
export const inCloseWindow = (leg, now, windowMin) => {
  const t = Date.parse(leg.start_time || '');
  return leg.close == null && !isNaN(t) && t > now && t - now <= windowMin * 60000;
};

const cache = new Map();
const fetchEvent = slug => cache.get(slug) || cache.set(slug, fetch(`${GATEWAY}/v1/events/slug/${slug}`).then(r => (r.ok ? r.json() : null)).catch(() => null)).get(slug);

async function main() {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const windowMin = Number(opt('window', 20)), now = Date.now();
  const hist = fs.existsSync(HIST) ? JSON.parse(fs.readFileSync(HIST, 'utf8')) : { schema_version: 1, picks: [] };
  const before = JSON.stringify(hist.picks);
  const added = mergeHistory(hist, entriesFromPicks(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/picks.json'), 'utf8'))));
  let closed = 0, graded = 0;
  for (const p of hist.picks) {
    for (const l of p.legs) {
      if (inCloseWindow(l, now, windowMin)) {
        const c = buyPrice(await fetchEvent(l.slug), l.market_id, l.side);
        if (c != null) { l.close = c; l.close_at = new Date().toISOString(); closed++; }
      }
      if (l.result == null && Date.parse(l.start_time || '') < now) l.result = legResult(await fetchEvent(l.slug), l.market_id, l.side);
    }
    if (p.result === 'pending') { const r = pickResult(p.legs); if (r !== 'pending') { p.result = r; p.graded_at = new Date().toISOString(); graded++; } }
  }
  hist.note = 'Every published pick, kept for good: publish price, closing price (last minutes before start) and real Polymarket US result. Chance points.';
  const changed = JSON.stringify(hist.picks) !== before;
  if (changed || !hist.updated_at) hist.updated_at = new Date().toISOString();
  console.log(`pick history: ${added} new, ${closed} closing price(s), ${graded} graded, ${hist.picks.length} total.`);
  if (args.includes('--dry-run')) return;
  fs.writeFileSync(HIST, JSON.stringify(hist, null, 1) + '\n');
  if (args.includes('--commit') && changed) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
    git('add', '--', 'data/pick-history.json');
    git('commit', '-q', '-m', `Pick history: ${added} new, ${closed} closing prices, ${graded} graded`);
    git('pull', '-q', '--rebase'); git('push', '-q', 'origin', 'HEAD:main');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('capture-closing:', e.message); process.exit(1); });
