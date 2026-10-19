/** tests/trent.test.js — Fade Trent math (js/trent.js) + the real data file. Run: node tests/trent.test.js */
const assert = require('assert');
const T = require('../js/trent.js');
let fails = 0;
function test(n, f) { try { f(); console.log('ok', n); } catch (e) { fails++; console.log('FAIL', n, '-', e.message); } }
const pk = o => Object.assign({ id: 'x', league: 'NFL', game: 'g', pick: 'p', url: 'https://x.com/a/status/1', posted_at: '2026-10-19T00:00:00Z', unclear: false }, o);

test('winPerUnit', () => { assert.strictEqual(T.winPerUnit('+150'), 1.5); assert.ok(Math.abs(T.winPerUnit('-130') - 0.769) < 0.001); assert.strictEqual(T.winPerUnit('+99'), null); });
test('unitsFor: stated odds, assumed -110 for spreads, unknown ML', () => {
  assert.deepStrictEqual(T.unitsFor(pk({ result: 'win', units: 1, odds: '+150', type: 'moneyline' })), { u: 1.5, assumed: false });
  assert.deepStrictEqual(T.unitsFor(pk({ result: 'win', units: 3, odds: '-130', type: 'moneyline' })), { u: 2.31, assumed: false });
  assert.deepStrictEqual(T.unitsFor(pk({ result: 'win', units: 5, type: 'spread' })), { u: 4.55, assumed: true });
  assert.strictEqual(T.unitsFor(pk({ result: 'win', units: 5, type: 'moneyline' })), null);
  assert.deepStrictEqual(T.unitsFor(pk({ result: 'loss', units: 5, type: 'moneyline' })), { u: -5, assumed: false });
  assert.deepStrictEqual(T.unitsFor(pk({ result: 'push', units: 3 })), { u: 0, assumed: false });
  assert.strictEqual(T.unitsFor(pk({ result: 'pending', units: 5 })), null);
});
test('fade: flipped result, units only for spreads/totals', () => {
  assert.strictEqual(T.fadeResult(pk({ result: 'win' })), 'loss');
  assert.strictEqual(T.fadeResult(pk({ result: 'push' })), 'push');
  assert.strictEqual(T.fadeUnitsFor(pk({ result: 'loss', units: 5, type: 'spread' })), 4.55);
  assert.strictEqual(T.fadeUnitsFor(pk({ result: 'win', units: 5, type: 'spread' })), -5);
  assert.strictEqual(T.fadeUnitsFor(pk({ result: 'win', units: 1, type: 'moneyline', odds: '+150' })), null);
});
test('summary skips unclear + pending, win % ignores pushes', () => {
  const s = T.summary([pk({ result: 'win', units: 5, type: 'spread' }), pk({ result: 'loss', units: 5, type: 'spread', league: 'CFB' }), pk({ result: 'push' }), pk({ result: 'pending' }), pk({ result: 'pending', unclear: true })]);
  assert.strictEqual(`${s.all.w}-${s.all.l}-${s.all.p}`, '1-1-1');
  assert.strictEqual(s.all.winPct, 50); assert.strictEqual(s.all.pending, 1); assert.strictEqual(s.all.unclear, 1);
  assert.strictEqual(s.all.units, -0.45); assert.strictEqual(s.all.fadeUnits, -0.45);
  assert.strictEqual(s.byLeague.CFB.l, 1);
});
test('validate catches bad rows', () => {
  assert.deepStrictEqual(T.validate({ picks: [pk({ result: 'win', final_score: '1-0', graded_from: 'https://x' })] }), []);
  assert.ok(T.validate({ picks: [pk({ result: 'win' })] }).some(e => /real result/.test(e)));
  assert.ok(T.validate({ picks: [pk({ result: 'loss', unclear: true })] }).some(e => /unclear/.test(e)));
  assert.ok(T.validate({ picks: [pk({ result: 'won' })] }).length);
});
test('data/trent-picks.json is valid', () => {
  const doc = require('../data/trent-picks.json');
  assert.deepStrictEqual(T.validate(doc), []);
});
process.exit(fails ? 1 : 0);

// Every pick links to its exact tweet, built from the real post id.
{
  const assert = require('node:assert');
  const T2 = require('../js/trent.js');
  assert.strictEqual(T2.postUrl('2112235983144198591'), 'https://x.com/BookitWithTrent/status/2112235983144198591');
  for (const p of require('../data/trent-picks.json').picks) assert.strictEqual(p.url, T2.postUrl(p.post_id), p.id);
  console.log('ok every pick has its tweet link');
}
