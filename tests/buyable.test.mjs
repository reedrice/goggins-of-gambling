// tests/buyable.test.mjs — sides the Polymarket US app won't sell (marketSides[].tradable:false). TEST DATA.
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { sideBuyable, buildLive } from '../scripts/live-watch.mjs';
import { unbuyableLegs } from '../scripts/update-picks.mjs';
const Core = createRequire(import.meta.url)('../js/markets-core.js');

const mk = (id, noTradable, bid, ask) => ({ id, slug: 's' + id, active: true, closed: false, status: 'MARKET_STATUS_OPEN', question: 'Will A record at least 6 total rebounds in X vs. Y?',
  sportsMarketType: 'basketball_player_rebounds', line: 6, bestBidQuote: { value: String(bid) }, bestAskQuote: { value: String(ask) },
  marketSides: [{ long: true, description: 'Yes', tradable: true, quote: { value: String(ask) } }, { long: false, description: 'No', tradable: noTradable, quote: { value: String(1 - bid) } }] });

test('sideBuyable reads marketSides[].tradable', () => {
  const m = mk('1', false, 0.5, 0.52);
  assert.strictEqual(sideBuyable(m, 0), true);
  assert.strictEqual(sideBuyable(m, 1), false);
  assert.strictEqual(sideBuyable(mk('2', true, 0.5, 0.52), 1), true);
  assert.strictEqual(sideBuyable({ marketSides: [{ long: true }, { long: false }] }, 1), true);   // flag missing = assume buyable
});

test('buildLive never makes an edge on a side you cannot buy', () => {
  // Yes got 10 pts dearer -> the No side is 10 pts cheaper than open.
  const open = { slug: 'nba-a-b-2026-10-20', title: 'A vs B', url: 'u', start_time: '2026-10-21T00:00:00Z', taken_at: 't',
    markets: ['1', '2'].map(id => ({ id, kind: 'Player prop', group: 'prop', sides: ['Yes: x', 'No: x'], teams: [null, null], mid: 50, yesBuy: 51, noBuy: 51, question: 'q' })) };
  const ev = { markets: [mk('1', false, 0.6, 0.62), mk('2', true, 0.6, 0.62)] };
  const j = buildLive(open, ev, null, '2026-10-20T20:00:00Z');
  assert.deepStrictEqual(j.edges.map(e => e.key), ['2:1']);
});

test('compact snapshot + unbuyableLegs flag NO on Yes-only props', () => {
  const c = Core.compactMarket ? Core.compactMarket(mk('1', false, 0.5, 0.52), {}) : null;
  if (c) assert.strictEqual(c.no_buyable, false);
  const look = id => ({ a: { no_buyable: false }, b: {} })[id];
  const errs = unbuyableLegs({ props: [{ market_id: 'a', market_side: 'no' }, { market_id: 'a', market_side: 'yes' }],
    lottery: [{ legs: [{ market_id: 'b', market_side: 'no' }, { market_id: 'a', market_side: 'no' }] }] }, look);
  assert.strictEqual(errs.length, 2);
  assert.match(errs[1], /lottery\[0\]\.legs\[1\]/);
});
