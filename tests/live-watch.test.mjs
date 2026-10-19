// node --test tests/live-watch.test.mjs
// Tests for scripts/live-watch.mjs using TEST DATA in tests/fixtures/live-watch-sample.json
// (made-up prices, no network).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { american, pays, quote, liquid, findMoves, appendAlerts, gameOver, selectMarkets, sportOf, tagOf } from '../scripts/live-watch.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures/live-watch-sample.json', import.meta.url), 'utf8'));

test('american odds', () => {
  assert.strictEqual(american(40), '+150');
  assert.strictEqual(american(60), '-150');
  assert.strictEqual(american(0), '—');
});

test('$10 pays (stake + profit)', () => assert.strictEqual(pays(40), '25.00'));

test('thin markets are skipped', () => {
  const thin = F.event.markets.find(m => m.id === 'thin');
  assert.strictEqual(liquid(quote(thin)), false);
});

test('only big moves alert, biggest first, no cents', () => {
  const r = findMoves(F.open, {}, F.event);
  assert.strictEqual(r.watched, 3);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(r.alerts.length, 2);            // ml and tot moved 11 pts; calm moved 2
  for (const a of r.alerts) { assert.match(a.text, /\$10 pays \$/); assert.doesNotMatch(a.text, /¢/); }
  assert.match(r.alerts.find(a => a.text.includes('AAA win')).text, /now \+150/);   // AAA got cheaper
  assert.match(r.alerts.find(a => a.text.includes('Under')).text, /Under 40\.5/);    // Over rose -> Under cheaper
});

test('step-only alert names the side that just got cheaper, signs from that side', () => {
  // Calm vs open (+2), but last check had the spread Yes at 60 -> Yes just dropped 8.
  const r = findMoves(F.open, { calm: 60 }, F.event);
  const a = r.alerts.find(x => x.text.includes('Main spread'));
  assert.strictEqual(a.side, 'AAA +1.5');
  assert.match(a.text, /-8 since last check/);
});

test('open and now are both buy prices', () => {
  const open = { ...F.open, markets: F.open.markets.map(m => ({ ...m, yesBuy: 51, noBuy: 51 })) };
  const a = findMoves(open, {}, F.event).alerts.find(x => x.side === 'AAA win');
  assert.strictEqual(a.openP, 51);   // open buy price, not the 50 mid
  assert.strictEqual(a.nowP, 40);    // now ask
  assert.match(a.text, /-11 pts from open/);
});

test('appendAlerts saves prices only (no $) and appends across checks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-'));
  const { alerts } = findMoves(F.open, {}, F.event);
  appendAlerts(dir, 'test-slug', alerts); const f = appendAlerts(dir, 'test-slug', alerts);
  const raw = fs.readFileSync(f, 'utf8'), j = JSON.parse(raw);
  assert.strictEqual(j.alerts.length, 4);
  assert.doesNotMatch(raw, /\$|¢/);
  assert.match(j.alerts[0].now_odds, /^[+-]\d+$/);
});

test('gameOver', () => {
  assert.strictEqual(gameOver(F.event), false);
  assert.strictEqual(gameOver({ markets: [{ closed: true }] }), true);
});

test('snapshot file tag keeps the date', () => assert.strictEqual(tagOf('nfl-was-sf-2026-10-19'), 'was-sf-2026-10-19'));

test('per-sport market types pick ML, main spread/total and named-player props', () => {
  assert.throws(() => sportOf('xyz-a-b-2099-01-01'));
  const q = (b, a) => ({ active: true, closed: false, status: 'MARKET_STATUS_OPEN', bestBidQuote: { value: b }, bestAskQuote: { value: a } });
  // TEST DATA: made-up NHL event (type names match the real API).
  const ev = { markets: [
    { id: 1, sportsMarketType: 'hockey_team_full_game_winner', marketSides: [], ...q('0.55', '0.57') },
    { id: 2, sportsMarketType: 'hockey_team_full_game_total', line: 5.5, ...q('0.48', '0.50') },
    { id: 3, sportsMarketType: 'hockey_team_full_game_total', line: 6.5, ...q('0.30', '0.32') },
    { id: 4, sportsMarketType: 'hockey_player_goals', question: 'Will Test Player score?', ...q('0.30', '0.33') },
    { id: 5, sportsMarketType: 'football_team_full_game_winner', ...q('0.50', '0.52') },
  ] };
  const got = selectMarkets(ev, sportOf('nhl-aaa-bbb-2099-01-01'), ['test player']);
  assert.deepStrictEqual(got.map(m => m.id), [1, 2, 4]);
  assert.deepStrictEqual(got[1].sides, ['Over 5.5', 'Under 5.5']);
});
