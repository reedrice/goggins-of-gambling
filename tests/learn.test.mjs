// node tests/learn.test.mjs — capture-closing.mjs + learn.mjs on MADE-UP TEST DATA (no network).
import assert from 'node:assert';
import { slugOf, kindOf, entriesFromPicks, mergeHistory, buyPrice, legResult, pickResult, inCloseWindow } from '../scripts/capture-closing.mjs';
import { MIN, parseCsv, gradedPredictions, calibration, marketShrink, categories, learn, marketChance } from '../scripts/learn.mjs';

// ---- capture-closing
assert.strictEqual(slugOf({ market_id: 'aec-nba-phi-ny-2026-10-20' }), 'nba-phi-ny-2026-10-20');
assert.strictEqual(slugOf({ market_id: 'rdc-x', polymarket_url: 'https://polymarket.us/event/fed-oct' }), 'fed-oct');
assert.deepStrictEqual(kindOf('astatc-nba-phi-ny-2026-10-20-pts-joeemb-gte25'), { type: 'prop', stat: 'pts' });
assert.deepStrictEqual(kindOf('tsc-nba-bos-det-2026-10-20-221pt5'), { type: 'total', stat: null });
const picksDoc = { slate_date: '2026-10-20', updated_at: '2026-10-19T18:00:00Z', sections: {
  predictions: [{ id: 'pr', win_prob: 60 }],
  singles: [{ id: 's1', sport: 'NBA', market_id: 'aec-nba-phi-ny-2026-10-20', market_side: 'no', price: 62, hit_prob: 64, stake_units: 0.5, start_time: '2026-10-20T23:00:00Z' }],
  parlays: [{ id: 'x1', sport: 'NBA', hit_prob: 20, legs: [{ market_id: 'aec-nba-phi-ny-2026-10-20', market_side: 'no', price: 62 }, { market_id: 'aec-nba-okc-sa-2026-10-20', market_side: 'no', price: 56 }] }],
  nonsports: [{ id: 'manual', price: 30 }] } };
const fresh = entriesFromPicks(picksDoc);
assert.deepStrictEqual(fresh.map(p => [p.id, p.category, p.type]), [['s1', 'single', 'moneyline'], ['x1', 'parlay', 'parlay']], 'predictions + no-market picks skipped');
const hist = { picks: [] };
assert.strictEqual(mergeHistory(hist, fresh), 2);
hist.picks[0].result = 'win';
assert.strictEqual(mergeHistory(hist, entriesFromPicks(picksDoc)), 0); assert.strictEqual(hist.picks[0].result, 'win', 'never replaced');
const ev = { event: { markets: [{ slug: 'aec-nba-phi-ny-2026-10-20', closed: false, bestAskQuote: { value: '0.40' }, bestBidQuote: { value: '0.37' } },
  { slug: 'done', closed: true, marketSides: [{ long: true, price: '0' }] }] } };
assert.strictEqual(buyPrice(ev, 'aec-nba-phi-ny-2026-10-20', 'yes'), 40);
assert.strictEqual(buyPrice(ev, 'aec-nba-phi-ny-2026-10-20', 'no'), 63);
assert.strictEqual(legResult(ev, 'done', 'no'), 'win'); assert.strictEqual(legResult(ev, 'aec-nba-phi-ny-2026-10-20', 'no'), null);
assert.strictEqual(pickResult([{ result: 'win' }, { result: null }]), 'pending');
assert.strictEqual(pickResult([{ result: 'loss' }, { result: null }]), 'loss');
assert.strictEqual(pickResult([{ result: 'win' }, { result: 'push' }]), 'win');
const t0 = Date.parse('2026-10-20T22:45:00Z');
assert.ok(inCloseWindow({ start_time: '2026-10-20T23:00:00Z', close: null }, t0, 20));
assert.ok(!inCloseWindow({ start_time: '2026-10-20T23:00:00Z', close: null }, Date.parse('2026-10-20T23:01:00Z'), 20), 'never after start');
assert.ok(!inCloseWindow({ start_time: '2026-10-20T23:00:00Z', close: 61 }, t0, 20), 'captured once');

// ---- learn
const csv = parseCsv('date,sport,game,predicted_winner,win_prob,projected_score,player_projections,actual_result,correct\n2026-10-19,NHL,A @ B,B,60,"B 3 – A 2","x, y",B 3 – A 1,TRUE\n2026-10-19,NHL,C @ D,D,55,,,,\n');
assert.strictEqual(csv[0].player_projections, 'x, y');
const gp = gradedPredictions({ predictions: [{ date: '2026-10-19', game: 'C @ D', result: 'loss', win_prob: 55 }] }, csv);
assert.deepStrictEqual(gp.map(x => [x.p, x.y]), [[55, 0], [60, 1]], 'ungraded csv rows skipped, no double count');
// Under MIN: adjustments stay 0 and say "collecting data".
const few = calibration(Array.from({ length: 10 }, (_, i) => ({ p: 65, y: i < 3 ? 1 : 0 })));
assert.deepStrictEqual([few[0].n, few[0].adjustment_pts, few[0].status], [10, 0, 'collecting data']);
// At MIN+: shrunk adjustment toward 0. 40 picks said 65, won 50% -> (50-65) * 40/140 = -4.3
const many = calibration(Array.from({ length: 40 }, (_, i) => ({ p: 65, y: i % 2 })));
assert.deepStrictEqual([many[0].adjustment_pts, many[0].status], [-4.3, 'applied']);
assert.strictEqual(marketShrink([{ h: 60, m: 50, y: 1 }]).weight, 1);
// Our picks said 60 where the market said 50, but they won only 50%: the fit says "trust the market" (w -> 0), pulled toward 1 for n = 40.
const ms = marketShrink(Array.from({ length: 40 }, (_, i) => ({ h: 60, m: 50, y: i % 2 })));
assert.strictEqual(ms.raw_weight, 0); assert.strictEqual(ms.weight, +(1 - 40 / 140).toFixed(2));
const P = (r, i) => ({ sport: 'NBA', type: 'prop', stat: 'pts', result: r, legs: [{ publish: 50, close: 50 + (i % 3) }] });
const cats = categories(Array.from({ length: 30 }, (_, i) => P(i < 18 ? 'win' : 'loss', i)));
assert.deepStrictEqual([cats[0].key, cats[0].n, cats[0].w, cats[0].units, cats[0].roi, cats[0].status], ['NBA · prop · pts', 30, 18, 6, 20, 'applied']);
assert.strictEqual(cats[0].trust, +(1 + 0.2 * 30 / 130).toFixed(2)); assert.strictEqual(cats[0].avg_clv, 1);
assert.strictEqual(categories(Array.from({ length: 29 }, (_, i) => P('win', i)))[0].trust, 1, 'trust waits for 30');
assert.strictEqual(marketChance([{ publish: 50 }, { publish: 50 }]), 25);
const empty = learn({ picks: [] }, { predictions: [] }, []);
assert.deepStrictEqual(empty.sample, { picks_logged: 0, picks_graded: 0, predictions_graded: 0, clv_legs: 0 });
assert.strictEqual(empty.market_shrink.weight, 1); assert.strictEqual(empty.clv.avg_pts, null);
assert.doesNotMatch(JSON.stringify(learn({ picks: Array.from({ length: 30 }, (_, i) => P('win', i)) }, null, csv)), /[$¢]/);
console.log('ok learning loop: history kept, closing only before start, calibration/shrink/trust gated at', MIN);
