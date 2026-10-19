/**
 * js/play.js — PLAY MONEY ("points"), just for fun. No real money, ever.
 *
 * WHAT IT IS
 *   Everyone starts with START (1,000) points under a display name. You bet
 *   points on real Polymarket US markets (one pick or a combo) at the price the
 *   app shows right then. Bets settle from the market's real result on
 *   Polymarket US (public gateway, the same one the rest of the site reads).
 *
 * MATH (all whole points, no cents shown)
 *   price c = Polymarket US buy price for that side, 1-99 (chance points).
 *   A combo pays stake × Π(100 / c), rounded down. "Bet 100 pts, get X back".
 *   Settled: any losing pick = lost. All decided with no loss = won; a pick
 *   that was voided/pushed (settled at neither 0 nor 1) is dropped from the
 *   payout. Every pick pushed = refund (push).
 *   Points = START − every stake + every amount paid back. ROI = (paid back −
 *   staked) ÷ staked over settled bets. Best hit = biggest win (odds + points).
 *
 * RESULTS from a Polymarket US event payload (GET /v1/events/slug/<slug>):
 *   the market whose slug == our marketId; when market.closed, its marketSides
 *   price is "1" for the side that won and "0" for the side that lost. The
 *   "long" side is our "yes".
 *
 * Shared by the browser (window.Play) and node (scripts/play-leaderboard.mjs,
 * tests/play.test.js). Pure: no DOM, no storage, no network.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Play = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const START = 1000, DEFAULT_STAKE = 100, MAX_LEGS = 10;
  /** Title prefix of a "Post my score" GitHub issue (the script looks for it). */
  const ISSUE_PREFIX = 'Play score: ';

  /** American odds text for a price in chance points: 40 -> "+150", 60 -> "-150". */
  function american(c) {
    c = Number(c);
    if (!(c > 0 && c < 100)) return '';
    return c > 50 ? `-${Math.round(100 * c / (100 - c))}` : `+${Math.round(100 * (100 - c) / c)}`;   // 50 = "+100", like js/vegas.js
  }

  /** Combo multiple: Π(100 / c). */
  const multiple = prices => prices.reduce((m, c) => m * (100 / Number(c)), 1);
  /** Points back (stake included) if every pick wins, rounded down. */
  const getBack = (stake, prices) => Math.floor(Number(stake) * multiple(prices) + 1e-9);
  /** American odds of a whole combo, from its multiple. */
  const comboOdds = prices => american(100 / multiple(prices));

  /** Game slug for a market id ("aec-nba-phi-ny-2026-10-20" -> "nba-phi-ny-2026-10-20"). */
  function gameSlug(marketId) {
    const m = /^[a-z]+-([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})/.exec(String(marketId || ''));
    return m ? m[1] : null;
  }

  /**
   * One pick's result from an event payload: 'win' | 'loss' | 'push' | null (not settled yet).
   * @param {object} ev Polymarket US event ({event:{markets}} or {markets})
   * @param {string} marketId our market id (== market slug) @param {'yes'|'no'} side
   */
  function legResult(ev, marketId, side) {
    const e = (ev && ev.event) || ev || {};
    const m = (e.markets || []).find(x => x.slug === marketId);
    if (!m || !m.closed) return null;
    const long = (m.marketSides || []).find(s => s.long);
    const p = long ? Number(long.price) : NaN;
    if (p !== 0 && p !== 1) return isNaN(p) ? null : 'push';   // settled at a middle price = void/push
    const yesWon = p === 1;
    return (side === 'yes') === yesWon ? 'win' : 'loss';
  }

  /**
   * Settle a bet from its picks' results (same order as bet.legs).
   * @returns {{status:'open'|'won'|'lost'|'push', ret:number}} ret = points paid back
   */
  function settle(bet, results) {
    if (results.some(r => r === 'loss')) return { status: 'lost', ret: 0 };
    if (results.length !== bet.legs.length || results.some(r => r == null)) return { status: 'open', ret: 0 };
    const won = bet.legs.filter((l, i) => results[i] === 'win');
    if (!won.length) return { status: 'push', ret: bet.stake };
    return { status: 'won', ret: getBack(bet.stake, won.map(l => l.c)) };
  }

  /** Points, W-L-P, ROI, best hit for a list of bets. */
  function stats(bets) {
    let points = START, staked = 0, back = 0, w = 0, l = 0, p = 0, best = null, open = 0;
    for (const b of bets) {
      points -= b.stake;
      if (b.status === 'open') { open++; continue; }
      points += b.ret || 0; staked += b.stake; back += b.ret || 0;
      if (b.status === 'won') { w++; if (!best || b.ret > best.ret) best = { ret: b.ret, odds: comboOdds(b.legs.map(x => x.c)), desc: b.legs.map(x => x.desc).join(' + ') }; }
      else if (b.status === 'lost') l++; else p++;
    }
    return { points, w, l, p, open, staked, roi: staked ? (back - staked) / staked : null, best };
  }

  /** Display name rule: 2-20 letters, numbers, spaces, _ or -. */
  const NAME_RE = /^[A-Za-z0-9 _-]{2,20}$/;
  const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ');
  const validName = s => NAME_RE.test(cleanName(s));

  /** Is this a well-formed bet (from storage or a submission)? */
  function validBet(b) {
    return !!b && typeof b.id === 'string' && b.id.length <= 40 && Number.isInteger(b.stake) && b.stake >= 1 && b.stake <= 1e7 &&
      Array.isArray(b.legs) && b.legs.length >= 1 && b.legs.length <= MAX_LEGS &&
      b.legs.every(x => x && /^[a-z0-9-]{8,120}$/.test(x.marketId || '') && (x.side === 'yes' || x.side === 'no') && Number(x.c) >= 1 && Number(x.c) <= 99) &&
      !isNaN(Date.parse(b.at));
  }

  /**
   * Can this bet be placed? Points must cover the stake; every pick needs a real
   * market id, side and live price. @returns {string|null} error key or null
   */
  function checkNew(bets, stake, legs) {
    if (!Number.isInteger(stake) || stake < 1) return 'stake';
    if (stake > stats(bets).points) return 'broke';
    if (!legs.length || legs.length > MAX_LEGS) return 'legs';
    if (!legs.every(x => x.marketId && (x.side === 'yes' || x.side === 'no') && Number(x.c) >= 1 && Number(x.c) <= 99)) return 'price';
    return null;
  }

  /**
   * What a "Post my score" issue carries: name + the bets (newest 40), no
   * personal data. The leaderboard script re-settles every bet from real
   * results itself, so typed-in statuses don't count.
   */
  function submission(name, bets) {
    return { v: 1, name: cleanName(name), bets: bets.slice(-40).map(b => ({ id: b.id, at: b.at, stake: b.stake,
      legs: b.legs.map(x => ({ marketId: x.marketId, side: x.side, c: Number(x.c), desc: String(x.desc || '').slice(0, 80) })) })) };
  }

  /** Parse + check a submission (untrusted). @returns {object|null} */
  function parseSubmission(text) {
    const m = /```json\s*([\s\S]*?)```/.exec(String(text || ''));
    let j; try { j = JSON.parse(m ? m[1] : text); } catch (e) { return null; }
    if (!j || j.v !== 1 || !validName(j.name) || !Array.isArray(j.bets)) return null;
    const bets = j.bets.filter(validBet).slice(-40);
    return { name: cleanName(j.name), bets };
  }

  /**
   * Keep only bets the points could pay for, in time order (counting the
   * points earlier bets paid back). Use on SETTLED bets. @returns {object[]}
   */
  function replay(bets) {
    const kept = [];
    for (const b of [...bets].sort((x, y) => Date.parse(x.at) - Date.parse(y.at))) if (b.stake <= stats(kept).points) kept.push(b);
    return kept;
  }

  return { replay, START, DEFAULT_STAKE, MAX_LEGS, ISSUE_PREFIX, american, multiple, getBack, comboOdds, gameSlug, legResult, settle, stats,
    validName, cleanName, validBet, checkNew, submission, parseSubmission };
});
