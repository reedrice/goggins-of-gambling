// node tests/grade-live-alerts.test.mjs — live alerts record (scripts/grade-live-alerts.mjs). MADE-UP TEST DATA, no network.
import assert from 'node:assert';
import { american, chanceOf, winUnits, entriesFrom, mergeEntries, gradeFrom, totals, summarize } from '../scripts/grade-live-alerts.mjs';

assert.strictEqual(american(40), '+150'); assert.strictEqual(american(50), '+100'); assert.strictEqual(american(75), '-300');
assert.strictEqual(+chanceOf('+150').toFixed(1), 40); assert.strictEqual(winUnits('+150'), 1.5); assert.strictEqual(winUnits('-200'), 0.5);

const doc = { slug: 'nfl-aaa-bbb-2026-10-19', game: 'TEST AAA vs BBB', url: 'https://polymarket.us/sports/nfl/nfl-aaa-bbb-2026-10-19',
  open: [{ market_id: '11', market: 'Moneyline', sides: ['AAA win', 'BBB win'], yes_buy: 30, no_buy: 71 }],
  edges: [{ key: '12:1', open_odds: '+120' }],
  alerts: [
    { id: 'a1', key: '11:0', at: '2026-10-20T01:00:00Z', type: 'new_edge', tier: 'big', side: 'AAA win', market: 'Moneyline', now_odds: '+150', now_chance: 40, edge: 11, url: 'https://polymarket.us/x' },
    { id: 'a2', key: '12:1', at: '2026-10-20T01:10:00Z', type: 'new_edge', tier: 'slight', side: 'Under 44.5', market: 'Main total', now_odds: '-120', edge: 5 },
    { id: 'a3', key: '12:1', at: '2026-10-20T01:20:00Z', type: 'gone', tier: 'slight', side: 'Under 44.5' },          // not a bet
    { id: 'a4', key: '13:0', at: '2026-10-20T01:30:00Z', type: 'new_edge', tier: 'slight', side: 'X', now_odds: '+200' },
    { id: 'a5', key: '14:0', at: '2026-10-20T01:40:00Z', type: 'new_edge', tier: 'big', side: 'Y', now_odds: '+100' } ] };
const fresh = entriesFrom(doc, 'ignored');
assert.deepStrictEqual(fresh.map(e => e.id), ['a1', 'a2', 'a4', 'a5'], 'only bet alerts');
assert.strictEqual(fresh[0].opening_odds, american(30), 'opening odds from the snapshot when the alert has none');
assert.strictEqual(fresh[1].opening_odds, '+120', 'or from the edge');
assert.strictEqual(fresh[0].time_ct, 'Oct 19, 8:00 PM CT');
assert.strictEqual(fresh[0].link, 'https://polymarket.us/x'); assert.strictEqual(fresh[1].link, doc.url);

// Never delete, never overwrite: a later file without a1 keeps it; a re-sent a1 doesn't replace the logged one.
const rec = { entries: [] };
assert.strictEqual(mergeEntries(rec, fresh), 4);
rec.entries[0].result = 'loss';
assert.strictEqual(mergeEntries(rec, entriesFrom({ ...doc, alerts: [doc.alerts[0]] })), 0);
assert.strictEqual(rec.entries[0].result, 'loss', 'graded entry untouched');
assert.strictEqual(mergeEntries(rec, []), 0); assert.strictEqual(rec.entries.length, 4);

// Grading from a (made-up) settled event.
const ev = { event: { markets: [
  { id: '11', closed: true, marketSides: [{ long: true, price: '1' }, { long: false, price: '0' }] },   // AAA won
  { id: '12', closed: true, marketSides: [{ long: true, price: '1' }, { long: false, price: '0' }] },   // Over won -> Under (side 1) lost
  { id: '13', closed: true, marketSides: [{ long: true, price: '0.5' }] },                              // push
  { id: '14', closed: false, marketSides: [{ long: true, price: '0.6' }] } ] } };                        // still open
const g = rec.entries.map(e => gradeFrom(ev, e));
assert.deepStrictEqual(g, ['win', 'loss', 'push', null]);
assert.strictEqual(gradeFrom(ev, { ...rec.entries[0], side_index: null }), null, 'unknown side is never guessed');
assert.strictEqual(gradeFrom({ event: { markets: [{ id: '11', closed: true, archived: true, marketSides: [{ long: true }] }] } }, rec.entries[0]), 'void');

rec.entries.forEach((e, i) => (e.result = g[i] || 'pending'));
summarize(rec);
assert.deepStrictEqual([rec.totals.all.w, rec.totals.all.l, rec.totals.all.p, rec.totals.all.pending], [1, 1, 1, 1]);
assert.strictEqual(rec.totals.all.units, 0.5);           // +1.5 - 1
assert.strictEqual(rec.totals.all.roi, 25);              // 0.5 / 2
assert.strictEqual(rec.totals.all.hit_rate, 50);
assert.strictEqual(rec.totals.all.expected_rate, +((40 + chanceOf('-120')) / 2).toFixed(1));
assert.strictEqual(rec.totals.big.w, 1); assert.strictEqual(rec.totals.slight.l, 1);
assert.deepStrictEqual(totals([]).hit_rate, null);
assert.doesNotMatch(JSON.stringify(rec), /[$¢]/);
console.log('ok live alerts record: log forever, grade from real settlement, totals per tier');
