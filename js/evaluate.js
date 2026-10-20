/**
 * js/evaluate.js — "My hit chance", risk level and "My take" for a pick.
 *
 * Shared by the browser (window.PickEval, used by js/app.js on every pick
 * card) and Node (module.exports, used by scripts/update-picks.mjs to fill in
 * missing fields before picks.json is written). Pure functions, no DOM.
 *
 * PICKS.JSON FIELDS (all optional; the daily job may set them, otherwise
 * they're computed here from fields that already exist):
 *   hit_prob   number 0-100   my estimated chance the bet wins.
 *              Default: singles/props -> `fair`, then `price`;
 *              parlays/long shots -> product of the legs' fair (or price).
 *   risk       'safer' | 'coin_flip' | 'risky' | 'long_shot'
 *              Default: from hit_prob with RISK_LEVELS below.
 *   verdict    short plain sentence ("Good price, I'd play it.").
 *              Default: from action, edge and (for combos) quoted_multiple
 *              vs skip_below; wording lives in STR.eval.verdicts.
 *   same_game  boolean, combos only: all legs from one game (they can affect
 *              each other). Default: compared from the legs' market_id.
 *   prediction_id  id of a game prediction to show on the card. Default:
 *              matched by game name (see findPredictions).
 *
 * RISK THRESHOLDS (hit chance):
 *   Safer      60% or more     wins more often than not, comfortably
 *   Coin flip  45% to <60%     about even
 *   Risky      25% to <45%     loses more often than it wins
 *   Long shot  under 25%       wins less than 1 time in 4
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PickEval = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Highest band first; a hit chance gets the first band whose `min` it reaches. */
  const RISK_LEVELS = [
    { key: 'safer', min: 60 },
    { key: 'coin_flip', min: 45 },
    { key: 'risky', min: 25 },
    { key: 'long_shot', min: 0 }
  ];
  const RISK_KEYS = RISK_LEVELS.map(r => r.key);
  const MULTI = ['parlays', 'longshots', 'lottery'];
  const isNum = v => typeof v === 'number' && isFinite(v);
  const round1 = v => Math.round(v * 10) / 10;

  /** @param {number} pct 0-100 @returns {string} risk key */
  function riskFor(pct) {
    return (RISK_LEVELS.find(r => pct >= r.min) || RISK_LEVELS[RISK_LEVELS.length - 1]).key;
  }

  /**
   * Game part of a Polymarket US market id:
   * "tsc-mlb-cle-tb-2026-10-19-6pt5" -> "mlb-cle-tb-2026-10-19".
   * @returns {string|null}
   */
  function gameKey(marketId) {
    const m = /^[a-z]+-([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})/.exec(String(marketId || ''));
    return m ? m[1] : null;
  }

  /** @returns {boolean|null} true = one game, false = several, null = unknown */
  function sameGame(pk) {
    if (typeof pk.same_game === 'boolean') return pk.same_game;
    const keys = (pk.legs || []).map(l => gameKey(l.market_id));
    if (keys.length < 2 || keys.some(k => !k)) return null;
    return keys.every(k => k === keys[0]);
  }

  /**
   * My hit chance for a pick.
   * @param {object} pk @param {boolean} multi parlay/long shot
   * @returns {{pct:number, source:'given'|'fair'|'price'|'legs'}|null}
   */
  function hitChance(pk, multi) {
    if (isNum(pk.hit_prob)) return { pct: pk.hit_prob, source: 'given' };
    if (multi) {
      const ps = (pk.legs || []).map(l => (isNum(l.fair) ? l.fair : isNum(l.price) ? l.price : null));
      if (!ps.length || ps.some(p => p === null)) return null;
      return { pct: round1(ps.reduce((a, p) => a * p / 100, 1) * 100), source: 'legs' };
    }
    if (isNum(pk.fair)) return { pct: pk.fair, source: 'fair' };
    if (isNum(pk.price)) return { pct: pk.price, source: 'price' };
    return null;
  }

  /**
   * Default "My take". Rules (first match wins):
   *   action skip                      -> skip
   *   action wait                      -> wait
   *   single/prop, edge >= 3¢          -> good       edge >= 1¢ -> fair   else thin
   *   combo with quoted + skip_below:  quoted < skip -> tooLow
   *                                    < 5% above skip -> barely   else goodCombo
   *   combo without a quote            -> long shot: longshotCheck, else payCheck
   * @param {object} pk @param {string} sec section key @param {object} STR strings (needs STR.eval)
   * @returns {string}
   */
  function verdictFor(pk, sec, STR) {
    const V = STR.eval.verdicts;
    const action = pk.action || (pk.stake_units > 0 ? 'bet' : 'skip');
    if (action === 'skip') return V.skip;
    if (action === 'wait') return V.wait;
    if (!MULTI.includes(sec)) {
      const edge = isNum(pk.edge) ? pk.edge : isNum(pk.fair) && isNum(pk.price) ? pk.fair - pk.price : null;
      if (edge === null) return V.fair;
      return edge >= 3 ? V.good : edge >= 1 ? V.fair : V.thin;
    }
    const q = pk.quoted_multiple, s = pk.skip_below;
    if (isNum(q) && isNum(s)) return q < s ? V.tooLow : q / s - 1 < 0.05 ? V.barely : V.goodCombo;
    if (isNum(s)) return (sec === 'longshots' || sec === 'lottery') ? V.longshotCheck(s) : V.payCheck(s);
    return (sec === 'longshots' || sec === 'lottery') ? V.longshot : V.fair;
  }

  /**
   * Everything a card needs. Explicit picks.json fields win over defaults.
   * @param {object} pk @param {string} sec section key @param {object} STR
   * @returns {{pct:number|null, source:string|null, risk:string|null, verdict:string, sameGame:boolean|null}}
   */
  function evaluate(pk, sec, STR) {
    const multi = MULTI.includes(sec);
    const h = hitChance(pk, multi);
    const risk = RISK_KEYS.includes(pk.risk) ? pk.risk : h ? riskFor(h.pct) : null;
    return {
      pct: h ? h.pct : null,
      source: h ? h.source : null,
      risk,
      verdict: typeof pk.verdict === 'string' && pk.verdict.trim() ? pk.verdict : verdictFor(pk, sec, STR),
      sameGame: multi ? sameGame(pk) : null
    };
  }

  /**
   * Game predictions that belong to a pick: by prediction_id, else every
   * prediction (same slate date) whose `game` text appears in the pick's
   * `event`, e.g. "Commanders @ 49ers" in "Commanders @ 49ers (MNF)".
   * @param {object} pk @param {object[]} preds predictions (picks.sections.predictions + predictions.json)
   * @param {string} slate slate_date
   * @returns {object[]} at most 3
   */
  function findPredictions(pk, preds, slate) {
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const list = (preds || []).filter(p => p && (!p.date || p.date === slate));
    if (pk.prediction_id) return list.filter(p => p.id === pk.prediction_id).slice(0, 1);
    const ev = norm(pk.event);
    return ev ? list.filter(p => p.game && ev.includes(norm(p.game))).slice(0, 3) : [];
  }

  /**
   * Fill missing hit_prob / risk / verdict / same_game in a picks.json doc
   * (in place). Used by scripts/update-picks.mjs so the stored file always
   * carries the values the app shows. Never overwrites a value that's set.
   * @returns {number} picks changed
   */
  function fillDefaults(doc, STR) {
    let n = 0;
    for (const [sec, list] of Object.entries(doc.sections || {})) {
      if (sec === 'predictions' || !Array.isArray(list)) continue;
      for (const pk of list) {
        const before = JSON.stringify(pk);
        const e = evaluate(pk, sec, STR);
        if (!isNum(pk.hit_prob) && e.pct !== null) pk.hit_prob = round1(e.pct);
        if (!RISK_KEYS.includes(pk.risk) && e.risk) pk.risk = e.risk;
        if (!pk.verdict) pk.verdict = e.verdict;
        if (MULTI.includes(sec) && typeof pk.same_game !== 'boolean' && e.sameGame !== null) pk.same_game = e.sameGame;
        if (JSON.stringify(pk) !== before) n++;
      }
    }
    return n;
  }

  return { RISK_LEVELS, RISK_KEYS, riskFor, gameKey, sameGame, hitChance, verdictFor, evaluate, findPredictions, fillDefaults };
});
