/**
 * js/vegas.js — "Vegas" sportsbook odds next to the cents price (Reed, Oct 19 2026).
 * Browser: window.Vegas; Node: module.exports (for tests).
 *
 * WHAT IT DOES
 *   1. americanOf(cents)  cents -> American odds text, "+127" / "-150".
 *      p < 50: +round(100*(100-p)/p); p >= 50: -round(100*p/(100-p)).
 *      It is pure client-side math on the user's own app price (Polymarket US,
 *      Kalshi, or whatever they typed), so it is ALWAYS available.
 *   2. load() / lookup()  the best real sportsbook price for the exact same
 *      side, from data/vegas-lines.json (written by scripts/fetch-book-odds.mjs,
 *      HANDOFF §26). Missing, stale (older than 36 hours) or unpriced sides
 *      return null: nothing is ever guessed or filled in.
 *   3. centsText(cents) "44¢ (+127)" - the one small price line used everywhere.
 *
 * The file is keyed "<market_id>|<yes|no>" -> {p:"+120", b:"draftkings", n:5}
 * (p = best American price, b = that book, n = how many books priced it).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vegas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_AGE_MS = 36 * 3600e3;   // older than this = not shown
  let data = null;                  // parsed vegas-lines.json, or null

  /**
   * Cents (0-100, exclusive) -> American odds string. 50 shows as "+100".
   * @param {number} c cents @returns {string} "+127", "-150", or '' for a bad number
   */
  function americanOf(c) {
    if (typeof c !== 'number' || !isFinite(c) || !(c > 0 && c < 100)) return '';
    const a = Math.round(c >= 50 ? (-100 * c) / (100 - c) : (100 * (100 - c)) / c);
    return a === -100 ? '+100' : (a > 0 ? '+' : '') + a;
  }

  /** "44¢ (+127)" (cents to 1 decimal, no trailing .0). '' for a bad number. */
  function centsText(c) {
    const a = americanOf(c);
    return a ? `${Math.round(c * 10) / 10}¢ (${a})` : '';
  }

  /** Use a parsed file (tests, or after fetching). Anything not shaped right clears it. */
  function set(doc) { data = doc && typeof doc === 'object' && doc.lines && typeof doc.lines === 'object' ? doc : null; }

  /** Fetch data/vegas-lines.json once (no file = no Vegas lines, never an error). */
  async function load(url) {
    if (data) return data;
    try {
      const r = await fetch((url || 'data/vegas-lines.json') + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) set(await r.json());
    } catch (e) { /* offline or missing: no Vegas lines */ }
    return data;
  }

  /**
   * Best sportsbook price for one side of a Polymarket US market.
   * @param {string} marketId @param {'yes'|'no'} side @param {number} [now] ms, for tests
   * @returns {{p:string, book:string, n:number}|null} p like "+120"; null if unknown/stale
   */
  function lookup(marketId, side, now) {
    if (!data || !marketId || (side !== 'yes' && side !== 'no')) return null;
    const t = Date.parse(data.updated_at);
    if (!isFinite(t) || (now === undefined ? Date.now() : now) - t > MAX_AGE_MS) return null;
    const e = data.lines[marketId + '|' + side];
    return e && /^[+-]\d+$/.test(String(e.p)) ? { p: String(e.p), book: String(e.b || ''), n: Number(e.n) || 1 } : null;
  }

  return { americanOf, centsText, set, load, lookup, MAX_AGE_MS };
});
