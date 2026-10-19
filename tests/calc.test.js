/**
 * tests/calc.test.js — zero-dependency sanity tests for js/calc.js.
 * Run: node tests/calc.test.js   (exit code 1 on any failure)
 * Covers price parsing (cents, American, decimal, probability), parlay
 * multiple/hit chance, gap, EV and settled P/L.
 */
const C = require('../js/calc.js');
const a = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const near = (x, y, e = 1e-3) => Math.abs(x - y) < e;
a(near(C.parsePrice('63').p, .63), '63 cents');
a(near(C.parsePrice('-150').p, .6), '-150');
a(near(C.parsePrice('+120').p, 100/220), '+120');
a(near(C.parsePrice('2.5').p, .4), 'decimal 2.5');
a(near(C.parsePrice('0.63').p, .63), 'prob');
a(near(C.parsePrice('62.5%').p, .625), '62.5%');
a(near(C.parsePrice('2.5x').p, .4), '2.5x');
a(C.parsePrice('abc') === null && C.parsePrice('100') === null && C.parsePrice('-50') === null, 'rejects junk');
const pl = C.parlay([.63, .48]);
a(near(pl.estMultiple, 3.3069), 'est 3.31 from 63/48: ' + pl.estMultiple.toFixed(4));
a(near(pl.hitChance, .3024), 'hit');
a(near(C.gap(2.97, 3.31), -0.1027), 'gap -10.3%');
a(near(C.expectedValue(5, 2.97, .645*.497), 5*(2.97*.645*.497-1)), 'ev');
a(near(C.parlay([.33,.43]).estMultiple, 7.047), 'flyers+sharks 7.05');
a(near(C.profit(5, 2.97, 'won'), 9.85) && C.profit(5,3,'lost') === -5 && C.profit(5,3,'push') === 0, 'profit');
