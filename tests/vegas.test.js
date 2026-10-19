/** tests/vegas.test.js — cents -> American odds and the Vegas lookup (js/vegas.js). Run: node tests/vegas.test.js */
const assert = require('assert');
const V = require('../js/vegas.js');
const C = require('../js/calc.js');
let fails = 0;
function test(n, f) { try { f(); console.log('ok', n); } catch (e) { fails++; console.log('FAIL', n, '-', e.message); } }

test('americanOf: Reed example 44c = +127', () => assert.strictEqual(V.americanOf(44), '+127'));
test('americanOf: favourites are negative', () => { assert.strictEqual(V.americanOf(60), '-150'); assert.strictEqual(V.americanOf(63), '-170'); assert.strictEqual(V.americanOf(80), '-400'); });
test('americanOf: underdogs are positive', () => { assert.strictEqual(V.americanOf(25), '+300'); assert.strictEqual(V.americanOf(1), '+9900'); assert.strictEqual(V.americanOf(48), '+108'); });
test('americanOf: 50 is +100 and bad input is empty', () => { assert.strictEqual(V.americanOf(50), '+100'); [0, 100, -5, NaN, '44', null].forEach(v => assert.strictEqual(V.americanOf(v), '')); });
test('americanOf agrees with BetCalc.formatPrice for every cent', () => { for (let c = 1; c < 100; c++) assert.strictEqual(V.americanOf(c), C.formatPrice(c, 'american'), String(c)); });
test('centsText', () => { assert.strictEqual(V.centsText(44), '44¢ (+127)'); assert.strictEqual(V.centsText(63.5), '63.5¢ (-174)'); assert.strictEqual(V.centsText(0), ''); });
test('lookup: found, missing, wrong side, stale, bad entries', () => {
  const now = Date.parse('2026-10-19T18:00:00Z');
  V.set({ updated_at: '2026-10-19T12:00:00Z', lines: { 'aec-x|yes': { p: '+133', b: 'bovada', n: 5 }, 'aec-y|no': { p: 'oops' } } });
  assert.deepStrictEqual(V.lookup('aec-x', 'yes', now), { p: '+133', book: 'bovada', n: 5 });
  assert.strictEqual(V.lookup('aec-x', 'no', now), null);
  assert.strictEqual(V.lookup('aec-nope', 'yes', now), null);
  assert.strictEqual(V.lookup('aec-y', 'no', now), null);
  assert.strictEqual(V.lookup('aec-x', 'maybe', now), null);
  assert.strictEqual(V.lookup('aec-x', 'yes', now + 40 * 3600e3), null, 'older than 36h is hidden');
  V.set(null); assert.strictEqual(V.lookup('aec-x', 'yes', now), null);
});
process.exit(fails ? 1 : 0);
