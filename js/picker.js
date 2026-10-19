/**
 * js/picker.js — market picker for the bet builder (search + browse).
 *
 * PURPOSE
 *   Lets the user add slip legs by tapping a price instead of typing. Two ways
 *   in: (a) a search box with instant fuzzy matching across teams, players and
 *   bet names ("purdy" -> Purdy 1+ INT, Purdy 200+ pass yds, …); (b) browse:
 *   date chips (multi-select) -> sport chips -> game cards -> one game's
 *   markets grouped into Main bets / Player bets (by player) / Other.
 *   Exposed as window.Picker. Depends on MarketsCore, Teams, STR, BetCalc.
 *
 * DATA FLOW
 *   1. data/markets/index.json (≈100 KB) lists games; loaded on first use.
 *   2. data/markets/events/<slug>.json is loaded lazily per game (opening a
 *      game, or search prefetching the selected dates).
 *   3. LIVE: Polymarket US's gateway allows browser calls (CORS *), so
 *      opening a game re-fetches /v1/events/slug/<slug> and re-normalises it
 *      with MarketsCore (Kalshi info is carried over from the snapshot), and
 *      every added leg gets a live best-bid/ask from /v1/markets/<id>/bbo.
 *      If a live call fails the snapshot price is kept and labelled with its time.
 *
 * LEG OBJECT passed to opts.onAdd (see storage.js Bet.legs):
 *   { desc, platform:'Polymarket US', price:'63.5c'|'64', link, kalshiUrl,
 *     kalshiPrice, marketId, side, eventSlug, eventTitle, teams[], asOf, live }
 */
