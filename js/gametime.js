/**
 * js/gametime.js — game start times for slip legs and saved bets (browser + Node).
 *
 * PURPOSE
 *   Every leg on the slip and on saved bets shows when its game starts, in
 *   plain words in the viewer's own time zone:
 *       "Mon Oct 19 · 7:08 PM CT · Starts in 2h 5m"
 *   Exposed as window.GameTime / module.exports.
 *
 * WHERE THE TIME COMES FROM (never invented)
 *   1. leg.startTime (ISO), stored when the leg is added from the market
 *      picker (the snapshot/live event's start_time) and saved with the bet.
 *   2. Otherwise lookup(): find the game in the market snapshot
 *      (data/markets/index.json) by the leg's eventSlug, or by a game slug
 *      contained in its marketId ("aec-nfl-was-sf-2026-10-19" contains game
 *      "nfl-was-sf-2026-10-19"). The app then stores it on the leg, so it
 *      survives after the game drops out of the 4-day snapshot.
 *   3. Nothing found (typed-in legs, old games): show nothing.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameTime = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** @param {*} iso @returns {boolean} a parseable ISO-ish timestamp */
  const valid = iso => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && !isNaN(Date.parse(iso));

  /** "CDT"/"CST" -> "CT" (also ET, MT, PT); other zones stay as the browser names them. */
  function zoneLabel(z) {
    const m = /^([ECMP])[DS]T$/.exec(z || '');
    return m ? m[1] + 'T' : z || '';
  }

  /**
   * "Mon Oct 19 · 7:08 PM CT".
   * @param {string} iso @param {string} [timeZone] IANA zone; default = the browser's own
   * @returns {string} '' when iso is missing or bad
   */
  function format(iso, timeZone) {
    if (!valid(iso)) return '';
    const d = new Date(iso);
    const o = timeZone ? { timeZone } : {};
    const parts = {};
    new Intl.DateTimeFormat('en-US', Object.assign({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }, o))
      .formatToParts(d).forEach(p => (parts[p.type] = p.value));
    return `${parts.weekday} ${parts.month} ${parts.day} · ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${zoneLabel(parts.timeZoneName)}`.trim();
  }

  /**
   * Short countdown hint. We don't know final scores here, so a past start
   * only ever says "Started" (never "Final").
   * @param {string} iso @param {number} now ms @param {object} S STR.gameTime
   * @returns {string}
   */
  function hint(iso, now, S) {
    if (!valid(iso)) return '';
    const mins = Math.round((Date.parse(iso) - now) / 60000);
    if (mins <= 0) return S.started;
    if (mins < 60) return S.startsMin(mins);
    if (mins < 48 * 60) return S.startsHours(Math.floor(mins / 60), mins % 60);
    return S.startsDays(Math.round(mins / 1440));
  }

  /**
   * Start time of a leg's game from the snapshot index.
   * @param {object} leg {eventSlug?, marketId?}
   * @param {object|null} index data/markets/index.json
   * @returns {string|null} ISO
   */
  function lookup(leg, index) {
    if (!leg || !index || !Array.isArray(index.events)) return null;
    const evs = index.events;
    let ev = leg.eventSlug ? evs.find(e => e.slug === leg.eventSlug) : null;
    if (!ev && leg.marketId) ev = evs.find(e => String(leg.marketId).includes(e.slug));
    return ev && valid(ev.start_time) ? ev.start_time : null;
  }

  /**
   * Legs in game order (earliest first); legs without a time keep their
   * relative order at the end. Returns a NEW array.
   * @param {object[]} legs @param {(l:object)=>string|null} timeOf
   */
  function sortLegs(legs, timeOf) {
    const t = l => { const v = timeOf ? timeOf(l) : l.startTime; return valid(v) ? Date.parse(v) : Infinity; };
    return (legs || []).map((l, i) => ({ l, i, t: t(l) })).sort((a, b) => a.t - b.t || a.i - b.i).map(x => x.l);
  }

  return { valid, zoneLabel, format, hint, lookup, sortLegs };
});
