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
const slip = C.parlay([C.parsePrice('64').p, C.parsePrice('49').p]);
a(near(slip.estMultiple, 3.1888) && near(C.gap(2.97, slip.estMultiple), -0.0686), 'Reed slip 64/49: est 3.19x, gap -6.9%');
a(near(C.expectedValue(5, 2.97, .645*.497), 5*(2.97*.645*.497-1)), 'ev');
a(near(C.parlay([.33,.43]).estMultiple, 7.047), 'flyers+sharks 7.05');
a(near(C.profit(5, 2.97, 'won'), 9.85) && C.profit(5,3,'lost') === -5 && C.profit(5,3,'push') === 0, 'profit');

// Price display formats (cents default; American / decimal optional)
a(C.toAmerican(63) === -170, '63 -> -170');
a(C.toAmerican(48) === 108, '48 -> +108');
a(C.toAmerican(50) === -100 && C.formatPrice(50, 'american') === '+100', '50 -> evens (+100)');
a(C.formatPrice(48, 'american') === '+108' && C.formatPrice(63, 'american') === '-170', 'american strings');
a(C.formatPrice(63) === '63¢' && C.formatPrice(63.5) === '63.5¢', 'cents is the default');
a(C.formatPrice(40, 'decimal') === '2.50', 'decimal');
a(C.toAmerican(0) === null && C.formatPrice(100) === '—', 'out of range');
a(near(C.parsePrice('63.5c').p, .635) && near(C.parsePrice(String(C.toAmerican(63))).p, .63, .002), 'round-trips through parsePrice');

// Record tab: per-app summary (bets you logged / from odds feed / total)
{
  const plats = [{ id: 'polymarket_us', name: 'Polymarket US' }, { id: 'fanduel', name: 'FanDuel' }, { id: 'bet365', name: 'bet365' }];
  const recs = [{ platform: 'Polymarket US', gap: -0.06 }, { platform: 'Polymarket US', gap: -0.08 }, { platform: 'Some Book', gap: 0.1 }, { platform: 'FanDuel', gap: 'x' }];
  const cmp = [{ book: 'fanduel', diff: 2 }, { book: 'fanduel', diff: 3 }, { book: 'fanduel', diff: NaN }];
  const s = C.platformSummary(recs, cmp, plats);
  a(s.rows[0].logged.n === 2 && near(s.rows[0].logged.avgGap, -0.07) && s.rows[0].total === 2, 'logged count + avg gap');
  a(s.rows[1].logged.n === 0 && s.rows[1].feed.n === 2 && near(s.rows[1].feed.avgDiff, 2.5) && s.rows[1].total === 2, 'feed count + avg diff, bad rows skipped');
  a(s.rows[2].total === 0 && s.rows[2].logged.avgGap === null && s.rows[2].feed.avgDiff === null, 'empty row');
  a(s.other.n === 1 && near(s.other.avgGap, 0.1), 'unlisted platforms -> Other');
  a(C.platformSummary(null, null, plats).rows.length === 3, 'tolerates missing data');
}

// Payout explainer ("41¢ · $10 pays $24.39 · 41% chance"), js/calc.js payout / slipPays
{
  const p = C.payout(41, 10);
  a(p && p.pays === 24.39 && p.chance === 41 && near(p.shares, 24.390, 1e-3) && p.profit === 14.39, 'payout 41¢ $10 -> $24.39, 41%');
  a(C.payout(50, 10).pays === 20 && C.payout(50, 10).profit === 10, 'payout 50¢ doubles');
  a(C.payout(85, 10).pays === 11.76, 'payout 85¢ $10 -> $11.76');
  a(C.payout(48.1, 25).pays === 51.98 && C.payout(48.1, 25).chance === 48, 'payout decimal cents + custom stake');
  a(C.payout(1, 10).pays === 1000, 'payout 1¢ long shot');
  a([0, 100, -5, NaN, null, '41'].every(c => C.payout(c, 10) === null), 'payout rejects bad prices');
  a(C.payout(41, 0) === null && C.payout(41, -10) === null && C.payout(41, Infinity) === null, 'payout rejects bad stakes');
  a(C.slipPays(10, 3.44) === 34.4 && C.slipPays(5, 24.94) === 124.7, 'slipPays stake × multiple');
  a(C.slipPays(0, 3) === null && C.slipPays(10, 0.5) === null && C.slipPays(10, null) === null, 'slipPays rejects bad input');
}