(function () {
  'use strict';

  const MC = window.MarketsCore;
  const STR = window.STR;

  /** Session-scoped cache-buster so the daily snapshot is re-read once per visit. */
  const BUST = Date.now();
  const cache = { index: null, events: new Map(), live: new Map() };

  // ---------------------------------------------------------------- data

  /** @returns {Promise<object>} parsed index.json (cached). Side effect: registers team logos. */
  async function loadIndex() {
    if (cache.index) return cache.index;
    const r = await fetch('data/markets/index.json?t=' + BUST);
    if (!r.ok) throw new Error('markets index ' + r.status);
    cache.index = await r.json();
    window.Teams.registerFromIndex(cache.index);
    return cache.index;
  }

  /** @param {string} slug @returns {Promise<object>} snapshot event (cached) */
  async function loadEvent(slug) {
    if (cache.events.has(slug)) return cache.events.get(slug);
    const p = fetch(`data/markets/events/${slug}.json?t=${BUST}`).then(r => { if (!r.ok) throw new Error(slug); return r.json(); });
    cache.events.set(slug, p);
    try { return await p; } catch (e) { cache.events.delete(slug); throw e; }
  }

  /**
   * Live re-fetch of one game from Polymarket US, merged with snapshot extras.
   * @param {string} slug @returns {Promise<object>} event with .liveAt ISO
   */
  async function liveEvent(slug) {
    const snap = await loadEvent(slug);
    const r = await fetch(`${MC.GATEWAY}/v1/events/slug/${slug}`);
    if (!r.ok) throw new Error('live ' + r.status);
    const ev = MC.compactEvent((await r.json()).event);
    const k = {};
    snap.markets.forEach(m => { if (m.kalshi) k[m.id] = m.kalshi; });
    ev.markets.forEach(m => { if (k[m.id]) m.kalshi = k[m.id]; });
    Object.assign(ev, { kalshi_url: snap.kalshi_url, kalshi_event: snap.kalshi_event, liveAt: new Date().toISOString() });
    cache.live.set(slug, ev);
    return ev;
  }

  /**
   * Live price for one market side.
   * @param {string} marketId @param {'yes'|'no'} side
   * @returns {Promise<number|null>} cents to buy that side
   */
  async function livePrice(marketId, side) {
    const r = await fetch(`${MC.GATEWAY}/v1/markets/${encodeURIComponent(marketId)}/bbo`);
    if (!r.ok) throw new Error('bbo ' + r.status);
    const p = MC.bboPrices(await r.json());
    return side === 'no' ? p.no_cost : p.yes_ask;
  }

  /** Kalshi event URL from a market ticker (KXNFLGAME-26OCT19WASSF-SF -> …/kxnflgame/kxnflgame-26oct19wassf). */
  function kalshiUrlFromTicker(t) {
    const ev = String(t).split('-').slice(0, 2).join('-');
    return `https://kalshi.com/markets/${ev.split('-')[0].toLowerCase()}/${ev.toLowerCase()}`;
  }

  // ---------------------------------------------------------------- helpers

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Lower-case, accent-free, alnum + spaces (for search). */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+.\- ]/g, ' ').replace(/\s+/g, ' ').trim();

  /** "7:08 PM CDT" (adds weekday when not today), America/Chicago. */
  function when(iso, withDay) {
    const d = new Date(iso);
    const o = { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
    if (withDay) Object.assign(o, { weekday: 'short' });
    return d.toLocaleString('en-US', o);
  }

  /** Team objects (with league) for logos. */
  const teamsOf = ev => (ev.teams || []).map(t => Object.assign({ league: ev.league }, t));
  /** "Guardians @ Rays" */
  const shortTitle = ev => (ev.teams || []).map(t => t.short).join(' @ ') || ev.title;

  /**
   * Teams relevant to one side of a market (for the leg's logo).
   * @returns {object[]} [{league, abbr, logo, color, display}]
   */
  function sideTeams(ev, m, side) {
    const abbr = m.type === 'prop' || m.player ? m.team : side === 'yes' ? m.yes_team : m.no_team;
    const all = teamsOf(ev);
    if (abbr) return all.filter(t => t.abbr === abbr);
    return all; // totals etc. -> both teams
  }

  /** Buy-cost (cents) of a side. */
  const costOf = (m, side) => (side === 'yes' ? m.yes_ask : m.no_cost);
  const isYesNo = l => /^(yes|no)$/i.test(l);

  /**
   * Plain-language description of a market side for the slip.
   * @returns {string} e.g. "Guardians +1.5", "Under 6.5 (Guardians @ Rays)",
   *   "Guardians to win", "Brock Purdy 1+ interceptions thrown — Yes"
   */
  function sideDesc(ev, m, side) {
    const lab = side === 'yes' ? m.side_yes_label : m.side_no_label;
    if (isYesNo(lab)) return `${m.label} — ${side === 'yes' ? STR.calc.yes : STR.calc.no}`;
    if (m.type === 'moneyline') return `${lab} to win`;
    if (m.type === 'total') return `${lab} (${shortTitle(ev)})`;
    if (m.group !== 'lines') return `${lab} — ${m.label}`;
    return lab;
  }

  /**
   * Build the leg object for opts.onAdd.
   * @param {object} ev event @param {object} m market @param {'yes'|'no'} side
   * @param {string} asOf ISO time the price is from @param {boolean} live
   */
  function makeLeg(ev, m, side, asOf, live) {
    const c = costOf(m, side);
    return {
      desc: sideDesc(ev, m, side),
      platform: 'Polymarket US',
      price: c == null ? '' : Number.isInteger(c) ? String(c) : c + 'c',
      link: ev.polymarket_url || ev.url,
      kalshiUrl: m.kalshi ? kalshiUrlFromTicker(m.kalshi.ticker) : ev.kalshi_url || null,
      kalshiMatch: m.kalshi ? 'market' : ev.kalshi_url ? 'event' : 'none',
      kalshiPrice: m.kalshi ? (side === 'yes' ? m.kalshi.yes : m.kalshi.no) : null,
      marketId: m.id, side, eventSlug: ev.slug, eventTitle: shortTitle(ev),
      teams: sideTeams(ev, m, side).map(t => ({ league: t.league, abbr: t.abbr, logo: t.logo, color: t.color, display: t.display })),
      asOf, live: !!live
    };
  }

  // ---------------------------------------------------------------- search index

  /** Per-event cached search rows: [{ev, m, hay}] */
  const searchRows = new Map();

  /** Build (once) the search rows for an event. */
  function rowsFor(ev) {
    if (searchRows.has(ev.slug)) return searchRows.get(ev.slug);
    const teamHay = (ev.teams || []).map(t => `${t.short} ${t.name} ${t.display} ${t.abbr}`).join(' ');
    const rows = ev.markets.map(m => ({ ev, m, hay: norm(`${m.label} ${m.side_yes_label} ${m.side_no_label} ${m.player || ''} ${teamHay}`), who: norm(m.player || '') }));
    searchRows.set(ev.slug, rows);
    return rows;
  }

  /**
   * Fuzzy score of query tokens against a haystack. Every token must match:
   * substring (word-start scores higher) or, for tokens of 4+ letters, an
   * in-order subsequence inside one word (forgives typos like "purdey").
   * @returns {number} 0 = no match
   */
  function score(tokens, hay, who) {
    let s = 0;
    for (const t of tokens) {
      const i = hay.indexOf(t);
      if (i >= 0) { s += i === 0 || hay[i - 1] === ' ' ? 3 : 1; if (who && who.includes(t)) s += 2; continue; }
      if (t.length >= 4 && hay.split(' ').some(w => subseq(t, w))) { s += 0.5; continue; }
      return 0;
    }
    return s;
  }
  /** true if all chars of a appear in order in b (and b isn't much longer) */
  function subseq(a, b) {
    if (b.length < a.length || b.length > a.length + 3) return false;
    let j = 0;
    for (let i = 0; i < b.length && j < a.length; i++) if (b[i] === a[j]) j++;
    return j === a.length;
  }

  // ---------------------------------------------------------------- UI

  /**
   * Mount the picker into a container.
   * @param {HTMLElement} root
   * @param {{onAdd:(leg:object)=>void, fmt:(cents:number)=>string}} opts
   * @returns {{destroy:()=>void}}
   */
  function create(root, opts) {
    const state = { dates: null, sports: new Set(), open: false, game: null, gameData: null, gameStatus: '', q: '' };
    root.innerHTML = `
      <div class="picker">
        <div class="search-wrap">
          <input type="search" class="psearch" placeholder="${esc(STR.calc.searchPh)}" autocomplete="off" enterkeyhint="search" aria-label="${esc(STR.calc.searchPh)}">
          <div class="presults" hidden></div>
        </div>
        <div class="row picker-actions">
          <button type="button" class="btn pbrowse">${esc(STR.calc.browse)}</button>
        </div>
        <div class="pbrowse-panel" hidden>
          <div class="chips pdates"></div>
          <div class="chips psports"></div>
          <div class="pgames"></div>
        </div>
      </div>`;
    const $ = s => root.querySelector(s);
    const input = $('.psearch'), results = $('.presults'), panel = $('.pbrowse-panel');

    /** Tap on any price button anywhere inside the picker. */
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-add]');
      if (b) {
        const [slug, mid, side] = b.dataset.add.split('|');
        const ev = cache.live.get(slug) || await loadEvent(slug);
        const m = ev.markets.find(x => x.id === mid);
        if (!m) return;
        const leg = makeLeg(ev, m, side, ev.liveAt || ev.updated_at, !!ev.liveAt);
        opts.onAdd(leg);
        b.classList.add('added');
        setTimeout(() => b.classList.remove('added'), 600);
        return;
      }
      const g = e.target.closest('[data-game]');
      if (g) { openGame(g.dataset.game); return; }
      const chip = e.target.closest('[data-chip]');
      if (chip) { toggleChip(chip.dataset.chip, chip.dataset.val); return; }
      if (e.target.closest('.pback')) { state.game = null; renderBrowse(); }
    });

    $('.pbrowse').onclick = async () => {
      state.open = !state.open;
      panel.hidden = !state.open;
      $('.pbrowse').textContent = state.open ? STR.calc.hideBrowse : STR.calc.browse;
      if (state.open) { await initDates(); renderBrowse(); }
    };

    // Search: prefetch selected dates on first focus, then debounce keystrokes.
    let timer = null;
    input.addEventListener('focus', () => prefetch().catch(() => {}), { once: true });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 90); });

    /** Default date selection = today + tomorrow (if present in the snapshot). */
    async function initDates() {
      const idx = await loadIndex();
      if (!state.dates) state.dates = new Set(idx.dates.slice(0, 2));
      return idx;
    }

    /** Load every event file for the selected dates/sports (for search). */
    async function prefetch() {
      const idx = await initDates();
      const evs = idx.events.filter(inFilter);
      await Promise.all(evs.map(e => loadEvent(e.slug).catch(() => null)));
    }

    /** @param {object} e index event @returns {boolean} passes date + sport chips */
    function inFilter(e) {
      return (!state.dates || state.dates.has(e.date)) && (!state.sports.size || state.sports.has(e.sport));
    }

    /** Run the current query over loaded events. Side effect: DOM. */
    async function runSearch() {
      const q = norm(input.value);
      state.q = q;
      if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
      results.hidden = false;
      results.innerHTML = `<div class="muted small pad">${esc(STR.calc.searching)}</div>`;
      try { await prefetch(); } catch (e) { /* show what we have */ }
      if (state.q !== q) return; // a newer keystroke won
      const idx = cache.index;
      const tokens = q.split(' ').filter(Boolean);
      const hits = [];
      for (const ie of idx.events.filter(inFilter)) {
        const evP = cache.events.get(ie.slug);
        if (!evP) continue;
        const ev = await evP.catch(() => null);
        if (!ev) continue;
        for (const r of rowsFor(cache.live.get(ev.slug) || ev)) {
          const s = score(tokens, r.hay, r.who);
          if (s) hits.push({ r, s: s + (r.m.group === 'lines' ? 1 : 0) });
        }
      }
      hits.sort((a, b) => b.s - a.s || a.r.ev.start_time.localeCompare(b.r.ev.start_time));
      results.innerHTML = hits.length
        ? hits.slice(0, 30).map(h => marketRow(h.r.ev, h.r.m, true)).join('')
        : `<div class="muted pad">${esc(STR.calc.noResults)}</div>`;
    }

    /** Toggle a date or sport chip. */
    function toggleChip(kind, val) {
      const set = kind === 'date' ? state.dates : state.sports;
      if (kind === 'sport' && val === '*') set.clear();
      else if (set.has(val)) { if (kind === 'sport' || set.size > 1) set.delete(val); }
      else set.add(val);
      state.game = null;
      renderBrowse();
      if (state.q) runSearch();
    }

    /** Date label: Today / Tomorrow / "Wed 10/21". */
    function dateLabel(d, i) {
      if (i === 0) return STR.calc.today;
      if (i === 1) return STR.calc.tomorrow;
      const t = new Date(d + 'T12:00:00Z');
      return t.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
    }

    /** Render chips + game list, or the open game. Side effect: DOM. */
    function renderBrowse() {
      const idx = cache.index;
      if (!idx) return;
      const today = MC.ctDate(new Date().toISOString());
      const dates = idx.dates.filter(d => d >= today);
      $('.pdates').innerHTML = dates.map((d, i) => `<button type="button" class="chip ${state.dates.has(d) ? 'on' : ''}" data-chip="date" data-val="${d}">${esc(dateLabel(d, i))}</button>`).join('');
      const sports = [...new Set(idx.events.map(e => e.sport))];
      const order = ['NFL', 'MLB', 'NHL', 'NBA', 'WNBA', 'Soccer'];
      sports.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      $('.psports').innerHTML = `<button type="button" class="chip ${state.sports.size ? '' : 'on'}" data-chip="sport" data-val="*">${esc(STR.calc.allSports)}</button>` +
        sports.map(s => `<button type="button" class="chip ${state.sports.has(s) ? 'on' : ''}" data-chip="sport" data-val="${esc(s)}">${esc(s)}</button>`).join('');
      if (state.game) { renderGame(); return; }
      const games = idx.events.filter(inFilter);
      $('.pgames').innerHTML = games.length ? games.map(e => `
        <button type="button" class="gcard" data-game="${esc(e.slug)}">
          <span class="glogos">${window.Teams.badges(teamsOf(e), 30)}</span>
          <span class="gmain"><b>${esc(shortTitle(e))}</b><span class="muted small">${esc(e.sport)} · ${esc(when(e.start_time, e.date !== today))}</span></span>
          <span class="gcount muted small">${e.market_count} bets ›</span>
        </button>`).join('') : `<div class="muted pad">${esc(STR.calc.noGames)}</div>`;
    }

    /** Open one game: show snapshot now, then swap in live prices. */
    async function openGame(slug) {
      state.game = slug;
      if (!state.open) { state.open = true; panel.hidden = false; $('.pbrowse').textContent = STR.calc.hideBrowse; await initDates(); }
      results.hidden = true;
      state.gameData = cache.live.get(slug) || await loadEvent(slug);
      state.gameStatus = state.gameData.liveAt ? STR.calc.livePrices(when(state.gameData.liveAt)) : STR.calc.snapshotPrices(when(state.gameData.updated_at, true));
      renderBrowse();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!state.gameData.liveAt) {
        try {
          const live = await liveEvent(slug);
          if (state.game !== slug) return;
          state.gameData = live;
          state.gameStatus = STR.calc.livePrices(when(live.liveAt));
          renderGame();
        } catch (e) { /* keep snapshot */ }
      }
    }

    /** Render the open game's markets in three groups. Side effect: DOM. */
    function renderGame() {
      const ev = state.gameData;
      if (!ev) return;
      const lines = ev.markets.filter(m => m.group === 'lines');
      const props = ev.markets.filter(m => m.group === 'props');
      const other = ev.markets.filter(m => m.group === 'other');
      const byPlayer = {};
      props.forEach(m => (byPlayer[m.player] = byPlayer[m.player] || []).push(m));
      const order = { moneyline: 0, spread: 1, total: 2 };
      lines.sort((a, b) => order[a.type] - order[b.type] || Math.abs(a.line || 0) - Math.abs(b.line || 0));
      const players = Object.keys(byPlayer).sort();
      $('.pgames').innerHTML = `
        <div class="ghead">
          <button type="button" class="btn btn-sm pback">${esc(STR.calc.back)}</button>
          <div class="ghead-main">${window.Teams.badges(teamsOf(ev), 34)}<div><b>${esc(shortTitle(ev))}</b>
            <div class="muted small">${esc(ev.sport)} · ${esc(when(ev.start_time, true))}</div></div></div>
          <div class="muted small">${esc(state.gameStatus)} ${tipBtn('snapshot')}</div>
        </div>
        <h4>${esc(STR.calc.gameLines)}</h4>
        ${lines.map(m => marketRow(ev, m)).join('') || `<div class="muted small">${esc(STR.none)}</div>`}
        <h4>${esc(STR.calc.playerProps)}</h4>
        ${players.map(p => `<details class="pgroup" data-player="${esc(p)}"><summary>${window.Teams.badge(Object.assign({ league: ev.league }, (ev.teams || []).find(t => t.abbr === byPlayer[p][0].team) || {}), 22)} ${esc(p)} <span class="muted small">(${byPlayer[p].length})</span></summary><div class="pgroup-body"></div></details>`).join('') || `<div class="muted small">${esc(STR.none)}</div>`}
        <details class="pgroup" data-other="1"><summary>${esc(STR.calc.other)} <span class="muted small">(${other.length})</span></summary><div class="pgroup-body"></div></details>`;
      // Render group bodies only when opened (an NFL game has ~700 bets).
      $('.pgames').querySelectorAll('details.pgroup').forEach(d => d.addEventListener('toggle', () => {
        const body = d.querySelector('.pgroup-body');
        if (!d.open || body.childElementCount) return;
        const list = d.dataset.other ? other : byPlayer[d.dataset.player];
        body.innerHTML = list.map(m => marketRow(ev, m)).join('');
      }));
    }

    /**
     * One market with two tappable sides.
     * @param {boolean} [withGame] also show the game (search results)
     */
    function marketRow(ev, m, withGame) {
      const btn = side => {
        const c = costOf(m, side);
        const lab = side === 'yes' ? m.side_yes_label : m.side_no_label;
        const k = m.kalshi && (side === 'yes' ? m.kalshi.yes : m.kalshi.no);
        return `<button type="button" class="pbtn" ${c == null ? 'disabled' : ''} data-add="${esc(ev.slug)}|${esc(m.id)}|${side}">
          <span class="pbtn-lab">${esc(lab)}</span><b>${c == null ? '—' : esc(opts.fmt(c))}</b>${k ? `<span class="kpx">Kalshi ${esc(opts.fmt(k))}</span>` : ''}</button>`;
      };
      const logos = m.player ? window.Teams.badge(Object.assign({ league: ev.league }, (ev.teams || []).find(t => t.abbr === m.team) || {}), 22) : withGame ? window.Teams.badges(teamsOf(ev), 20) : '';
      return `<div class="mrow">
        <div class="mlabel">${logos}<span>${esc(m.label)}${withGame ? `<span class="muted small"> · ${esc(shortTitle(ev))}, ${esc(when(ev.start_time, true))}</span>` : ''}</span></div>
        <div class="mbtns">${btn('yes')}${btn('no')}</div>
      </div>`;
    }

    /** Tooltip button markup (handled globally by app.js). */
    function tipBtn(key) { return `<button type="button" class="tip" data-tip="${key}" aria-label="${esc(STR.tipButton)}">i</button>`; }

    return { destroy() { root.innerHTML = ''; } };
  }

  window.Picker = { create, loadIndex, loadEvent, liveEvent, livePrice, kalshiUrlFromTicker };
})();
