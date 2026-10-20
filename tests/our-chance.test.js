// Our chance blend math (HANDOFF §56)
const assert = require('assert'), OC = require('../js/our-chance.js');
const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
near(OC.shrink(7, 10, 0.5, 4), 9 / 14);
near(OC.phi(0), 0.5); near(OC.phi(1.96), 0.975, 1e-3);
near(OC.implied('-150'), 0.6); near(OC.implied('+150'), 0.4);
near(OC.noVig('-110', '-110'), 0.5);
near(OC.noVig('+100'), 0.5 / 1.045);
assert.strictEqual(OC.logAvg([{ p: 0.6, w: 1 }, { p: null, w: 1 }]).toFixed(3), '0.600');
near(OC.logAvg([{ p: 0.6, w: 1 }, { p: 0.4, w: 1 }]), 0.5);
// blend: drops missing parts, clamps 3-97, Vegas weighted most
assert.strictEqual(OC.blend({ market: 0.5 }).pct, 50);
assert.strictEqual(OC.blend({ market: 0.999, vegas: 0.999 }).pct, 97);
assert.strictEqual(OC.blend({ market: 0.001 }).pct, 3);
const b = OC.blend({ stats: { p: 0.7, games: 30 }, vegas: 0.58, market: 0.49 });
assert.ok(b.pct > 49 && b.pct < 70 && b.weights.vegas > b.weights.market);
assert.strictEqual(OC.blend({ stats: { p: 0.9, games: 0 }, market: 0.5 }).pct, 50);   // no games = no weight
assert.strictEqual(OC.blend({}), null);
// props: small samples shrink toward the season
const g = Array.from({ length: 20 }, (_, i) => ({ value: i < 10 ? 20 : 10, opp: i % 5 ? 'det' : 'nyk', home: i % 2 === 0 }));
const ps = OC.propStats(g, 15, { opp: 'nyk', home: true });
assert.strictEqual(ps.hits10, 10); assert.ok(ps.parts.l10 < 1 && ps.parts.l10 > ps.parts.season && ps.p > 0.5 && ps.p < 0.9);
assert.strictEqual(OC.propStats([], 5), null);
// games: better team favored, totals follow the expected total
const good = Array.from({ length: 10 }, (_, i) => ({ pf: 110, pa: 100, home: i % 2 === 0, opp: 'x' }));
const bad = Array.from({ length: 10 }, (_, i) => ({ pf: 100, pa: 110, home: i % 2 === 0, opp: 'y' }));
assert.ok(OC.gameStats('ml', 'nba', good, bad).p > 0.6);
assert.ok(OC.gameStats('ml', 'nba', bad, good).p < 0.4);
near(OC.gameStats('total', 'nba', good, bad, { line: 210 }).p, 0.5, 1e-6);
assert.ok(OC.gameStats('spread', 'nba', good, bad, { line: -30 }).p < 0.2);
// slugs
assert.deepStrictEqual(OC.parseSlug('asc-nba-bos-det-2026-10-20-neg-1pt5').line, -1.5);
assert.strictEqual(OC.parseSlug('tsc-nhl-bos-dal-2026-10-20-6pt5').kind, 'total');
assert.strictEqual(OC.parseSlug('aec-nfl-was-sf-2026-10-19').away, 'was');
assert.strictEqual(OC.parseSlug('astatc-nba-bos-det-2026-10-20-pts-jaytat-gte15').n, 15);
assert.strictEqual(OC.breakdown(b, '7 of 10'), 'History 7 of 10 · Vegas 58% · Market 49%');
console.log('our-chance ok');
