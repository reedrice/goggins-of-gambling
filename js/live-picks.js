/**
 * js/live-picks.js — "Refresh prices" on the Picks tab (HANDOFF §37).
 *
 * Re-prices the pick cards in the browser with LIVE Polymarket US prices from
 * the public gateway (GET gateway.polymarket.us/v1/markets/{id}/bbo, which is
 * CORS-open, so no key and no server are needed). Nothing is written back
 * to the repo; it only changes what this page shows.
 *
 * Rules:
 *   - Only legs whose game has NOT started are re-priced (an in-game price
 *     is not the price the pick was made at).
 *   - The old price is kept as price_morning (unless one is already there)
 *     so the card can show "was X".
 *   - Singles with a `fair` get their edge re-computed (fair − price).
 *   - Vegas lines are untouched (they come from committed data only; the
 *     Odds API key never reaches the browser).
 * Pure: the fetcher is passed in, so node tests can fake it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LivePicks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Every pick object in a picks.json doc (all sections except game predictions). */
  const allPicks = doc => Object.entries((doc && doc.sections) || {})
    .filter(([k]) => k !== 'predictions').flatMap(([, list]) => list || []);

  /** True if the leg's game has started (or the time is unknown → treat as not started). */
  const started = (leg, pk, now) => { const t = Date.parse(leg.start_time || pk.start_time || ''); return isFinite(t) && t <= now; };

  /**
   * Re-price a COPY of the doc.
   * @param {object} doc picks.json
   * @param {(marketId:string, side:'yes'|'no') => Promise<number|null>} getPrice live buy price in chance points
   * @param {number} [now] ms
   * @returns {Promise<{doc:object, ok:number, fail:number, skipped:number, at:string}>}
   */
  async function reprice(doc, getPrice, now = Date.now()) {
    const out = JSON.parse(JSON.stringify(doc));
    let ok = 0, fail = 0, skipped = 0;
    const jobs = [];
    for (const pk of allPicks(out)) {
      const legs = Array.isArray(pk.legs) && pk.legs.length ? pk.legs : [pk];
      for (const l of legs) {
        if (!l.market_id || (l.market_side !== 'yes' && l.market_side !== 'no') || typeof l.price !== 'number') continue;
        if (started(l, pk, now)) { skipped++; continue; }
        jobs.push(getPrice(l.market_id, l.market_side).then(c => {
          if (!(typeof c === 'number' && c > 0 && c < 100)) { fail++; return; }
          ok++;
          if (c !== l.price) { if (typeof l.price_morning !== 'number') l.price_morning = l.price; l.price = c; }
          if (l === pk && typeof pk.fair === 'number' && 'edge' in pk) pk.edge = +(pk.fair - pk.price).toFixed(1);
        }, () => { fail++; }));
      }
    }
    await Promise.all(jobs);
    return { doc: out, ok, fail, skipped, at: new Date(now).toISOString() };
  }

  return { reprice, allPicks, started };
});
