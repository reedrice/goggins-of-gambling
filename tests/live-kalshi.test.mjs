// tests/live-kalshi.test.mjs — Kalshi matcher for Live Bets badges (TEST DATA).
import test from 'node:test';
import assert from 'node:assert';
import { matchOne, parseProp, kDate, teamMap, codes } from '../scripts/live-kalshi.mjs';
import { createRequire } from 'node:module';
const LB = createRequire(import.meta.url)('../js/live-bets.js');

const k = { ok: true, event: '26OCT20BOSDET',
  game: [{ ticker: 'KXNBAGAME-26OCT20BOSDET-BOS' }, { ticker: 'KXNBAGAME-26OCT20BOSDET-DET' }],
  spread: [{ ticker: 'KXNBASPREAD-26OCT20BOSDET-BOS2', floor_strike: 1.5 }, { ticker: 'KXNBASPREAD-26OCT20BOSDET-DET16', floor_strike: 15.5 }],
  total: [{ ticker: 'KXNBATOTAL-26OCT20BOSDET-221', floor_strike: 220.5 }],
  props: { points: [{ title: 'Jalen Duren: 20+ points', floor_strike: 19.5 }], assists: null } };
const team = { Celtics: 'BOS', Pistons: 'DET' };
const P = (q) => matchOne({ mtype: 'prop', period: 'full_game' }, q, k, team);

test('parseProp', () => {
  assert.deepStrictEqual(parseProp('Will Jalen Duren record at least 20 points in BOS Celtics vs. DET Pistons?'), { player: 'Jalen Duren', stat: 'points', n: 20 });
  assert.strictEqual(parseProp('Will X record at least 2 three-point field goals made in A vs. B?').stat, 'threes');
  assert.strictEqual(parseProp('Will X record at least 8 total rebounds in A vs. B?').stat, 'rebounds');
  assert.strictEqual(parseProp('Who will win?'), null);
});
test('props: same player + stat + threshold only', () => {
  assert.strictEqual(P('Will Jalen Duren record at least 20 points in A?'), true);
  assert.strictEqual(P('Will Jalen Duren record at least 15 points in A?'), false);
  assert.strictEqual(P('Will Daniss Jenkins record at least 10 points in A?'), false);
  assert.strictEqual(P('Will Jalen Duren record at least 5 assists in A?'), null);   // series fetch failed -> unchecked
});
test('game lines', () => {
  assert.strictEqual(matchOne({ mtype: 'winner', period: 'full_game', teams: ['Celtics', 'Pistons'] }, '', k, team), true);
  assert.strictEqual(matchOne({ mtype: 'total', period: 'full_game', line: 220.5 }, '', k, team), true);
  assert.strictEqual(matchOne({ mtype: 'total', period: 'full_game', line: 219.5 }, '', k, team), false);
  assert.strictEqual(matchOne({ mtype: 'spread', period: 'full_game', line: -1.5, teams: ['Celtics', 'Pistons'] }, '', k, team), true);
  assert.strictEqual(matchOne({ mtype: 'spread', period: 'full_game', line: 15.5, teams: ['Celtics', 'Pistons'] }, '', k, team), true);
  assert.strictEqual(matchOne({ mtype: 'spread', period: 'full_game', line: -15.5, teams: ['Celtics', 'Pistons'] }, '', k, team), false);
  assert.strictEqual(matchOne({ mtype: 'total', period: 'first_quarter', line: 58.5 }, '', k, team), null);
  assert.strictEqual(matchOne({ mtype: 'team_total', period: 'full_game', line: 100.5 }, '', k, team), null);
  assert.strictEqual(matchOne({ mtype: 'total', line: 220.5 }, '', null, team), null);   // Kalshi unreachable
});
test('helpers', () => {
  assert.strictEqual(kDate('2026-10-20'), '26OCT20');
  assert.deepStrictEqual(teamMap('BOS Celtics vs. DET Pistons'), { Celtics: 'BOS', Pistons: 'DET' });
  assert.ok(codes('sa').includes('SAS'));
});
test('badges never claim Kalshi unless true', () => {
  assert.deepStrictEqual(LB.platBadges({ kalshi: true }).map(b => b.text), ['Polymarket ✓', 'Kalshi ✓']);
  assert.deepStrictEqual(LB.platBadges({ kalshi: false }).map(b => b.text), ['Polymarket ✓', 'Kalshi —']);
  assert.deepStrictEqual(LB.platBadges({}).map(b => b.text), ['Polymarket ✓']);
  assert.deepStrictEqual(LB.platBadges({ kalshi: null }).map(b => b.text), ['Polymarket ✓']);
});
