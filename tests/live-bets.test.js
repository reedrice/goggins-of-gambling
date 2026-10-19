/**
 * tests/live-bets.test.js — helpers in js/live-bets.js + the published data shape.
 * Run: node tests/live-bets.test.js
 */
const assert = require('assert');
const fs = require('fs');
const LB = require('../js/live-bets.js');

assert.strictEqual(LB.pays10(40), '25.00');          // $10 at +150 returns 25.00
assert.strictEqual(LB.pays10(0), null);
assert.strictEqual(LB.safeUrl('https://polymarket.us/x'), 'https://polymarket.us/x');
assert.strictEqual(LB.safeUrl('javascript:alert(1)'), null);
assert.deepStrictEqual(LB.sortEdges([{ edge: 5 }, { edge: 12, status: 'gone' }, { edge: 11 }]).map(e => e.edge), [11, 5, 12]);
assert.match(LB.statusText({ status: 'pregame', start_time: '2026-10-20T00:15:00Z' }), /kickoff 7:15 PM CT/);

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
console.log('ok live-bets helpers + data shape');
