/**
 * js/storage.js — the ONLY module that touches localStorage.
 *
 * PURPOSE
 *   Private, per-device persistence for the profile, bankroll and bets. None
 *   of this ever leaves the browser except via the user's own Export button.
 *   Exposed as window.Store.
 *
 * LOCALSTORAGE SCHEMA (neutral "betdash_" prefix — never put the brand here,
 * so renaming the app in config.js does not orphan anyone's data)
 *
 *   betdash_profile   JSON {
 *       version: 1,
 *       name: string,              display name (local only)
 *       startBankroll: number,     $ at the start of the window
 *       unit: number,              $ per 1u (default 2% of bankroll)
 *       maxPerSlip: number,        $ cap per slip (default 5% of bankroll)
 *       windowEnd: "YYYY-MM-DD"|"",optional end of the bankroll window
 *       createdAt: ISO string
 *     }
 *   betdash_bets      JSON array of Bet {
 *       id: string,                also used as the shared-log record id
 *       createdAt: ISO, settledAt: ISO|null,
 *       category: "single"|"prop"|"parlay"|"longshot"|"nonsports",
 *       platform: string,
 *       legs: [{desc: string, price: string, p: number}],
 *       estMultiple: number, quotedMultiple: number, hitChance: number,
 *       stake: number,             $ (PRIVATE — never shared)
 *       status: "open"|"won"|"lost"|"push",
 *       shared: boolean,           whether numbers were sent to the shared log
 *       pickId: string|null        id from data/picks.json if created from a pick
 *     }
 *   betdash_settings  JSON { shareByDefault: boolean }
 *   betdash_gh_token  string — user's fine-grained GitHub token (contents:write
 *                     on this repo). Local only; excluded from exports.
 *   betdash_gh_login  string — cached GitHub login resolved from GET /user.
 *
 * Bankroll is DERIVED (startBankroll + Σ settled P/L), never stored, so
 * editing or deleting a bet can never desync it.
 */
(function () {
  'use strict';

  const KEYS = Object.freeze({
    profile: 'betdash_profile',
    bets: 'betdash_bets',
    settings: 'betdash_settings',
    token: 'betdash_gh_token',
    login: 'betdash_gh_login'
  });

  /**
   * Read and JSON-parse a key.
   * @param {string} key localStorage key
   * @param {*} fallback returned when missing or corrupt
   * @returns {*} parsed value or fallback
   */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('Corrupt localStorage value for', key, e);
      return fallback;
    }
  }

  /**
   * JSON-stringify and write a key. Side effect: localStorage write.
   * @param {string} key
   * @param {*} value
   */
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /** @returns {object|null} the profile, or null on first run */
  function getProfile() { return readJSON(KEYS.profile, null); }
  /** @param {object} p profile to save (see schema above) */
  function setProfile(p) { writeJSON(KEYS.profile, Object.assign({ version: 1 }, p)); }

  /** @returns {object[]} all bets, newest first is NOT guaranteed */
  function getBets() { return readJSON(KEYS.bets, []); }
  /** @param {object[]} bets full replacement list */
  function setBets(bets) { writeJSON(KEYS.bets, bets); }

  /**
   * Insert or replace a bet by id.
   * @param {object} bet
   * @returns {object[]} the updated list
   */
  function upsertBet(bet) {
    const bets = getBets();
    const i = bets.findIndex(b => b.id === bet.id);
    if (i >= 0) bets[i] = bet; else bets.push(bet);
    setBets(bets);
    return bets;
  }

  /** @param {string} id bet id to remove. Side effect: localStorage write. */
  function deleteBet(id) { setBets(getBets().filter(b => b.id !== id)); }

  /** @returns {{shareByDefault:boolean}} */
  function getSettings() { return Object.assign({ shareByDefault: true }, readJSON(KEYS.settings, {})); }
  /** @param {object} s partial settings merged into existing */
  function setSettings(s) { writeJSON(KEYS.settings, Object.assign(getSettings(), s)); }

  /** @returns {string} token or "" */
  function getToken() { return localStorage.getItem(KEYS.token) || ''; }
  /** @param {string} t token; empty string removes it (and the cached login) */
  function setToken(t) {
    if (t) localStorage.setItem(KEYS.token, t);
    else { localStorage.removeItem(KEYS.token); localStorage.removeItem(KEYS.login); }
  }
  /** @returns {string} cached GitHub login or "" */
  function getLogin() { return localStorage.getItem(KEYS.login) || ''; }
  /** @param {string} l GitHub login to cache */
  function setLogin(l) { localStorage.setItem(KEYS.login, l); }

  /**
   * Build a backup object. The GitHub token is deliberately EXCLUDED so a
   * backup file can be stored/shared without leaking credentials.
   * @returns {object} {format, version, exportedAt, profile, bets, settings}
   */
  function exportAll() {
    return {
      format: 'betdash-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: getProfile(),
      bets: getBets(),
      settings: getSettings()
    };
  }

  /**
   * Restore a backup produced by exportAll(). Overwrites profile, bets and
   * settings on this device (token untouched).
   * @param {object} data parsed backup JSON
   * @throws {Error} if the object isn't a recognisable backup
   */
  function importAll(data) {
    if (!data || data.format !== 'betdash-backup' || !data.profile || !Array.isArray(data.bets)) {
      throw new Error('Not a valid backup file.');
    }
    setProfile(data.profile);
    setBets(data.bets);
    if (data.settings) writeJSON(KEYS.settings, data.settings);
  }

  /**
   * Wipe all private data on this device (profile, bets, settings, token).
   * Side effect: the app will show onboarding on next render.
   */
  function resetAll() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

  window.Store = {
    KEYS, getProfile, setProfile, getBets, setBets, upsertBet, deleteBet,
    getSettings, setSettings, getToken, setToken, getLogin, setLogin,
    exportAll, importAll, resetAll
  };
})();
