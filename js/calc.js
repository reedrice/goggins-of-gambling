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

  return { parsePrice, describe, parlay, gap, expectedValue, profit, edgePts };
});
