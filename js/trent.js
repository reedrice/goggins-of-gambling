/**
 * js/trent.js — "Fade Trent" stats (data/trent-picks.json, HANDOFF §28).
 * Pure math, browser (window.Trent) + Node (tests, scripts/trent-picks.mjs).
 *
 * RULES
 *   - Only clear, graded picks count. `unclear: true` and `pending` never count.
 *   - Units: "5u" = 5 units risked. Win at stated odds: +150 -> +1.5 per unit,
 *     -130 -> +0.77 per unit. Spread/total with no odds stated: the standard
 *     -110 is assumed (flagged `assumed`). Moneyline with no odds: no unit
 *     result (we'd be guessing the price). Loss = -units. Push = 0.
 *   - Fade = the opposite side. Fade W-L-P is the flip of his result. Fade
 *     units only where the other side's price is known well enough: spreads
 *     and totals at the standard -110 (both sides). Moneyline fades: none.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Trent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RESULTS = ['pending', 'win', 'loss', 'push'];
  const r2 = n => Math.round(n * 100) / 100;

  /** Profit per 1 unit risked at American odds ("+150" -> 1.5, "-130" -> 0.769). null if bad. */
  function winPerUnit(odds) {
    const n = Number(odds);
    if (!isFinite(n) || Math.abs(n) < 100) return null;
    return n > 0 ? n / 100 : 100 / -n;
  }

  /** Does this pick count in the record? (clear + graded) */
  const counts = p => !!p && !p.unclear && ['win', 'loss', 'push'].includes(p.result);

  /**
   * His unit result for one pick. @returns {{u:number, assumed:boolean}|null} null = unknown
   */
  function unitsFor(p) {
    if (!counts(p) || !(p.units > 0)) return null;
    if (p.result === 'push') return { u: 0, assumed: false };
    if (p.result === 'loss') return { u: -p.units, assumed: false };
    let w = p.odds ? winPerUnit(p.odds) : null, assumed = false;
    if (w === null && (p.type === 'spread' || p.type === 'total')) { w = 100 / 110; assumed = true; }
    return w === null ? null : { u: r2(p.units * w), assumed };
  }

  /** Fade result: win<->loss, push stays. null if not counted. */
  const fadeResult = p => (!counts(p) ? null : p.result === 'win' ? 'loss' : p.result === 'loss' ? 'win' : 'push');

  /** Fade units (same stake on the other side, spreads/totals at -110 only). null if unknown. */
  function fadeUnitsFor(p) {
    const f = fadeResult(p);
    if (!f || !(p.units > 0) || !(p.type === 'spread' || p.type === 'total')) return null;
    return f === 'push' ? 0 : f === 'win' ? r2(p.units * 100 / 110) : -p.units;
  }

  /** Empty tally. */
  const blank = () => ({ w: 0, l: 0, p: 0, pending: 0, unclear: 0, units: 0, unitsN: 0, assumed: 0, fw: 0, fl: 0, fp: 0, fadeUnits: 0, fadeN: 0 });

  /**
   * Record overall and by league.
   * @param {object[]} picks @returns {{all:object, byLeague:Object<string,object>}}
   *   each: w,l,p, pending, unclear, winPct (0-100 or null), units (sum of known), unitsN (how many had units),
   *   assumed (how many used -110), fw/fl/fp (fade record), fadeUnits, fadeN
   */
  function summary(picks) {
    const all = blank(), byLeague = {};
    for (const p of picks || []) {
      const t = byLeague[p.league || '?'] || (byLeague[p.league || '?'] = blank());
      for (const s of [all, t]) {
        if (p.unclear) { s.unclear++; continue; }
        if (p.result === 'pending') { s.pending++; continue; }
        if (!counts(p)) continue;
        s[p.result === 'win' ? 'w' : p.result === 'loss' ? 'l' : 'p']++;
        const f = fadeResult(p); s[f === 'win' ? 'fw' : f === 'loss' ? 'fl' : 'fp']++;
        const u = unitsFor(p); if (u) { s.units = r2(s.units + u.u); s.unitsN++; if (u.assumed) s.assumed++; }
        const fu = fadeUnitsFor(p); if (fu !== null) { s.fadeUnits = r2(s.fadeUnits + fu); s.fadeN++; }
      }
    }
    const pct = s => (s.w + s.l ? Math.round((s.w / (s.w + s.l)) * 1000) / 10 : null);   // pushes left out
    [all, ...Object.values(byLeague)].forEach(s => { s.winPct = pct(s); s.fadePct = s.fw + s.fl ? Math.round((s.fw / (s.fw + s.fl)) * 1000) / 10 : null; });
    return { all, byLeague };
  }

  /**
   * Check a trent-picks.json doc. @returns {string[]} problems ([] = fine)
   */
  function validate(doc) {
    const errs = [];
    if (!doc || !Array.isArray(doc.picks)) return ['picks[] missing'];
    const ids = new Set();
    doc.picks.forEach((p, i) => {
      const at = `picks[${i}] (${p && p.id})`;
      if (!p || typeof p.id !== 'string' || !p.id) return errs.push(at + ': id missing');
      if (ids.has(p.id)) errs.push(at + ': duplicate id'); ids.add(p.id);
      if (!/^https:\/\/x\.com\/[A-Za-z0-9_]+\/status\/\d+$/.test(p.url || '')) errs.push(at + ': url must be an x.com status link');
      if (!isFinite(Date.parse(p.posted_at))) errs.push(at + ': posted_at must be a date');
      if (!p.league || !p.pick || !p.game) errs.push(at + ': league, game and pick are required');
      if (!RESULTS.includes(p.result)) errs.push(at + ': result must be ' + RESULTS.join('/'));
      if (p.odds != null && winPerUnit(p.odds) === null) errs.push(at + ': odds must be American like "+150"');
      if (p.units != null && !(p.units > 0)) errs.push(at + ': units must be > 0 or null');
      if (['win', 'loss'].includes(p.result) && !p.unclear && !(p.final_score && p.graded_from)) errs.push(at + ': graded picks need final_score + graded_from (real result)');
      if (p.unclear && p.result !== 'pending') errs.push(at + ': unclear picks stay pending (not graded)');
    });
    return errs;
  }

  return { RESULTS, winPerUnit, counts, unitsFor, fadeResult, fadeUnitsFor, summary, validate };
});
