/**
 * js/positions.js — player positions (QB, PG, SP, LW, …) for every sport (browser + Node).
 *
 * PURPOSE
 *   Shows a small position badge next to player names ("Brock Purdy · QB")
 *   with a tap/hover tooltip for beginners ("QB = Quarterback").
 *   Exposed as window.Positions / module.exports.
 *
 * DATA (data/positions.json, written daily by scripts/fetch-positions.mjs)
 *   Positions come from ESPN's public roster API, so each league uses its
 *   own codes and names. No position list is hardcoded here, so a new sport
 *   works as soon as ESPN has rosters for it.
 *   { leagues: { <league>: { names: {QB: 'Quarterback', …},
 *                            players: { "<teamAbbr>|<normName>": "QB" } } }, … }
 *   Keys use the Polymarket team abbreviation and the normalised
 *   Polymarket player name, so the browser lookup is a plain map read.
 *
 * NAME MATCHING (normName / matchName; tests/positions.test.js)
 *   Polymarket and ESPN spell names differently: accents ("Luka Dončić"),
 *   suffixes ("Marvin Harrison Jr."), initials ("C.J. Stroud" / "CJ Stroud"),
 *   apostrophes ("De'Aaron Fox"), hyphens. normName folds all of these.
 *   matchName tries, in order, and only accepts a UNIQUE hit:
 *     1. same normalised name on the player's team
 *     2. same normalised name anywhere in the league (traded players)
 *     3. "J. Smith" style: first initial + last name on the team
 *     4. short/long first name ("Cam"/"Cameron") + same last name on the team
 *   Anything else is unmatched: no badge (never guessed), and the fetch
 *   script logs it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Positions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)$/;

  /**
   * "Marvin Harrison Jr." -> "marvin harrison"; "C.J. Stroud" -> "cj stroud";
   * "Luka Dončić" -> "luka doncic"; "De'Aaron Fox" -> "deaaron fox".
   * @param {string} s @returns {string}
   */
  function normName(s) {
    let n = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/ß/g, 'ss')
      .replace(/[’'`.]/g, '').replace(/[-_,]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    // join loose initials: "c j stroud" -> "cj stroud"
    n = n.replace(/^((?:[a-z] )+)([a-z]{2,})/, (m, ini, rest) => ini.replace(/ /g, '') + ' ' + rest);
    while (SUFFIX.test(n)) n = n.replace(SUFFIX, '');
    return n;
  }

  /** {first, last} of a normalised name ("cj stroud" -> cj / stroud). */
  function parts(n) { const w = n.split(' '); return { first: w[0] || '', last: w.length > 1 ? w[w.length - 1] : '' }; }

  /**
   * Find a Polymarket player in ESPN rosters.
   * @param {string} name Polymarket name
   * @param {{name:string, pos:string}[]} team roster of the player's team ([] if unknown)
   * @param {{name:string, pos:string}[]} league every roster fetched for the league
   * @returns {{pos:string, how:string}|null}
   */
  function matchName(name, team, league) {
    const n = normName(name);
    if (!n) return null;
    const uniq = list => (list.length === 1 ? list[0] : list.length > 1 && list.every(x => x.pos === list[0].pos) ? list[0] : null);
    const same = list => list.filter(x => normName(x.name) === n);
    let hit = uniq(same(team || []));
    if (hit) return { pos: hit.pos, how: 'team' };
    hit = uniq(same(league || []));
    if (hit) return { pos: hit.pos, how: 'league' };
    const p = parts(n);
    if (!p.last) return null;
    if (p.first.length === 1) {
      hit = uniq((team || []).filter(x => { const q = parts(normName(x.name)); return q.last === p.last && q.first[0] === p.first; }));
      if (hit) return { pos: hit.pos, how: 'initial' };
    }
    if (p.first.length >= 3) {
      hit = uniq((team || []).filter(x => {
        const q = parts(normName(x.name));
        return q.last === p.last && q.first.length >= 3 && q.first !== p.first && (q.first.startsWith(p.first) || p.first.startsWith(q.first));
      }));
      if (hit) return { pos: hit.pos, how: 'nickname' };
    }
    return null;
  }

  /** Map key for a player: "sf|brock purdy". */
  const key = (team, name) => `${String(team || '').toLowerCase()}|${normName(name)}`;

  /**
   * Position of a Polymarket player.
   * @param {object|null} doc data/positions.json
   * @param {string} league Polymarket league ("nfl") @param {string} team abbr ("sf") @param {string} name
   * @returns {{abbr:string, name:string}|null} e.g. {abbr:'QB', name:'Quarterback'}
   */
  function lookup(doc, league, team, name) {
    const L = doc && doc.leagues && doc.leagues[String(league || '').toLowerCase()];
    if (!L || !L.players || !name) return null;
    let abbr = L.players[key(team, name)];
    if (!abbr && !team) {   // no team known (e.g. a leg from an old bet): accept only a unique name
      const n = '|' + normName(name);
      const hits = [...new Set(Object.keys(L.players).filter(k => k.endsWith(n)).map(k => L.players[k]))];
      if (hits.length === 1) abbr = hits[0];
    }
    return abbr ? { abbr, name: (L.names && L.names[abbr]) || abbr } : null;
  }

  // ------------------------------------------------------------ browser helpers
  // Positions.load() once, then Positions.badge(...) anywhere a player name
  // is drawn. The badge is a <button class="pos-badge">: app.js installTips()
  // shows its data-tip-text on tap; title gives the hover text on desktop.

  let doc = null, loading = null;
  const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Fetch data/positions.json once (missing file = no badges). @returns {Promise<object|null>} */
  function load(url) {
    if (!loading) {
      loading = fetch(url || 'data/positions.json?t=' + Math.floor(Date.now() / 6e5))
        .then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => (doc = d));
    }
    return loading;
  }

  /** Position for a player from the loaded file, or null. */
  const get = (league, team, name) => lookup(doc, league, team, name);

  /** "QB = Quarterback" (STR.posTip when strings.js is loaded). */
  const tipText = p => (typeof STR !== 'undefined' && STR.posTip ? STR.posTip(p.abbr, p.name) : `${p.abbr} = ${p.name}`);

  /** Badge HTML, or '' when the player isn't matched (never guessed). */
  function badge(league, team, name) {
    const p = get(league, team, name);
    if (!p) return '';
    const t = escH(tipText(p));
    return `<button type="button" class="pos-badge" data-pos="${escH(p.abbr)}" data-tip-text="${t}" title="${t}" aria-label="${t}">${escH(p.abbr)}</button>`;
  }

  /** Plain text for <option>s: "Brock Purdy · QB" (just the name when unmatched). */
  function label(league, team, name) {
    const p = get(league, team, name);
    return p ? `${name} · ${p.abbr}` : String(name || '');
  }

  /**
   * Escaped text with the badge right after the player's name:
   * "Brock Purdy [QB] 250+ passing yards". If the name isn't in the text,
   * the badge goes in front. @returns {string} HTML
   */
  function inText(text, league, team, name) {
    const b = name ? badge(league, team, name) : '';
    const s = String(text == null ? '' : text);
    if (!b) return escH(s);
    const i = s.indexOf(name);
    return i < 0 ? `${b} ${escH(s)}` : `${escH(s.slice(0, i + name.length))} ${b}${escH(s.slice(i + name.length))}`;
  }

  return { normName, matchName, key, lookup, load, get, badge, label, inText, get doc() { return doc; }, set doc(d) { doc = d; } };
});
