/**
 * tests/live-bets.test.js — helpers in js/live-bets.js + the published data shape.
 * Run: node tests/live-bets.test.js
 */
const assert = require('assert');
const fs = require('fs');
const LB = require('../js/live-bets.js');

assert.strictEqual(LB.pays10(40), '25');             // $10 at +150 returns 25
assert.strictEqual(LB.pays10(30), '33');             // 33.33 rounds DOWN, no cents
assert.strictEqual(LB.pays10(0), null);
assert.strictEqual(LB.safeUrl('https://polymarket.us/x'), 'https://polymarket.us/x');
assert.strictEqual(LB.safeUrl('javascript:alert(1)'), null);
assert.deepStrictEqual(LB.sortEdges([{ edge: 5 }, { edge: 12, status: 'gone' }, { edge: 11 }]).map(e => e.edge), [11, 5, 12]);
assert.match(LB.statusText({ status: 'pregame', start_time: '2026-10-20T00:15:00Z', game_context: { available: true, game_state: 'pre', away: {}, home: {} } }), /kickoff 7:15 PM CT/);

// The real published file the view reads: right shape, no cents, no dollar figures.
const raw = fs.readFileSync(`${__dirname}/../data/live/${LB.SLUG}.json`, 'utf8'), d = JSON.parse(raw);
for (const k of ['slug', 'game', 'url', 'start_time', 'status', 'updated', 'open', 'edges']) assert.ok(k in d, k);
assert.strictEqual(d.slug, LB.SLUG);
assert.ok(['pregame', 'live', 'final'].includes(d.status));
assert.ok(d.open.length > 0 && d.open.every(o => o.sides && o.sides.length === 2));
for (const e of d.edges) {
  assert.ok(['big', 'slight'].includes(e.tier) && ['open', 'gone'].includes(e.status));
  assert.match(e.now_odds, /^[+-]\d+$/);
}
assert.doesNotMatch(raw, /\$|¢/);
assert.ok(LB.safeUrl(d.url));

// Grouping + cap (TEST DATA): props never push game lines out, each group capped.
const E = (id, group, edge, cls = 'edge', status = 'open') => ({ key: id, group, edge, class: cls, status, market: group === 'prop' ? 'Player prop' : 'Alt total' });
const edges = [
  ...Array.from({ length: 9 }, (_, i) => E('p' + i, 'prop', 4 + i)),          // 9 props, edges 4..12
  E('g1', 'game', 6), E('g2', 'game', 15), E('g3', 'game', 11, 'edge', 'gone'),
  E('s1', 'game', 20, 'score'), E('i1', 'prop', 8, 'injury'), E('n1', 'game', 30, 'news'), E('u1', 'game', 9, 'unverified'),
];
const g = LB.groupEdges(edges);
assert.strictEqual(LB.CAP, 5);
assert.deepStrictEqual(g.prop.shown.map(e => e.key), ['p8', 'p7', 'p6', 'p5', 'p4']);   // top 5, big to small
assert.strictEqual(g.prop.more.length, 4); assert.strictEqual(g.prop.total, 9);
assert.deepStrictEqual(g.game.shown.map(e => e.key), ['g2', 'u1', 'g1', 'g3']);          // gone last; unverified stays in main
assert.deepStrictEqual(g.reasons.map(e => e.key), ['n1', 's1', 'i1']);                  // explained moves go to "Moved for a reason"
assert.deepStrictEqual(LB.groupEdges(edges, 2).game.more.map(e => e.key), ['g1', 'g3']);
// Score header from ESPN-shaped context (TEST DATA).
const sb = LB.scoreboard({ game_context: { available: true, game_state: 'in', period: 2, clock: '9:14', possession: 'WSH', away: { abbr: 'WSH', score: 10 }, home: { abbr: 'SF', score: 17 } } });
assert.deepStrictEqual(sb, { score: 'WSH 10 – SF 17', status: 'Q2 9:14 · WSH ball' });
assert.match(LB.scoreboard({ game_context: { available: false }, status: 'live' }).status, /unavailable/);
console.log('ok live-bets helpers + data shape + grouping/cap');
