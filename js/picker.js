/**
 * js/picker.js — market picker for the bet builder (search + browse).
 *
 * PURPOSE
 *   Lets the user add slip legs by tapping a price instead of typing. Three
 *   ways in: (a) a step-by-step filter panel (day + sport -> bet types with
 *   sub-types -> team -> player; rules in js/picker-filters.js); (b) a search
 *   box with instant fuzzy matching across teams (nickname, city, abbreviation),
 *   players, prop types and bet names ("purdy" -> Purdy 1+ INT, …), applied on
 *   top of the filters; (c) browse: game cards for the filtered day -> one
 *   game's markets grouped into Main bets / Player bets (by player) / Other.
 *   Filters are remembered for the browser tab (sessionStorage).
 *   Exposed as window.Picker. Depends on MarketsCore, PickerFilters, Teams, STR, BetCalc.
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

  /**
   * Kalshi link for a market ticker. Uses the app-friendly 3-part format
   * /markets/<series>/<series-slug>/<event> (see the comment above
   * MarketsCore.kalshiSlug for why). Slugs come from index.json
   * (kalshi_series_slugs), written daily by scripts/fetch-markets.mjs.
   * @param {string} t market or event ticker
   * @param {'yes'|'no'} [side] our side; with a side the link also pre-selects
   *   the exact line and Yes/No in Kalshi's order ticket
   * @param {object} [k] full market.kalshi object (for flip / no_ticker)
   */
  function kalshiUrlFromTicker(t, side, k) {
    const slugs = (cache.index && cache.index.kalshi_series_slugs) || {};
    return side ? MC.kalshiMarketUrl(k || { ticker: t }, side, slugs) : MC.kalshiEventUrl(t, slugs);
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
      // exact market + side when matched, else the game page, else null (UI falls back to search)
      kalshiUrl: m.kalshi ? kalshiUrlFromTicker(m.kalshi.ticker, side, m.kalshi) : ev.kalshi_url || null,
      kalshiMatch: m.kalshi ? 'market' : ev.kalshi_url ? 'event' : 'none',
      kalshiPrice: m.kalshi ? (side === 'yes' ? m.kalshi.yes : m.kalshi.no) : null,
      marketId: m.id, side, eventSlug: ev.slug, eventTitle: shortTitle(ev),
      teams: sideTeams(ev, m, side).map(t => ({ league: t.league, abbr: t.abbr, logo: t.logo, color: t.color, display: t.display })),
      asOf, live: !!live
    };
  }

  // ---------------------------------------------------------------- search index

  const PF = window.PickerFilters;

  /** Per-event cached search rows: [{ev, m, hay, who}] */
  const searchRows = new Map();

  /** Search words for a team: nickname, name, full name with city (`full`, e.g. "San Jose Sharks"), abbreviations. */
  const teamWords = t => (t ? `${t.short} ${t.name} ${t.full || ''} ${t.display} ${t.abbr}` : '');

  /**
   * Build (once) the search rows for an event.
   * WHY per-market team words: the old version added BOTH teams' names to
   * every market, so "San" matched all ~700 bets of the 49ers game equally,
   * and the +1 bonus for main bets pushed every player prop below the
   * 30-result cut ("San" showed only game markets). Now a player prop only
   * carries its OWN team's words (a Commanders player doesn't match "49ers"),
   * plus its stat in plain words ("receiving yards") and the bet-type label
   * ("Catches"), and results are listed in two groups (game bets / player
   * props), each with its own "Show more".
   */
  function rowsFor(ev) {
    if (searchRows.has(ev.slug)) return searchRows.get(ev.slug);
    const both = (ev.teams || []).map(teamWords).join(' ');
    const F = STR.calc.f;
    const rows = ev.markets.map(m => {
      const prop = PF.kindOf(m) === 'prop';
      const mine = prop ? teamWords((ev.teams || []).find(t => t.abbr === m.team)) : both;
      const kindWords = prop ? `${F.propSubs[PF.propBucket(m)] || ''} ${String(m.smt || '').replace(/^[a-z]+_player_/, '').replace(/_/g, ' ')} player prop`
        : `${F.teamSubs[PF.teamSub(m)] || ''}`;
      return { ev, m, hay: norm(`${m.label} ${m.side_yes_label} ${m.side_no_label} ${m.player || ''} ${mine} ${kindWords} ${ev.sport}`), who: norm(m.player || '') };
    });
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

  // ---------------------------------------------------------------- filter memory

  /** sessionStorage key: filters last for this browser tab, not forever. */
  const SKEY = 'betdash_picker_filters';
  function loadSaved() { try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function save(obj) { try { sessionStorage.setItem(SKEY, JSON.stringify(obj)); } catch (e) { /* private mode: fine */ } }

  // ---------------------------------------------------------------- UI

  /** Results shown per group before "Show more". */
  const PAGE = 20;

  /**
   * Mount the picker into a container.
   *
   * LAYOUT (top to bottom)
   *   Filters panel (<details>, collapsible; open/closed is remembered)
   *     1. Day chips + sport chips   2. Bet type checkboxes with sub-types
   *     3. Team dropdown with logos  4. Player dropdown (props + team only)
   *     "N bets match" + Reset filters
   *   Search box -> results: every bet that passes the filters AND the search
   *     text, in two groups (Game bets / Player props), 20 at a time.
   *   Browse games: game cards for the filtered day/sport/team -> one game.
   *
   * @param {HTMLElement} root
   * @param {{onAdd:(leg:object)=>void, fmt:(cents:number)=>string}} opts
   * @returns {{destroy:()=>void}}
   */
  function create(root, opts) {
    const F = STR.calc.f;
    const saved = loadSaved() || {};
    const state = {
      f: null,                  // filter state (PickerFilters shape), set in init()
      panelOpen: saved.panelOpen !== false,
      open: false, game: null, gameData: null, gameStatus: '',
      q: '', lim: { team: PAGE, prop: PAGE }, teamListOpen: false, loading: false
    };
    root.innerHTML = `
      <div class="picker">
        <details class="pfilters" ${state.panelOpen ? 'open' : ''}>
          <summary><span class="pf-title">${esc(F.title)}</span><span class="pf-sum"></span></summary>
          <div class="pf-body">
            <div class="pf-step"><div class="pf-lab">${esc(F.step1)}</div><div class="chips pf-days"></div><div class="chips pf-sports"></div></div>
            <div class="pf-step"><div class="pf-lab">${esc(F.step2)}</div><div class="pf-types"></div></div>
            <div class="pf-step"><div class="pf-lab">${esc(F.step3)}</div><div class="pf-teamsel"></div></div>
            <div class="pf-step pf-player-step" hidden><label class="pf-lab" for="pf-player">${esc(F.step4)}</label>
              <select id="pf-player" class="pf-player"></select></div>
            <div class="pf-foot"><span class="pf-count"></span><button type="button" class="btn btn-sm pf-reset">${esc(F.reset)}</button></div>
          </div>
        </details>
        <div class="search-wrap">
          <input type="search" class="psearch" placeholder="${esc(STR.calc.searchPh)}" autocomplete="off" enterkeyhint="search" aria-label="${esc(STR.calc.searchPh)}">
          <div class="presults" hidden></div>
        </div>
        <div class="row picker-actions">
          <button type="button" class="btn pbrowse">${esc(STR.calc.browse)}</button>
        </div>
        <div class="pbrowse-panel" hidden>
          <div class="pgames"></div>
        </div>
      </div>`;
    const $ = s => root.querySelector(s);
    const input = $('.psearch'), results = $('.presults'), panel = $('.pbrowse-panel');

    /** Today in CT, and the snapshot days from today on. */
    const todayCT = () => MC.ctDate(new Date().toISOString());
    const days = () => (cache.index ? cache.index.dates.filter(d => d >= todayCT()) : []);

    /** Load the index and restore the remembered filters (once). */
    async function init() {
      const idx = await loadIndex();
      if (!state.f) state.f = PF.sanitize(saved.f, days(), days()[0] || idx.dates[0]);
      return idx;
    }

    /** Index events that pass day / sport / team. */
    const eventsIn = f => (cache.index ? cache.index.events.filter(e => PF.eventPasses(e, f)) : []);

    /** Loaded snapshot events for the current day/sport/team (skips ones still loading). */
    async function loadedEvents() {
      const out = [];
      for (const ie of eventsIn(state.f)) {
        const p = cache.events.get(ie.slug);
        const ev = p && await p.catch(() => null);
        if (ev) out.push(cache.live.get(ev.slug) || ev);
      }
      return out;
    }

    /** Fetch every game file the current filters need (cached). */
    async function prefetch() {
      await init();
      await Promise.all(eventsIn(state.f).map(e => loadEvent(e.slug).catch(() => null)));
    }

    /**
     * Any filter changed: remember it, redraw the panel, reload what's
     * needed, then redraw the panel (with counts) and the results.
     */
    async function changed() {
      save({ f: state.f, panelOpen: state.panelOpen });
      state.lim = { team: PAGE, prop: PAGE };
      state.game = null;
      renderFilters(null);
      state.loading = true;
      await prefetch().catch(() => {});
      state.loading = false;
      const evs = await loadedEvents();
      renderFilters(evs);
      runResults(evs);
      if (state.open) renderBrowse();
    }

    // ---------------------------------------------------------- events

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
      // Close the team list when tapping anywhere else.
      if (state.teamListOpen && !e.target.closest('.pf-teamsel')) { state.teamListOpen = false; renderTeamSel(); }
      const g = e.target.closest('[data-game]');
      if (g) { openGame(g.dataset.game); return; }
      const chip = e.target.closest('[data-chip]');
      if (chip) {
        const f = state.f;
        if (chip.dataset.chip === 'day') f.day = chip.dataset.val; else f.sport = chip.dataset.val;
        dropStaleTeam();
        changed();
        return;
      }
      if (e.target.closest('.pf-teambtn')) { state.teamListOpen = !state.teamListOpen; renderTeamSel(); return; }
      const tm = e.target.closest('[data-team]');
      if (tm) { state.f.team = tm.dataset.team; state.f.player = ''; state.teamListOpen = false; changed(); return; }
      const more = e.target.closest('[data-more]');
      if (more) { state.lim[more.dataset.more] += PAGE; runResults(await loadedEvents()); return; }
      if (e.target.closest('.pf-reset')) {
        state.f = PF.defaults(days()[0]);
        input.value = '';
        changed();
        return;
      }
      if (e.target.closest('.pback')) { state.game = null; renderBrowse(); }
    });

    // Checkboxes (bet types) and the player dropdown.
    root.addEventListener('change', e => {
      const t = e.target, f = state.f;
      if (t.matches('[data-kind]')) { f[t.dataset.kind === 'team' ? 'teamOn' : 'propOn'] = t.checked; if (t.dataset.kind === 'prop' && !t.checked) f.player = ''; changed(); }
      else if (t.matches('[data-sub]')) {
        const [kind, key] = t.dataset.sub.split(':');
        const list = kind === 'team' ? f.teamOff : f.propOff;
        const i = list.indexOf(key);
        if (t.checked && i >= 0) list.splice(i, 1); else if (!t.checked && i < 0) list.push(key);
        changed();
      } else if (t.matches('.pf-player')) { f.player = t.value; changed(); }
    });

    $('.pfilters').addEventListener('toggle', () => { state.panelOpen = $('.pfilters').open; save({ f: state.f, panelOpen: state.panelOpen }); });

    $('.pbrowse').onclick = async () => {
      state.open = !state.open;
      panel.hidden = !state.open;
      $('.pbrowse').textContent = state.open ? STR.calc.hideBrowse : STR.calc.browse;
      if (state.open) { await init(); renderBrowse(); }
    };

    // Search: debounce keystrokes.
    let timer = null;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => { await prefetch().catch(() => {}); runResults(await loadedEvents()); }, 90); });

    /** After a day/sport change, forget a team (and player) that no longer plays. */
    function dropStaleTeam() {
      const f = state.f;
      if (f.team && !PF.teamOptions(eventsIn(Object.assign({}, f, { team: '' }))).some(t => t.key === f.team)) { f.team = ''; f.player = ''; }
    }

    // ---------------------------------------------------------- filter panel

    /** Date label: Today / Tomorrow / "Wed 10/21". */
    function dateLabel(d) {
      const ds = days(), i = ds.indexOf(d);
      if (d === '*') return F.allDays;
      if (i === 0 && d === todayCT()) return STR.calc.today;
      if (i === 1 || (i === 0 && d !== todayCT())) {
        const t = new Date(todayCT() + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1);
        if (t.toISOString().slice(0, 10) === d) return STR.calc.tomorrow;
      }
      const t = new Date(d + 'T12:00:00Z');
      return t.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
    }

    /**
     * Draw the whole filter panel.
     * @param {object[]|null} evs loaded events for counts (null = still loading)
     */
    function renderFilters(evs) {
      const idx = cache.index, f = state.f;
      if (!idx || !f) return;
      const chip = (kind, val, label, on) => `<button type="button" class="chip ${on ? 'on' : ''}" data-chip="${kind}" data-val="${esc(val)}" aria-pressed="${on}">${esc(label)}</button>`;
      $('.pf-days').innerHTML = days().map(d => chip('day', d, dateLabel(d), f.day === d)).join('') + chip('day', '*', F.allDays, f.day === '*');
      const order = ['NFL', 'MLB', 'NHL', 'NBA', 'WNBA', 'Soccer'];
      const sports = [...new Set(eventsIn(Object.assign({}, f, { sport: '', team: '' })).map(e => e.sport))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      $('.pf-sports').innerHTML = chip('sport', '', F.anySport, !f.sport) + sports.map(s => chip('sport', s, s, f.sport === s)).join('');

      // 2. Bet type: two top boxes, each with its sub-boxes and counts.
      const counts = evs ? PF.subCounts(evs, f) : null;
      const box = (attr, label, on, n, disabled) => `<label class="pf-check ${disabled ? 'off' : ''}"><input type="checkbox" ${attr} ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(label)}${n == null ? '' : ` <span class="muted small">(${n})</span>`}</span></label>`;
      const teamSubs = PF.TEAM_SUBS.map(k => box(`data-sub="team:${k}"`, F.teamSubs[k], !f.teamOff.includes(k), counts ? counts.team[k] || 0 : null, !f.teamOn)).join('');
      const propKeys = [...PF.PROP_BUCKETS.map(b => b.key), 'other'].filter(k => !counts || counts.prop[k] || f.propOff.includes(k));
      const propSubs = counts && !propKeys.length ? `<div class="muted small pf-note">${esc(F.noProps)}</div>`
        : propKeys.map(k => box(`data-sub="prop:${k}"`, F.propSubs[k] || k, !f.propOff.includes(k), counts ? counts.prop[k] || 0 : null, !f.propOn)).join('');
      const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
      $('.pf-types').innerHTML = `
        <div class="pf-kind">${box('data-kind="team"', F.teamBets, f.teamOn, counts ? sum(counts.team) : null)}<div class="pf-subs">${teamSubs}</div></div>
        <div class="pf-kind">${box('data-kind="prop"', F.playerProps, f.propOn, counts ? sum(counts.prop) : null)}<div class="pf-subs">${counts || f.propOn ? propSubs : ''}</div></div>`;

      renderTeamSel();

      // 4. Player: only with Player props on and a team chosen.
      const step = $('.pf-player-step');
      step.hidden = !(f.propOn && f.team);
      if (!step.hidden) {
        const players = PF.playerOptions(eventsIn(f), f.team);
        if (f.player && !players.includes(f.player)) f.player = '';
        $('.pf-player').innerHTML = `<option value="">${esc(players.length ? F.anyPlayer : F.noPlayers)}</option>` +
          players.map(p => `<option value="${esc(p)}" ${p === f.player ? 'selected' : ''}>${esc(p)}</option>`).join('');
      }

      // Summary line (shown even when the panel is folded) + count.
      const tsel = f.team && PF.teamOptions(eventsIn(Object.assign({}, f, { team: '' }))).find(t => t.key === f.team);
      const kinds = f.teamOn && f.propOn ? F.allBets : f.teamOn ? F.teamBets : f.propOn ? F.playerProps : F.noBets;
      $('.pf-sum').textContent = [dateLabel(f.day), f.sport, tsel && tsel.short, f.player, kinds].filter(Boolean).join(' · ');
      $('.pf-count').textContent = evs ? '' : F.loading;
    }

    /** 3. Team dropdown: a button that opens a list of team buttons with logos. */
    function renderTeamSel() {
      const f = state.f;
      if (!f) return;
      const teams = PF.teamOptions(eventsIn(Object.assign({}, f, { team: '' })));
      const cur = teams.find(t => t.key === f.team);
      const logo = t => window.Teams.badge(Object.assign({}, t), 24);
      $('.pf-teamsel').innerHTML = `
        <button type="button" class="pf-teambtn" aria-haspopup="listbox" aria-expanded="${state.teamListOpen}">
          ${cur ? `${logo(cur)}<span>${esc(cur.short)} <span class="muted small">${esc(cur.sport)}</span></span>` : `<span>${esc(F.anyTeam)}</span>`}<span class="pf-caret">▾</span></button>
        <div class="pf-teamlist" role="listbox" ${state.teamListOpen ? '' : 'hidden'}>
          <button type="button" class="pf-teamopt ${f.team ? '' : 'on'}" data-team="" role="option">${esc(F.anyTeam)}</button>
          ${teams.map(t => `<button type="button" class="pf-teamopt ${t.key === f.team ? 'on' : ''}" data-team="${esc(t.key)}" role="option">${logo(t)}<span>${esc(t.short)}</span><span class="muted small">${esc(t.sport)} · ${esc(t.display || '')}</span></button>`).join('')}
        </div>`;
    }

    // ---------------------------------------------------------- results

    /**
     * List every bet that passes the filters and the search text.
     * Nothing narrowed and no search: just show how many bets the day has.
     * @param {object[]} evs loaded events (day/sport/team already applied)
     */
    function runResults(evs) {
      const f = state.f;
      if (!f) return;
      const q = norm(input.value);
      state.q = q;
      const tokens = q.length >= 2 ? q.split(' ').filter(Boolean) : [];
      const hits = { team: [], prop: [] };
      for (const ev of evs) {
        if (!PF.eventPasses(ev, f)) continue;
        for (const r of rowsFor(ev)) {
          if (!PF.marketPasses(ev, r.m, f)) continue;
          const s = tokens.length ? score(tokens, r.hay, r.who) : 1;
          if (s) hits[PF.kindOf(r.m)].push({ r, s: s + (r.m.group === 'lines' ? 0.5 : 0) });
        }
      }
      const total = hits.team.length + hits.prop.length;
      const show = tokens.length > 0 || PF.isNarrowed(f);
      $('.pf-count').textContent = show ? F.match(total) : F.dayTotal(total, dateLabel(f.day));
      if (!show) { results.hidden = true; results.innerHTML = ''; return; }
      results.hidden = false;
      if (!total) { results.innerHTML = `<div class="muted pad">${esc(tokens.length ? STR.calc.noResults : F.noMatch)}</div>`; return; }
      const byScore = (a, b) => b.s - a.s || a.r.ev.start_time.localeCompare(b.r.ev.start_time);
      const group = (kind, title) => {
        const list = hits[kind].sort(byScore);
        if (!list.length) return '';
        const lim = state.lim[kind];
        return `<h5 class="pres-h">${esc(title)} <span class="muted small">(${list.length})</span></h5>` +
          list.slice(0, lim).map(h => marketRow(h.r.ev, h.r.m, true)).join('') +
          (list.length > lim ? `<button type="button" class="btn btn-sm pres-more" data-more="${kind}">${esc(STR.calc.showMore(Math.min(PAGE, list.length - lim)))}</button>` : '');
      };
      results.innerHTML = `<div class="pres-head">${esc(F.match(total))}</div>` + group('team', F.gameBets) + group('prop', F.propBets);
    }

    // ---------------------------------------------------------- browse

    /** Game cards for the filtered day/sport/team, or the open game. Side effect: DOM. */
    function renderBrowse() {
      const idx = cache.index;
      if (!idx || !state.f) return;
      if (state.game) { renderGame(); return; }
      const today = todayCT();
      const games = eventsIn(state.f);
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
      if (!state.open) { state.open = true; panel.hidden = false; $('.pbrowse').textContent = STR.calc.hideBrowse; await init(); }
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
          searchRows.delete(slug); // live markets: rebuild search rows
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

    // First draw: restore remembered filters, load that day's games, show counts.
    init().then(changed).catch(() => {});

    return { destroy() { root.innerHTML = ''; } };
  }

  /**
   * Upgrade an old 2-part Kalshi link (kalshi.com/markets/<series>/<event>,
   * which the Kalshi app opened on its "For you" page) to the 3-part form.
   * Used for bets saved in localStorage before the fix. Returns the URL
   * unchanged if it isn't the old form or the slug isn't known yet.
   * @param {string} url
   */
  function fixKalshiUrl(url) {
    const m = /^https:\/\/kalshi\.com\/markets\/([a-z0-9]+)\/(\1-[a-z0-9]+)\/?$/i.exec(String(url || ''));
    if (!m) return url;
    const slugs = (cache.index && cache.index.kalshi_series_slugs) || {};
    return slugs[m[1].toUpperCase()] ? MC.kalshiEventUrl(m[2], slugs) : url;
  }

  window.Picker = { create, loadIndex, loadEvent, liveEvent, livePrice, kalshiUrlFromTicker, fixKalshiUrl };
})();
