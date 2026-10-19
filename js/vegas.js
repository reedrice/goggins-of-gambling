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
 * A second file, data/vegas-manual.json (hand-read odds, e.g. Bovada props,
 * scripts/ingest-vegas.mjs, HANDOFF §27), has the same shape plus a per-entry
 * `at` (when it was read) and `src` ("bovada-manual"). Both are loaded; when
 * both price a side, the bigger payout wins. Each entry's age is checked
 * against its own `at` (else the file's updated_at).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Vegas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_AGE_MS = 36 * 3600e3;   // older than this = not shown
  let files = [];                   // parsed vegas-lines.json / vegas-manual.json docs

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

  const okDoc = d => d && typeof d === 'object' && d.lines && typeof d.lines === 'object';
  /** Use parsed files (tests, or after fetching). One doc or an array; bad ones are ignored. */
  function set(docs) { files = (Array.isArray(docs) ? docs : [docs]).filter(okDoc); }

  /** American text -> implied chance, for picking the bigger payout (lower = pays more). */
  const chanceOf = p => { const n = Number(p); return n > 0 ? 100 / (n + 100) : -n / (-n + 100); };

  let loading = null;
  /** Fetch both files once (a missing file = no lines from it, never an error). */
  function load() {
    if (loading) return loading;
    const get = u => fetch(u + '?t=' + Date.now(), { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    loading = Promise.all([get('data/vegas-lines.json'), get('data/vegas-manual.json')]).then(set);
    return loading;
  }

  /**
   * Best sportsbook price for one side of a Polymarket US market.
   * @param {string} marketId @param {'yes'|'no'} side @param {number} [now] ms, for tests
   * @returns {{p:string, book:string, n:number}|null} p like "+120"; null if unknown/stale
   */
  function lookup(marketId, side, now) {
    if (!marketId || (side !== 'yes' && side !== 'no')) return null;
    const t0 = now === undefined ? Date.now() : now;
    let best = null;
    for (const d of files) {
      const e = d.lines[marketId + '|' + side];
      if (!e || !/^[+-]\d{3,}$/.test(String(e.p)) || Math.abs(Number(e.p)) < 100) continue;
      const t = Date.parse(e.at || d.updated_at);
      if (!isFinite(t) || t0 - t > MAX_AGE_MS) continue;   // stale: hidden
      if (!best || chanceOf(e.p) < chanceOf(best.p)) best = { p: String(e.p), book: String(e.b || ''), n: Number(e.n) || 1 };
    }
    return best;
  }

  return { americanOf, centsText, set, load, lookup, MAX_AGE_MS };
});
