// node tests/live-picks.test.js — LivePicks.reprice (fake fetcher, no network).
const assert = require('assert'); const LP = require('../js/live-picks.js');
const now = Date.parse('2026-10-19T23:10:00Z');
const doc = { sections: {
  singles: [{ id: 's1', price: 48, fair: 49.5, edge: 1.5, market_id: 'm1', market_side: 'no', start_time: '2026-10-20T00:15:00Z' }],
  parlays: [{ id: 'x1', start_time: '2026-10-19T23:00:00Z', legs: [
    { market_id: 'm2', market_side: 'yes', price: 50, start_time: '2026-10-19T23:00:00Z' },
    { market_id: 'm3', market_side: 'yes', price: 71, start_time: '2026-10-20T00:15:00Z' },
    { market_id: 'm4', market_side: 'yes', price: 40, start_time: '2026-10-20T00:15:00Z' }] }],
  predictions: [{ id: 'g1', market_id: 'mX', market_side: 'yes', price: 50 }] } };
const live = { m1: 50, m2: 60, m3: 68 };   // m4 fails
LP.reprice(doc, async id => { if (id === 'mX') throw new Error('predictions must not be fetched'); if (!(id in live)) throw new Error('cors'); return live[id]; }, now).then(r => {
  const s = r.doc.sections.singles[0], legs = r.doc.sections.parlays[0].legs;
  assert.strictEqual(s.price, 50); assert.strictEqual(s.price_morning, 48); assert.strictEqual(s.edge, -0.5);
  assert.strictEqual(legs[0].price, 50, 'started leg untouched'); assert.strictEqual(legs[1].price, 68); assert.strictEqual(legs[2].price, 40, 'failed fetch keeps old price');
  assert.deepStrictEqual([r.ok, r.fail, r.skipped], [2, 1, 1]);
  assert.strictEqual(doc.sections.singles[0].price, 48, 'input not mutated');
  console.log('live-picks: ok');
}).catch(e => { console.error(e); process.exit(1); });
