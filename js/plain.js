/**
 * js/plain.js — turn odds and prices into words a 2nd grader gets.
 * Pure helpers, no DOM / storage / network. Browser: window.Plain; Node: module.exports.
 *
 * PURPOSE (Reed, Oct 19 2026: "make it so simple a 2nd grader would get it")
 *   - Chances are said as "about 6 out of 10 times" or, when small,
 *     "about 1 in 4" / "1 in 20" instead of percentages (chanceWords).
 *   - A row of 10 dots shows the chance at a glance (dots).
 *   - Leg titles lose their 'tap "..."' / '— YES' instructions; those become
 *     a separate short "Tap: …" line (splitTap).
 *   - Spreads get a tiny explainer: "+1.5 = they win, or lose by just 1 run"
 *     (spreadNote).
 *   - The price vs. fair value becomes "good deal / fair price / a bit
 *     pricey" (dealWord).
 * The words themselves live in js/strings.js (STR.plain); these functions
 * only return numbers and keys.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * How to say a chance.
   *   p >= 0.95      -> {kind:'almost'}            "almost every time"
   *   0.3 <= p < .95 -> {kind:'of10', n:1..9}      "about 6 out of 10 times"
   *   0 < p < 0.3    -> {kind:'oneIn', n}          "about 1 in 4" (n >= 10 rounded to 5s: 1 in 20, 1 in 30)
   * @param {number} p chance 0..1 @returns {{kind:string,n?:number}|null} null for a bad number
   */
  function chanceWords(p) {
    if (typeof p !== 'number' || !isFinite(p) || p <= 0 || p >= 1) return null;
    if (p >= 0.95) return { kind: 'almost' };
    if (p >= 0.3) return { kind: 'of10', n: Math.min(9, Math.max(3, Math.round(p * 10))) };
    const raw = 1 / p;
    const n = raw < 10 ? Math.round(raw) : Math.round(raw / 5) * 5;
    return { kind: 'oneIn', n: Math.max(2, n) };
  }

  /**
   * Ten dots, filled for the chance out of 10: 0.63 -> "●●●●●●○○○○".
   * Small chances (under 1 in 10) still show one dot so the row isn't empty.
   * @param {number} p 0..1 @returns {string} '' for a bad number
   */
  function dots(p) {
    if (typeof p !== 'number' || !isFinite(p) || p <= 0 || p >= 1) return '';
    const n = Math.max(1, Math.min(10, Math.round(p * 10)));
    return '●'.repeat(n) + '○'.repeat(10 - n);
  }

  /**
   * Split a leg/pick description into a clean title and the button to tap.
   *   'Guardians +1.5 runs (tap "Guardians +1.5")' -> {title:'Guardians +1.5 runs', tap:'Guardians +1.5'}
   *   'José Ramírez 1+ hits — YES'                  -> {title:'José Ramírez 1+ hits', tap:'Yes'}
   *   'Freddy Peralta 5+ strikeouts — NO (4 or fewer)' -> {title:'Freddy Peralta 5+ strikeouts', tap:'No', note:'4 or fewer'}
   *   anything else                                 -> {title: desc, tap: null}
   * @param {string} desc @returns {{title:string, tap:string|null, note:string|null}}
   */
  function splitTap(desc) {
    let title = String(desc || '');
    let tap = null, note = null;
    // Analyzer, not pick seller (§54): any " — tap ..." instruction is cut from titles.
    const instr = title.match(/\s+[—–-]\s+tap\b.*$/i);
    if (instr) title = title.slice(0, instr.index);
    const t = title.match(/\s*\(tap\s+["“]([^"”]+)["”]\)/i);
    if (t) { tap = t[1].trim(); title = title.replace(t[0], ''); }
    const yn = title.match(/\s+[—–-]\s+(YES|NO)\b\s*(?:\(([^)]*)\))?\s*$/i);
    if (yn) {
      if (!tap) tap = yn[1].toUpperCase() === 'YES' ? 'Yes' : 'No';
      note = yn[2] ? yn[2].trim() : null;
      title = title.slice(0, yn.index);
    }
    return { title: title.trim(), tap, note };
  }

  /** Score word per league for spreads. */
  const UNIT = { mlb: ['run', 'runs'], nhl: ['goal', 'goals'] };

  /**
   * Plain spread explainer pieces for the first "+1.5" / "-1.5" in a text.
   * Ignores "1+ hits" style props (the sign must come BEFORE the number).
   * @param {string} text e.g. 'Guardians +1.5 runs' @param {string} league mlb | nhl | nfl | nba | wnba
   * @returns {{line:string, plus:boolean, n:number, unit:string}|null}
   *   plus: true for +N.5 ("win, or lose by N or less"); false for -N.5 ("win by N+1 or more").
   */
  function spreadNote(text, league) {
    const m = String(text || '').match(/(?:^|\s)([+\-−])(\d{1,2})\.5\b/);
    if (!m) return null;
    const n = Number(m[2]);
    const u = UNIT[String(league || '').toLowerCase()] || ['point', 'points'];
    const plus = m[1] === '+';
    const k = plus ? n : n + 1;   // runs that matter: lose by up to n / win by n+1
    return { line: `${plus ? '+' : '-'}${n}.5`, plus, n: k, unit: k === 1 ? u[0] : u[1] };
  }

  /**
   * League of a pick or leg: team.league, league, or the market id prefix
   * (aec-mlb-…, asc-nhl-…, astatc-nfl-…). @param {object} o @returns {string} '' if unknown
   */
  function leagueOf(o) {
    if (!o) return '';
    if (o.team && o.team.league) return String(o.team.league).toLowerCase();
    if (o.league) return String(o.league).toLowerCase();
    const m = String(o.market_id || o.marketId || '').match(/^[a-z]+-([a-z]+)-/);
    return m ? m[1] : '';
  }

  /**
   * Is the price a good deal? edge = fair - price, in cents.
   * @param {number} edge @returns {'good'|'fair'|'pricey'|null}
   */
  function dealWord(edge) {
    if (typeof edge !== 'number' || !isFinite(edge)) return null;
    if (edge >= 1) return 'good';
    if (edge > -1) return 'fair';
    return 'pricey';
  }

  /**
   * Safety net for pick text written by the daily job: any "41¢" / "63.5 ¢"
   * becomes its American odds ("+144" / "-174"), because Reed asked for no
   * cents anywhere on screen (Oct 19, 2026). Other text is left alone.
   * @param {string} text @returns {string}
   */
  function noCents(text) {
    return String(text == null ? '' : text).replace(/(\d{1,2}(?:\.\d+)?)\s?¢/g, (all, n) => {
      const c = Number(n);
      if (!(c > 0 && c < 100)) return all;
      const a = Math.round(c >= 50 ? (-100 * c) / (100 - c) : (100 * (100 - c)) / c);
      return a === -100 ? '+100' : (a > 0 ? '+' : '') + a;
    });
  }

  /**
   * THE money formatter (Reed's rule: no cents anywhere, Oct 20 2026, HANDOFF §52).
   * Whole dollars, rounded: 6.67 -> "$7", 1234.5 -> "$1,235", -5 -> "-$5".
   * Anything between 0 and $1 shows "under $1" (never "$0"); exactly 0 is "$0".
   */
  /**
   * Analyzer, not pick seller (§54): drop sentences that tell people what or how much to bet
   * ("Tiny bet.", "Skip.", "I'd play it small.", "Bet it.", "small play only"), and any
   * 'tap "Yes"/"No"' instruction. Neutral insight (chance, fair/edge read) is kept.
   */
  const ADVICE = /\b(tiny|small|smaller|big|bigger|half|quarter)[- ](bet|play|stake|size|unit)s?\b|\bskip(\b|ped)|\b(play|bet) (it|this|small|smaller|light|big)\b|\bonly bet\b|\bI(?:'|’)?d (play|bet|take)\b|\bsuggested bet\b|\bpass on\b|\b(play|bet) only\b|\bpocket change\b|\bsprinkle\b|\btap\s+["“](yes|no)/i;
  function neutral(text) {
    const parts = String(text == null ? '' : text).split(/(?<=[.!?])\s+/);
    return parts.filter(sn => !ADVICE.test(sn)).join(' ').trim();
  }

  function dollars(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a > 0 && a < 0.995) return (n < 0 ? '-' : '') + 'under $1';
    return (n < 0 ? '-$' : '$') + Math.round(a).toLocaleString('en-US');
  }

  return { dollars, neutral, chanceWords, dots, splitTap, spreadNote, leagueOf, dealWord, noCents };
});
