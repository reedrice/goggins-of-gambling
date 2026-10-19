/**
 * tests/gametime.test.js — game start formatting, hints, snapshot lookup and
 * leg ordering (js/gametime.js). Run: node tests/gametime.test.js
 */
const assert = require('assert');
const G = require('../js/gametime.js');
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }
const S = { started: 'Started', startsMin: m => `Starts in ${m} min`, startsHours: (h, m) => `Starts in ${h}h${m ? ` ${m}m` : ''}`, startsDays: d => `Starts in ${d} days` };

test('format in Central', () => {
  assert.strictEqual(G.format('2026-10-20T00:08:00Z', 'America/Chicago'), 'Mon Oct 19 · 7:08 PM CT');
  assert.strictEqual(G.format('2026-12-01T18:00:00Z', 'America/Chicago'), 'Tue Dec 1 · 12:00 PM CT', 'CST also says CT');
  assert.strictEqual(G.format('2026-10-20T00:08:00Z', 'America/New_York'), 'Mon Oct 19 · 8:08 PM ET');
});
test('bad or missing times show nothing', () => {
  ['', null, undefined, 'tonight', '2026-10-19', 42].forEach(v => assert.strictEqual(G.format(v), ''));
  assert.strictEqual(G.hint('x', Date.now(), S), '');
});
test('hints', () => {
  const t = Date.parse('2026-10-20T00:15:00Z');
  assert.strictEqual(G.hint('2026-10-20T00:15:00Z', t - 25 * 60000, S), 'Starts in 25 min');
  assert.strictEqual(G.hint('2026-10-20T00:15:00Z', t - 125 * 60000, S), 'Starts in 2h 5m');
  assert.strictEqual(G.hint('2026-10-20T00:15:00Z', t - 120 * 60000, S), 'Starts in 2h');
  assert.strictEqual(G.hint('2026-10-20T00:15:00Z', t - 3 * 86400000, S), 'Starts in 3 days');
  assert.strictEqual(G.hint('2026-10-20T00:15:00Z', t + 60000, S), 'Started');
});
test('lookup by eventSlug, then by a game slug inside marketId', () => {
  const idx = { events: [{ slug: 'nfl-was-sf-2026-10-19', start_time: '2026-10-20T00:15:00Z' }, { slug: 'mlb-cle-tb-2026-10-19', start_time: '2026-10-20T00:08:00Z' }] };
  assert.strictEqual(G.lookup({ eventSlug: 'mlb-cle-tb-2026-10-19' }, idx), '2026-10-20T00:08:00Z');
  assert.strictEqual(G.lookup({ marketId: 'astatc-nfl-was-sf-2026-10-19-fs-was' }, idx), '2026-10-20T00:15:00Z');
  assert.strictEqual(G.lookup({ desc: 'typed by hand' }, idx), null);
  assert.strictEqual(G.lookup({ eventSlug: 'nhl-old-game-2026-09-01' }, idx), null);
  assert.strictEqual(G.lookup({ eventSlug: 'x' }, null), null);
});
test('sortLegs: earliest first, unknown last, stable', () => {
  const legs = [{ d: 'none1' }, { d: 'late', startTime: '2026-10-20T00:15:00Z' }, { d: 'early', startTime: '2026-10-20T00:08:00Z' }, { d: 'none2' }];
  assert.deepStrictEqual(G.sortLegs(legs).map(l => l.d), ['early', 'late', 'none1', 'none2']);
  assert.strictEqual(legs[0].d, 'none1', 'input not mutated');
});
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
