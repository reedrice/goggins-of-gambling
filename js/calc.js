/**
 * js/calc.js — pure odds / parlay math. No DOM, no storage, no network.
 *
 * PURPOSE
 *   Converts the many ways a price is written into one implied probability,
 *   and computes the parlay numbers the calculator and tracker display.
 *   Kept dependency-free so it runs in the browser (window.BetCalc) and in
 *   Node for tests (module.exports).
 *
 * KEY DEFINITIONS
 *   p (probability)        0 < p < 1, the implied chance of a leg winning.
 *   multiple (decimal)     total return per $1 staked, INCLUDING the stake.
 *                          A Polymarket share bought at 40¢ pays $1 -> 2.5x.
 *   estimated multiple     product over legs of 1/p_i. This is what the
 *                          parlay "should" pay if the legs were independent
 *                          and each leg were priced at its own market price.
 *   independent hit chance product over legs of p_i (same independence
 *                          assumption; correlated legs hit more/less often).
 *   gap                    quoted / estimated - 1. Negative = the platform pays
 *                          less than the sum of its parts (typical for same-
 *                          game parlays where it prices correlation or adds
 *                          extra vig). Example: legs 64c+49c -> 1/(.64*.49) = 3.19x;
 *                          quoted 2.97 -> 2.97 / 3.19 - 1 = -6.9%.
 *   EV                     stake * (quoted * hitChance - 1): expected profit
 *                          if our hit chance is right. Uses the user-supplied
 *                          fair probabilities when given, else market prices.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BetCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Parse a price string into an implied probability.
   *
   * Accepted formats (whitespace ignored):
   *   American odds   "-150", "+120"  (sign required, |odds| >= 100)
   *                     negative: p = |o| / (|o| + 100)   -150 -> 0.600
   *                     positive: p = 100 / (o + 100)     +120 -> 0.4545
   *   Cents / percent  "63", "63c", "63¢", "63%", "62.5%"  -> 0.63 / 0.625
   *                     Any bare INTEGER 1..99 is treated as cents, because
   *                     that is how Polymarket/Kalshi display prices.
   *   Probability      "0.63"  (0 < v < 1)                 -> 0.63
   *   Decimal odds     "2.50", "1.91", "2.5x"  (has a decimal point or an
   *                     "x" suffix, v > 1)                  -> 1 / v
   *
   * Ambiguity rule: "63" is cents, "2.5" is decimal odds. To force cents on a
   * fractional price add "c" or "%" (e.g. "62.5c"); to force decimal add "x".
   *
   * @param {string|number} input raw user text
   * @returns {{p:number, kind:string, label:string}|null} null if unparseable
   *          or outside (0,1). kind is 'american'|'cents'|'prob'|'decimal'.
   */
  function parsePrice(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;

    let p = null, kind = null;
    const american = /^[+-]\d+(\.\d+)?$/.test(s);
    if (american && Math.abs(parseFloat(s)) >= 100) {
      const o = parseFloat(s);
      p = o < 0 ? -o / (-o + 100) : 100 / (o + 100);
      kind = 'american';
    } else if (/^\d+(\.\d+)?(c|¢|%)$/.test(s)) {
      p = parseFloat(s) / 100;
      kind = 'cents';
    } else if (/^\d+(\.\d+)?x$/.test(s)) {
      const d = parseFloat(s);
      p = d > 1 ? 1 / d : null;
      kind = 'decimal';
    } else if (/^\d*\.?\d+$/.test(s)) {
      const v = parseFloat(s);
      if (v > 0 && v < 1) { p = v; kind = 'prob'; }
      else if (/^\d+$/.test(s) && v >= 1 && v <= 99) { p = v / 100; kind = 'cents'; }
      else if (s.includes('.') && v > 1) { p = 1 / v; kind = 'decimal'; }
    }
    if (p === null || !isFinite(p) || p <= 0 || p >= 1) return null;
    return { p, kind, label: describe(p, kind) };
  }

  /**
   * Human-readable echo of a parsed price, shown under each calculator leg so
   * the user can confirm the app read their input the way they meant.
   * @param {number} p implied probability
   * @param {string} kind parse kind from parsePrice
   * @returns {string} e.g. "american → 60.0% (1.67x)"
   */
  function describe(p, kind) {
    return `${kind} → ${(p * 100).toFixed(1)}% (${(1 / p).toFixed(2)}x)`;
  }

  /**
   * Core parlay math over a list of leg probabilities.
   * @param {number[]} probs leg probabilities, each in (0,1)
   * @returns {{estMultiple:number, hitChance:number}|null} null if empty
   *   estMultiple = Π (1/p_i); hitChance = Π p_i = 1 / estMultiple.
   */
  function parlay(probs) {
    if (!probs || !probs.length) return null;
    let hit = 1;
    for (const p of probs) hit *= p;
    return { estMultiple: 1 / hit, hitChance: hit };
  }

  /**
   * Gap between what the platform actually quotes and our estimate.
   * @param {number} quoted platform's quoted multiple (e.g. 2.97)
   * @param {number} estimated our product-of-1/p estimate (e.g. 3.19)
   * @returns {number|null} quoted/estimated - 1 (e.g. -0.103), null if invalid
   */
  function gap(quoted, estimated) {
    if (!(quoted > 0) || !(estimated > 0)) return null;
    return quoted / estimated - 1;
  }

  /**
   * Expected profit of a slip.
   * @param {number} stake amount wagered (any currency; never persisted remotely)
   * @param {number} quoted quoted multiple incl. stake
   * @param {number} hitChance our believed probability the slip wins
   * @returns {number|null} stake * (quoted * hitChance - 1)
   */
  function expectedValue(stake, quoted, hitChance) {
    if (!(stake >= 0) || !(quoted > 0) || !(hitChance > 0)) return null;
    return stake * (quoted * hitChance - 1);
  }

  /**
   * Profit/loss of a settled bet.
   * @param {number} stake
   * @param {number} multiple quoted multiple incl. stake
   * @param {'won'|'lost'|'push'|'open'} status
   * @returns {number} won: stake*(multiple-1); lost: -stake; push/open: 0
   */
  function profit(stake, multiple, status) {
    if (status === 'won') return stake * (multiple - 1);
    if (status === 'lost') return -stake;
    return 0;
  }

  /**
   * Edge in percentage points between fair probability and the price paid.
   * @param {number} fairPct fair (no-vig) probability, 0..100
   * @param {number} pricePct price paid in cents/percent, 0..100
   * @returns {number} fairPct - pricePct (positive = value)
   */
  function edgePts(fairPct, pricePct) {
    return fairPct - pricePct;
  }

  /**
   * Price in cents -> American odds (whole number).
   * Formula from the owner's spec, with p in percent (0–100):
   *   p >= 50 :  -100 * p / (100 - p)     63 -> -170.27 -> -170
   *   p <  50 :  +100 * (100 - p) / p     48 -> +108.33 -> +108
   * Exactly 50 gives -100, which is the same price as +100 ("even money");
   * formatPrice() shows it as "+100".
   * @param {number} pct cents/percent, 0 < pct < 100
   * @returns {number|null} e.g. -170, 108; null if out of range
   */
  function toAmerican(pct) {
    if (!(pct > 0 && pct < 100)) return null;
    return Math.round(pct >= 50 ? (-100 * pct) / (100 - pct) : (100 * (100 - pct)) / pct);
  }

  /**
   * Display a price (cents) in the user's chosen format.
   * @param {number} pct cents, e.g. 63 or 63.5
   * @param {'cents'|'american'|'decimal'} [format] default 'cents'
   * @returns {string} "63¢" | "-170" | "+108" | "+100" | "1.59"
   */
  function formatPrice(pct, format = 'cents') {
    if (!(pct > 0 && pct < 100)) return '—';
    if (format === 'american') {
      const a = toAmerican(pct);
      return a === -100 ? '+100' : (a > 0 ? '+' : '') + a;   // evens shown as +100
    }
    if (format === 'decimal') return (100 / pct).toFixed(2);
    return (Math.round(pct * 10) / 10) + '¢';
  }

  /**
   * Plain-language payout for one price (the "41¢ · $10 pays $24.39 · 41%
   * chance" line). A share costs `cents` and pays $1 if it wins, so a stake
   * buys stake / (cents/100) shares and a win pays that many dollars back
   * (stake included).
   * @param {number} cents price, 0 < cents < 100
   * @param {number} stake example stake in dollars (the user's own unit, computed in the browser only)
   * @returns {{shares:number, pays:number, profit:number, chance:number}|null}
   *   pays/profit rounded to cents; chance = the price read as a % (rounded); null on bad input
   */
  function payout(cents, stake) {
    if (typeof cents !== 'number' || !(cents > 0 && cents < 100) || !(stake > 0) || !isFinite(stake)) return null;
    const shares = stake * 100 / cents;
    const r2 = x => Math.round(x * 100) / 100;
    return { shares, pays: r2(shares), profit: r2(shares - stake), chance: Math.round(cents) };
  }

  /**
   * What a whole slip pays back if every leg hits: stake × multiple.
   * @param {number} stake dollars @param {number} multiple e.g. 3.44
   * @returns {number|null} rounded to cents
   */
  function slipPays(stake, multiple) {
    if (!(stake > 0) || !(multiple >= 1) || !isFinite(stake * multiple)) return null;
    return Math.round(stake * multiple * 100) / 100;
  }

  /**
   * Per-platform numbers for the Record tab's "How each app's prices compare"
   * table. Pure, so it's unit-tested in Node.
   *
   * @param {object[]} records data/bet-log.json records ({platform: name, gap})
   * @param {object[]} comparisons data/book-odds.json comparisons (see groupPrices)
   * @param {{id:string,name:string}[]} platforms APP_CONFIG.platforms
   * @param {string} [baseline='polymarket_us'] the user's "My platform" id:
   *   every feed diff is "that app's price minus YOUR app's price" for the
   *   same bet at the same check (compareToBaseline). The baseline's own row
   *   has feed.n = 0.
   * @returns {{rows: {id,name,logged:{n,avgGap},feed:{n,avgDiff},total:number}[],
   *            other: {n,avgGap}}} avg* are null when n = 0. `other` collects
   *   logged bets whose platform isn't in the list ("Other" row).
   */
  function platformSummary(records, comparisons, platforms, baseline) {
    const acc = () => ({ n: 0, sum: 0 });
    const logged = {}, feed = {}, other = acc();
    const names = new Set(platforms.map(p => p.name));
    (records || []).forEach(r => {
      if (!r || typeof r.gap !== 'number' || !isFinite(r.gap)) return;
      const b = names.has(r.platform) ? (logged[r.platform] = logged[r.platform] || acc()) : other;
      b.n++; b.sum += r.gap;
    });
    const cmp = compareToBaseline(comparisons, baseline || 'polymarket_us');
    Object.entries(cmp).forEach(([id, v]) => (feed[id] = v));
    const avg = (b, k) => ({ n: b ? b.n : 0, [k]: b && b.n ? b.sum / b.n : null });
    const rows = platforms.map(p => {
      const l = avg(logged[p.name], 'avgGap'), f = feed[p.id] || { n: 0, avgDiff: null };   // feed is already averaged
      return { id: p.id, name: p.name, logged: l, feed: f, total: l.n + f.n };
    });
    return { rows, other: avg(other, 'avgGap') };
  }

  // ------------------------------------------- baseline = "My platform"
  // data/book-odds.json has one row per (bet, other app, check). Each row
  // carries the Polymarket US price (polymarket_price) and, since Oct 19
  // 2026, the Kalshi price from the market snapshot (kalshi_price), so the
  // comparison can be made against EITHER app. Rows are grouped per bet and
  // check; inside a group every app has at most one price.

  const isCents = v => typeof v === 'number' && isFinite(v) && v > 0 && v < 100;

  /**
   * Group book-odds rows into one price list per bet and check.
   * Price sources per app id:
   *   polymarket_us : row.polymarket_price
   *   kalshi        : row.kalshi_price (snapshot ask), else a "kalshi" feed row's book_chance
   *   anything else : that app's row book_chance
   * @param {object[]} comparisons
   * @returns {{key:string, date, market_id, side, refs:object[], fetched_at, prices:Object<string,number>, rows:Object<string,object>}[]}
   */
  function groupPrices(comparisons) {
    const groups = new Map();
    (comparisons || []).forEach(c => {
      if (!c || !c.market_id) return;
      const key = [c.date, c.market_id, c.side, c.fetched_at].join('|');
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { key, date: c.date, market_id: c.market_id, side: c.side, refs: c.refs || [], fetched_at: c.fetched_at, prices: {}, rows: {} }));
      if (isCents(c.polymarket_price)) g.prices.polymarket_us = c.polymarket_price;
      if (isCents(c.kalshi_price)) g.snapKalshi = c.kalshi_price;
      if (c.book && isCents(c.book_chance)) { g.rows[c.book] = c; g.prices[c.book] = c.book_chance; }
    });
    // Kalshi: the snapshot ask (what the Kalshi app charges) beats the feed's
    // "kalshi" row, whatever order the rows came in.
    return [...groups.values()].map(g => {
      if (isCents(g.snapKalshi)) g.prices.kalshi = g.snapKalshi;
      delete g.snapKalshi;
      return g;
    });
  }

  /**
   * Average price difference of every app vs. the baseline app, in cents
   * (positive = that app costs more than yours, so it pays less). A bet with
   * no baseline price is left out of every average (the UI shows a dash).
   * @param {object[]} comparisons @param {string} baseline app id
   * @returns {Object<string,{n:number,avgDiff:number|null}>}
   */
  function compareToBaseline(comparisons, baseline) {
    const acc = {};
    groupPrices(comparisons).forEach(g => {
      const base = g.prices[baseline];
      if (!isCents(base)) return;
      Object.entries(g.prices).forEach(([id, p]) => {
        if (id === baseline) return;
        const a = acc[id] = acc[id] || { n: 0, sum: 0 };
        a.n++; a.sum += p - base;
      });
    });
    const out = {};
    Object.entries(acc).forEach(([id, a]) => (out[id] = { n: a.n, avgDiff: a.n ? a.sum / a.n : null }));
    return out;
  }

  return { parsePrice, describe, parlay, gap, expectedValue, profit, edgePts, toAmerican, formatPrice, payout, slipPays, platformSummary, groupPrices, compareToBaseline };
});
