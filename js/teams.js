/**
 * js/teams.js — team logos everywhere a team appears.
 *
 * PURPOSE
 *   One place that turns {league, abbr} into a small lazy-loaded logo.
 *   Exposed as window.Teams.
 *
 * WHERE LOGOS COME FROM (first one that works wins)
 *   1. Polymarket US API logos. data/markets/index.json carries each team's
 *      `logo` and `color`; app.js calls Teams.registerFromIndex(index) so any
 *      team in the snapshot uses Polymarket's own artwork.
 *   2. ESPN's public CDN: https://a.espncdn.com/i/teamlogos/{league}/500/{abbr}.png
 *      for nfl / mlb / nhl / nba / wnba. ESPN's abbreviations sometimes differ
 *      from Polymarket's, so ESPN_ALIASES maps league+abbr -> ESPN abbr.
 *   3. A colored circle with the team abbreviation (always works, also used
 *      for soccer clubs that aren't in the snapshot).
 *   A broken image is swapped to the next source by one global 'error'
 *   listener (see install()), so no inline onerror attributes are needed.
 *
 * USAGE
 *   Teams.badge({league:'mlb', abbr:'cle'})        -> '<span class="tlogo">…</span>'
 *   Teams.badge(team, 22)                            -> custom size in px
 *   Teams.badges([t1, t2])                           -> several, side by side
 */
(function () {
  'use strict';

  /** ESPN uses different codes for some teams. league -> {polymarketAbbr: espnAbbr}. */
  const ESPN_ALIASES = {
    nfl: { was: 'wsh', jac: 'jax', lar: 'lar', la: 'lar' },
    mlb: { was: 'wsh', cws: 'chw', az: 'ari', oak: 'ath' },
    nhl: { was: 'wsh', mon: 'mtl', uta: 'utah', sjs: 'sj', tbl: 'tb', njd: 'nj', lak: 'la', vgk: 'vgk' },
    nba: { was: 'wsh', pho: 'phx', uta: 'utah', gsw: 'gs', nyk: 'ny', nop: 'no', sas: 'sa' },
    wnba: { was: 'wsh', pho: 'phx', con: 'conn', gs: 'gs', lv: 'lv' }
  };
  const ESPN_LEAGUES = ['nfl', 'mlb', 'nhl', 'nba', 'wnba'];

  /** Runtime registry: "league:abbr" -> {logo, color, display, short}. */
  const registry = {};

  /** @param {string} s @returns {string} lower-case key part */
  const k = s => String(s || '').toLowerCase();

  /**
   * Remember Polymarket logos/colours from the market snapshot.
   * @param {object} index parsed data/markets/index.json
   */
  function registerFromIndex(index) {
    (index && index.events || []).forEach(ev => (ev.teams || []).forEach(t => {
      registry[k(ev.league) + ':' + k(t.abbr)] = { logo: t.logo, color: t.color, display: t.display, short: t.short };
    }));
  }

  /**
   * ESPN CDN URL for a team, or null when ESPN has no such league.
   * @param {string} league @param {string} abbr @returns {string|null}
   */
  function espnUrl(league, abbr) {
    const lg = k(league);
    if (!ESPN_LEAGUES.includes(lg) || !abbr) return null;
    const a = (ESPN_ALIASES[lg] && ESPN_ALIASES[lg][k(abbr)]) || k(abbr);
    return `https://a.espncdn.com/i/teamlogos/${lg}/500/${a}.png`;
  }

  /** Stable fallback colour from the abbreviation (HSL hash). */
  function hashColor(s) {
    let h = 0;
    for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 38%)`;
  }

  /** @param {*} v @returns {string} HTML-escaped */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * HTML for one team logo with built-in fallbacks.
   * @param {{league:string, abbr:string, logo?:string, color?:string}} team
   * @param {number} [size] px, default 26
   * @returns {string} HTML ('' if no team)
   */
  function badge(team, size = 26) {
    if (!team || !team.abbr) return '';
    const reg = registry[k(team.league) + ':' + k(team.abbr)] || {};
    const label = (reg.display || team.display || team.abbr).toUpperCase().slice(0, 4);
    const color = team.color || reg.color || hashColor(label);
    const sources = [team.logo, reg.logo, espnUrl(team.league, team.abbr)].filter(Boolean);
    const circle = `<span class="tlogo-fallback" style="background:${esc(color)};width:${size}px;height:${size}px;font-size:${Math.max(8, Math.round(size / 3))}px">${esc(label)}</span>`;
    if (!sources.length) return `<span class="tlogo" title="${esc(label)}">${circle}</span>`;
    return `<span class="tlogo" title="${esc(label)}" data-fallbacks="${esc(sources.slice(1).join('|'))}">` +
      `<img src="${esc(sources[0])}" alt="${esc(label)}" width="${size}" height="${size}" loading="lazy" decoding="async">${circle.replace('class="tlogo-fallback"', 'class="tlogo-fallback" hidden')}</span>`;
  }

  /** @param {object[]} teams @param {number} [size] @returns {string} HTML */
  function badges(teams, size) { return (teams || []).map(t => badge(t, size)).join(''); }

  /**
   * One capture-phase listener for every logo <img>: try the next source,
   * then show the colored circle. Side effect: DOM mutation.
   */
  function install() {
    document.addEventListener('error', e => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.parentElement || !img.parentElement.classList.contains('tlogo')) return;
      const wrap = img.parentElement;
      const rest = (wrap.dataset.fallbacks || '').split('|').filter(Boolean);
      if (rest.length) { wrap.dataset.fallbacks = rest.slice(1).join('|'); img.src = rest[0]; return; }
      img.remove();
      const c = wrap.querySelector('.tlogo-fallback');
      if (c) c.hidden = false;
    }, true);
  }

  window.Teams = { badge, badges, registerFromIndex, espnUrl, install, ESPN_ALIASES };
})();
