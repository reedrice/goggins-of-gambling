/* Browser-only ESPN score ticker. Independent of picks, betting data and feed routines. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PicksScores = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SOURCES = [
    ['NBA', 'basketball/nba'], ['NHL', 'hockey/nhl'], ['NFL', 'football/nfl'],
    ['MLB', 'baseball/mlb'], ['WNBA', 'basketball/wnba'], ['Soccer', 'soccer/all']
  ];
  const REFRESH = 60000;
  let active = null, cache = null;
  function dates(now = new Date()) {
    const fmt = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
    // Yesterday catches games still live after local midnight. Completed games are filtered below.
    return [fmt(new Date(now.getTime() - 86400000)), fmt(now)];
  }
  function teamLogo(team) {
    const candidates = [team.logo, ...(team.logos || []).map(logo => logo.href)];
    return candidates.find(url => typeof url === 'string' && /^https:\/\//i.test(url)) || null;
  }
  function liveGames(board, source, mode = 'live', now = new Date()) {
    const seen = new Set();
    return (board.events || []).flatMap(event => {
      const game = (event.competitions || [])[0];
      const status = (game && game.status) || event.status || {};
      if (!game || !status.type || status.type.completed || seen.has(event.id)) return [];
      if (mode === 'live' && status.type.state !== 'in') return [];
      if (mode === 'upcoming' && (status.type.state !== 'pre' || /postpon|cancel|suspend|delay/i.test((status.type.name || '') + (status.type.description || '')) || !event.date || Date.parse(event.date) < now.getTime() || dates(new Date(event.date))[1] !== dates(now)[1])) return [];
      const away = (game.competitors || []).find(t => t.homeAway === 'away');
      const home = (game.competitors || []).find(t => t.homeAway === 'home');
      if (!away || !home || !away.team || !home.team) return [];
      const score = team => /^\d+$/.test(String(team.score)) ? String(team.score) : null;
      if (mode === 'live' && (score(away) === null || score(home) === null)) return [];
      seen.add(event.id);
      const leagueLink = (event.links || []).map(link => link.href || '').find(href => href.includes('/league/')) || '';
      const soccerLeague = /\/league\/([^/?#]+)/.exec(leagueLink);
      return [{ id: String(event.id), league: source === 'Soccer' && soccerLeague ? soccerLeague[1] : source,
        away: away.team.shortDisplayName || away.team.displayName || away.team.abbreviation,
        home: home.team.shortDisplayName || home.team.displayName || home.team.abbreviation,
        awayLogo: teamLogo(away.team), homeLogo: teamLogo(home.team),
        awayScore: score(away), homeScore: score(home), detail: mode === 'upcoming' ? event.date : status.type.shortDetail || status.type.detail || status.displayClock || '' }];
    });
  }
  function groupGames(results) {
    const groups = new Map();
    results.flat().forEach(game => {
      if (!groups.has(game.league)) groups.set(game.league, new Map());
      groups.get(game.league).set(game.id, game);
    });
    return Array.from(groups, ([league, games]) => ({ league, games: Array.from(games.values()) }));
  }
  function stop() {
    if (!active) return;
    clearTimeout(active.timer); active.controller?.abort(); active = null;
  }
  function mount(root) {
    stop();
    const S = window.STR.picks.scores;
    const state = active = { root, paused: false, timer: null, controller: null };
    root.className = 'picks-score-ticker';
    const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
    const header = node('div', 'pst-header');
    header.append(node('strong', 'pst-title', S.title));
    const meta = node('span', 'pst-meta', S.loading);
    const pause = node('button', 'pst-pause', S.pause); pause.type = 'button'; pause.disabled = true;
    pause.onclick = () => { state.paused = !state.paused; root.classList.toggle('pst-paused', state.paused); pause.textContent = state.paused ? S.resume : S.pause; pause.setAttribute('aria-pressed', String(state.paused)); };
    header.append(meta, pause);
    const viewport = node('div', 'pst-viewport');
    root.replaceChildren(header, viewport);
    // Capture errors on both original and cloned marquee lanes. Team text stays
    // visible if ESPN does not supply a logo or an image cannot be loaded.
    root.addEventListener('error', event => {
      if (event.target.matches && event.target.matches('img.pst-logo')) event.target.remove();
    }, true);
    const team = (name, logo) => {
      const label = node('span', 'pst-team');
      if (logo) {
        const image = node('img', 'pst-logo'); image.src = logo;
        image.alt = ''; image.width = 20; image.height = 20; image.decoding = 'async';
        label.append(image);
      }
      label.append(node('span', 'pst-name', name));
      return label;
    };
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', S.title);
    function render(snapshot) {
      if (active !== state || !root.isConnected) return;
      const when = new Date(snapshot.at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
      header.querySelector('.pst-title').textContent = snapshot.upcoming ? S.upcoming : S.title;
      meta.textContent = snapshot.failures.length ? S.partial(snapshot.failures.join(', '), when) : S.checked(when);
      meta.title = S.coverage;
      if (!snapshot.groups.length) {
        viewport.replaceChildren(node('div', 'pst-empty', snapshot.failures.length ? S.unavailable : S.empty)); pause.disabled = true; return;
      }
      const oldTrack = viewport.querySelector('.pst-track');
      const transform = oldTrack && getComputedStyle(oldTrack).transform;
      const distance = transform && transform !== 'none' ? Math.abs(new DOMMatrixReadOnly(transform).m41) : 0;
      const track = node('div', 'pst-track');
      const lane = node('div', 'pst-lane');
      snapshot.groups.forEach(group => {
        const block = node('div', 'pst-group');
        block.append(node('strong', 'pst-league', S.leagues[group.league] || S.soccer));
        group.games.forEach(game => {
          const item = node('span', 'pst-game');
          item.append(team(game.away, game.awayLogo));
          if (!snapshot.upcoming) item.append(node('b', 'pst-score', game.awayScore));
          item.append(node('span', 'pst-at', S.at), team(game.home, game.homeLogo));
          if (!snapshot.upcoming) item.append(node('b', 'pst-score', game.homeScore));
          const detail = snapshot.upcoming ? new Date(game.detail).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT' : game.detail;
          item.append(node('span', 'pst-clock', detail));
          block.append(item);
        });
        lane.append(block);
      });
      track.append(lane);
      const duplicate = lane.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true'); track.append(duplicate);
      viewport.replaceChildren(track); pause.disabled = false;
      root.style.setProperty('--pst-lane-width', viewport.clientWidth + 'px');
      const duration = Math.max(20, lane.scrollWidth / 42);
      root.style.setProperty('--pst-duration', duration + 's');
      // Keep our place through minute-by-minute score updates, so late league
      // groups are reached even when a full circuit takes longer than a minute.
      track.style.animationDelay = -(distance % lane.scrollWidth) / lane.scrollWidth * duration + 's';
    }
    async function refresh() {
      if (active !== state || !root.isConnected) return;
      if (document.hidden || root.closest('[hidden]')) { state.timer = setTimeout(refresh, REFRESH); return; }
      if (cache && Date.now() - cache.at < REFRESH) { render(cache); state.timer = setTimeout(refresh, REFRESH - (Date.now() - cache.at)); return; }
      if (state.loading) return;
      state.loading = true;
      const controller = state.controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const dayRange = dates();
      const results = await Promise.allSettled(SOURCES.map(async ([label, path]) => {
        // ESPN's scoreboard date ranges return 400 for some leagues; query each day explicitly.
        const boards = await Promise.all(dayRange.map(async day => {
          const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + path + '/scoreboard?dates=' + day + '&limit=1000', { signal: controller.signal, cache: 'no-store' });
          if (!response.ok) throw new Error(label);
          const board = await response.json();
          if (!Array.isArray(board.events)) throw new Error(label);
          return board;
        }));
        return { live: boards.flatMap(board => liveGames(board, label)), upcoming: boards.flatMap(board => liveGames(board, label, 'upcoming')) };
      }));
      clearTimeout(timeout); state.loading = false;
      if (active !== state) return;
      const fulfilled = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const live = groupGames(fulfilled.map(r => r.live));
      cache = { at: Date.now(), upcoming: !live.length, groups: live.length ? live : groupGames(fulfilled.map(r => r.upcoming)), failures: results.flatMap((r, i) => r.status === 'rejected' ? [S.leagues[SOURCES[i][0]] || S.soccer] : []) };
      render(cache); state.timer = setTimeout(refresh, REFRESH);
    }
    refresh();
    state.redraw = () => { if (cache) render(cache); };
    state.wake = () => { if (!document.hidden) { clearTimeout(state.timer); refresh(); } };
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', () => active?.redraw?.());
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => active?.wake?.());
  return { SOURCES, dates, liveGames, groupGames, mount, stop };
});
