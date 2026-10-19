// node tests/play.test.js — play money math (js/play.js). TEST DATA only.
const assert = require('node:assert');
const P = require('../js/play.js');
assert.strictEqual(P.american(40), '+150'); assert.strictEqual(P.american(60), '-150'); assert.strictEqual(P.american(50), '+100');
assert.strictEqual(P.getBack(100, [44]), 227);            // 100 / 0.44 = 227.27 -> 227
assert.strictEqual(P.getBack(100, [50, 50]), 400);
assert.strictEqual(P.comboOdds([50, 50]), '+300');
assert.strictEqual(P.gameSlug('aec-nba-phi-ny-2026-10-20'), 'nba-phi-ny-2026-10-20');
assert.strictEqual(P.gameSlug('tsc-mlb-cle-tb-2026-10-19-6pt5'), 'mlb-cle-tb-2026-10-19');
// Results from a (made-up) closed market: long ("yes") side price "0" -> the other side won.
const ev = { event: { markets: [
  { slug: 'aec-nfl-dal-gb-2026-10-18', closed: true, marketSides: [{ long: true, price: '0' }, { long: false, price: '1' }] },
  { slug: 'tsc-x-a-b-2026-10-18-40pt5', closed: true, marketSides: [{ long: true, price: '0.5' }, { long: false, price: '0.5' }] },
  { slug: 'open-x-a-b-2026-10-18', closed: false, marketSides: [{ long: true, price: '0.6' }] } ] } };
assert.strictEqual(P.legResult(ev, 'aec-nfl-dal-gb-2026-10-18', 'no'), 'win');
assert.strictEqual(P.legResult(ev, 'aec-nfl-dal-gb-2026-10-18', 'yes'), 'loss');
assert.strictEqual(P.legResult(ev, 'tsc-x-a-b-2026-10-18-40pt5', 'yes'), 'push');
assert.strictEqual(P.legResult(ev, 'open-x-a-b-2026-10-18', 'yes'), null);
const bet = { stake: 100, legs: [{ c: 50 }, { c: 50 }] };
assert.deepStrictEqual(P.settle(bet, ['win', 'win']), { status: 'won', ret: 400 });
assert.deepStrictEqual(P.settle(bet, ['win', 'loss']), { status: 'lost', ret: 0 });
assert.deepStrictEqual(P.settle(bet, ['loss', null]), { status: 'lost', ret: 0 }, 'one loss settles early');
assert.deepStrictEqual(P.settle(bet, ['win', null]), { status: 'open', ret: 0 });
assert.deepStrictEqual(P.settle(bet, ['win', 'push']), { status: 'won', ret: 200 }, 'push leg dropped');
assert.deepStrictEqual(P.settle(bet, ['push', 'push']), { status: 'push', ret: 100 });
const L = (c, d) => ({ marketId: 'aec-nfl-dal-gb-2026-10-18', side: 'no', c, desc: d });
const bets = [
  { id: 'a', at: '2026-10-18T10:00:00Z', stake: 100, legs: [L(40, 'A')], status: 'won', ret: 250 },
  { id: 'b', at: '2026-10-18T11:00:00Z', stake: 200, legs: [L(50, 'B')], status: 'lost', ret: 0 },
  { id: 'c', at: '2026-10-18T12:00:00Z', stake: 50, legs: [L(60, 'C')], status: 'open', ret: 0 } ];
const s = P.stats(bets);
assert.strictEqual(s.points, 1000 - 350 + 250); assert.strictEqual(s.w, 1); assert.strictEqual(s.l, 1); assert.strictEqual(s.open, 1);
assert.strictEqual(+s.roi.toFixed(3), -0.167); assert.deepStrictEqual(s.best, { ret: 250, odds: '+150', desc: 'A' });
assert.strictEqual(P.checkNew(bets, 2000, [L(50)]), 'broke');
assert.strictEqual(P.checkNew(bets, 100, [{ marketId: 'x', side: 'yes', c: 0 }]), 'price');
assert.strictEqual(P.checkNew(bets, 100, [L(50)]), null);
assert.ok(P.validName('Reed R')); assert.ok(!P.validName('x')); assert.ok(!P.validName('<b>hi</b>'));
// Submissions: round trip through an issue body, junk dropped, replay drops bets the points couldn't cover.
const body = 'hi\n```json\n' + JSON.stringify(P.submission('Reed', bets)) + '\n```';
const sub = P.parseSubmission(body);
assert.strictEqual(sub.name, 'Reed'); assert.strictEqual(sub.bets.length, 3); assert.ok(!('status' in sub.bets[0]), 'statuses are not trusted');
assert.strictEqual(P.parseSubmission('```json\n{"v":1,"name":"<x>","bets":[]}\n```'), null);
const big = [{ id: 'z', at: '2026-10-18T09:00:00Z', stake: 5000, legs: [L(50)], status: 'won', ret: 10000 }, ...bets];
assert.deepStrictEqual(P.replay(big).map(b => b.id), ['a', 'b', 'c']);
assert.doesNotMatch(JSON.stringify(P.submission('Reed', bets)), /[$¢]/);
console.log('ok play money math');
