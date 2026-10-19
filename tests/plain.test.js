/**
 * tests/plain.test.js — 2nd-grade wording helpers (js/plain.js).
 * Run: node tests/plain.test.js
 */
const assert = require('assert');
const P = require('../js/plain.js');
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

test('chanceWords: out of 10 for 30%+', () => {
  assert.deepStrictEqual(P.chanceWords(0.635), { kind: 'of10', n: 6 });
  assert.deepStrictEqual(P.chanceWords(0.41), { kind: 'of10', n: 4 });
  assert.deepStrictEqual(P.chanceWords(0.3), { kind: 'of10', n: 3 });
  assert.deepStrictEqual(P.chanceWords(0.94), { kind: 'of10', n: 9 });
  assert.deepStrictEqual(P.chanceWords(0.97), { kind: 'almost' });
});
test('chanceWords: 1 in N for small chances (round 10+ to 5s)', () => {
  assert.deepStrictEqual(P.chanceWords(0.235), { kind: 'oneIn', n: 4 });
  assert.deepStrictEqual(P.chanceWords(0.135), { kind: 'oneIn', n: 7 });
  assert.deepStrictEqual(P.chanceWords(0.05), { kind: 'oneIn', n: 20 });
  assert.deepStrictEqual(P.chanceWords(0.031), { kind: 'oneIn', n: 30 });
  assert.deepStrictEqual(P.chanceWords(0.29), { kind: 'oneIn', n: 3 });
});
test('chanceWords rejects bad input', () => {
  [0, 1, -1, NaN, '0.5', null].forEach(v => assert.strictEqual(P.chanceWords(v), null));
});
test('dots', () => {
  assert.strictEqual(P.dots(0.63), '●●●●●●○○○○');
  assert.strictEqual(P.dots(0.03), '●○○○○○○○○○');
  assert.strictEqual(P.dots(2), '');
});
test('splitTap', () => {
  assert.deepStrictEqual(P.splitTap('Guardians +1.5 runs (tap "Guardians +1.5")'), { title: 'Guardians +1.5 runs', tap: 'Guardians +1.5', note: null });
  assert.deepStrictEqual(P.splitTap('José Ramírez 1+ hits — YES'), { title: 'José Ramírez 1+ hits', tap: 'Yes', note: null });
  assert.deepStrictEqual(P.splitTap('Freddy Peralta 5+ strikeouts — NO (4 or fewer)'), { title: 'Freddy Peralta 5+ strikeouts', tap: 'No', note: '4 or fewer' });
  assert.deepStrictEqual(P.splitTap('Under 6.5'), { title: 'Under 6.5', tap: null, note: null });
  assert.deepStrictEqual(P.splitTap('Knicks to win (tap "Knicks")'), { title: 'Knicks to win', tap: 'Knicks', note: null });
});
test('spreadNote', () => {
  assert.deepStrictEqual(P.spreadNote('Guardians +1.5 runs', 'mlb'), { line: '+1.5', plus: true, n: 1, unit: 'run' });
  assert.deepStrictEqual(P.spreadNote('Rays -1.5', 'mlb'), { line: '-1.5', plus: false, n: 2, unit: 'runs' });
  assert.deepStrictEqual(P.spreadNote('Atlanta +7.5', 'wnba'), { line: '+7.5', plus: true, n: 7, unit: 'points' });
  assert.deepStrictEqual(P.spreadNote('Avalanche −1.5', 'nhl'), { line: '-1.5', plus: false, n: 2, unit: 'goals' });
  assert.strictEqual(P.spreadNote('José Ramírez 1+ hits', 'mlb'), null);
  assert.strictEqual(P.spreadNote('Under 6.5', 'mlb'), null);
});
test('leagueOf', () => {
  assert.strictEqual(P.leagueOf({ team: { league: 'MLB' } }), 'mlb');
  assert.strictEqual(P.leagueOf({ market_id: 'astatc-nfl-was-sf-2026-10-19-td-x-gte1' }), 'nfl');
  assert.strictEqual(P.leagueOf({}), '');
});
test('dealWord', () => {
  assert.strictEqual(P.dealWord(3.1), 'good');
  assert.strictEqual(P.dealWord(0.4), 'fair');
  assert.strictEqual(P.dealWord(-1.5), 'pricey');
  assert.strictEqual(P.dealWord(null), null);
});
test('noCents turns cents in text into American odds', () => {
  assert.strictEqual(P.noCents('Guardians +1.5 at 63.5¢ (books 64.5%). Purdy at 41¢.'), 'Guardians +1.5 at -174 (books 64.5%). Purdy at +144.');
  assert.strictEqual(P.noCents('50 ¢ even'), '+100 even');
  assert.strictEqual(P.noCents('no prices here'), 'no prices here');
  assert.strictEqual(P.noCents(null), '');
});
process.exit(fails ? 1 : 0);
