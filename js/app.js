/**
 * js/app.js — UI controller: onboarding, tabs, rendering, event wiring.
 *
 * PURPOSE
 *   Renders every screen from three sources:
 *     - window.APP_CONFIG       brand text + repo wiring (config.js)
 *     - window.Store            private per-device data (js/storage.js)
 *     - data/*.json             shared, public, dollar-free data fetched
 *                               relative to the site (picks, predictions,
 *                               bet-log)
 *   Math lives in window.BetCalc (js/calc.js); remote writes in
 *   window.GitHubLog (js/github-log.js). This file only orchestrates.
 *
 * FLOW
 *   boot() -> applyBrand() -> no profile? showOnboarding() : startApp()
 *   startApp() -> render header + current tab (hash router: #picks, #calc,
 *   #bets, #record, #settings). Re-render functions are idempotent and
 *   simply rebuild their section's innerHTML.
 *
 * SECURITY
 *   All JSON-sourced text goes through esc() before hitting innerHTML, and
 *   links go through safeUrl() (http/https only), because picks.json is
 *   written by an automated job and must be treated as untrusted.
 */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const C = window.BetCalc;
  const S = window.Store;
  const G = window.GitHubLog;

  /** Platforms offered in the calculator leg dropdown. */
  const PLATFORMS = ['Polymarket US', 'Polymarket', 'Kalshi', 'Bovada', 'DraftKings', 'FanDuel', 'Other'];
  /** Bet categories: key -> label. Keys are stored on bets and in the shared log. */
  const CATS = { single: 'Single bets', prop: 'Props', parlay: 'Parlays', longshot: 'Long shots', nonsports: 'Non-sports' };
  /** picks.json section key -> {title, category used when tracking a pick}. Order = render order. */
  const PICK_SECTIONS = [
    ['predictions', 'Game predictions', null],
    ['singles', 'Single bets', 'single'],
    ['props', 'Player props', 'prop'],
    ['parlays', 'Parlays', 'parlay'],
    ['longshots', 'Long shots', 'longshot'],
    ['nonsports', 'Non-sports markets', 'nonsports']
  ];

  /** In-memory calculator state (not persisted until "Save bet"). */
  let calc = freshCalc();
  /** Cached picks.json so "Load in calculator" can find a pick by id. */
  let picksData = null;

  // ---------------------------------------------------------------- utils

  /** @param {string} sel CSS selector @param {ParentNode} [root] @returns {Element|null} */
  const $ = (sel, root = document) => root.querySelector(sel);

  /**
   * HTML-escape any value for safe innerHTML interpolation.
   * @param {*} v @returns {string}
   */
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Allow only http(s) links; adds https:// to bare hosts like "polymarket.us/...".
   * @param {string} u @returns {string|null}
   */
  function safeUrl(u) {
    if (!u) return null;
    let s = String(u).trim();
    if (!/^[a-z]+:/i.test(s)) s = 'https://' + s;
    try { const url = new URL(s); return /^https?:$/.test(url.protocol) ? url.href : null; } catch (e) { return null; }
  }

  /** @param {number} n @returns {string} "$1,234.56" / "-$5.00" */
  function money(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-$' : '$') + s;
  }
  /** @param {number} x fraction @param {number} [d] @returns {string} "12.3%" */
  const pct = (x, d = 1) => (typeof x === 'number' && isFinite(x) ? (x * 100).toFixed(d) + '%' : '—');
  /** @param {number} x @returns {string} "3.31x" */
  const mult = x => (typeof x === 'number' && isFinite(x) ? x.toFixed(2) + 'x' : '—');
  /** @returns {string} short random id, e.g. "b_lq3k9a_x7f2" */
  const uid = () => 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  /** @param {number} v @returns {string} 'pos'|'neg'|'' class for coloring */
  const sign = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  /**
   * Format an ISO time in the user's zone (America/Chicago) with a zone label.
   * @param {string} iso @returns {string} e.g. "Oct 19, 12:55 AM CDT"
   */
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso || '—');
    return d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  /**
   * Show a transient message. Side effect: DOM.
   * @param {string} msg @param {number} [ms]
   */
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /**
   * Fetch a repo data file relative to the site, bypassing caches so the
   * daily job's overwrite shows up immediately.
   * @param {string} path e.g. "data/picks.json" @returns {Promise<object>}
   */
  async function fetchData(path) {
    const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }

  // ---------------------------------------------------------------- brand

  /**
   * Fill every [data-brand] element and document.title from APP_CONFIG.
   * This is how renaming in config.js propagates everywhere. Side effect: DOM.
   */
  function applyBrand() {
    document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = CFG[el.dataset.brand] || ''; });
    document.title = `${CFG.appName} — ${CFG.tagline}`;
    const s = CFG.slogans || [];
    if (s.length) $('#slogan').textContent = s[new Date().getDate() % s.length];
  }

  // ---------------------------------------------------------------- bankroll math

  /**
   * Derive bankroll stats from the profile + bets.
   * @returns {{current:number, pl:number, openStake:number, available:number,
   *            series:{t:string,v:number}[]}}
   *   current = start + Σ settled P/L; available = current - open stakes;
   *   series = bankroll after each settlement (chronological) for the chart.
   */
  function bankrollStats() {
    const p = S.getProfile();
    const bets = S.getBets();
    let current = p.startBankroll;
    const series = [{ t: p.createdAt, v: current }];
    bets.filter(b => b.status !== 'open')
      .sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)))
      .forEach(b => { current += C.profit(b.stake, b.quotedMultiple, b.status); series.push({ t: b.settledAt, v: current }); });
    const openStake = bets.filter(b => b.status === 'open').reduce((s, b) => s + b.stake, 0);
    return { current, pl: current - p.startBankroll, openStake, available: current - openStake, series };
  }

  /**
   * Record / ROI per category plus an "all" row.
   * @returns {object} {cat: {w,l,p,staked,pl,roi}} where roi = pl / staked
   *   over SETTLED bets (pushes count as staked 0 since money is returned).
   */
  function recordByCategory() {
    const out = {};
    [...Object.keys(CATS), 'all'].forEach(k => (out[k] = { w: 0, l: 0, p: 0, staked: 0, pl: 0, roi: null }));
    S.getBets().filter(b => b.status !== 'open').forEach(b => {
      [b.category, 'all'].forEach(k => {
        const r = out[k] || (out[k] = { w: 0, l: 0, p: 0, staked: 0, pl: 0, roi: null });
        if (b.status === 'won') r.w++; else if (b.status === 'lost') r.l++; else r.p++;
        if (b.status !== 'push') r.staked += b.stake;
        r.pl += C.profit(b.stake, b.quotedMultiple, b.status);
      });
    });
    Object.values(out).forEach(r => (r.roi = r.staked ? r.pl / r.staked : null));
    return out;
  }

  /** Update the header bankroll figure. Side effect: DOM. */
  function renderHeader() {
    $('#hdr-bankroll').textContent = money(bankrollStats().current);
  }

  // ---------------------------------------------------------------- onboarding

  /**
   * Show the blocking first-run setup. The unit field auto-tracks 2% of the
   * bankroll (and max-per-slip 5%) until the user types in it themselves.
   * Side effects: DOM, and on submit writes the profile to localStorage.
   */
  function showOnboarding() {
    $('#app').hidden = true;
    $('#onboarding').hidden = false;
    const f = $('#onboarding-form');
    const bank = $('#ob-bankroll'), unit = $('#ob-unit'), max = $('#ob-max');
    [unit, max].forEach(el => el.addEventListener('input', () => (el.dataset.touched = '1')));
    bank.addEventListener('input', () => {
      const b = parseFloat(bank.value);
      if (!(b > 0)) return;
      if (!unit.dataset.touched) unit.value = (b * 0.02).toFixed(2);
      if (!max.dataset.touched) max.value = (b * 0.05).toFixed(2);
    });
    setTimeout(() => $('#ob-name').focus(), 50);
    f.onsubmit = e => {
      e.preventDefault();
      const name = $('#ob-name').value.trim();
      const b = parseFloat(bank.value);
      const u = parseFloat(unit.value) || +(b * 0.02).toFixed(2);
      const m = parseFloat(max.value) || +(b * 0.05).toFixed(2);
      const err = $('#ob-error');
      if (!name) return (err.textContent = 'Enter a display name.');
      if (!(b > 0)) return (err.textContent = 'Enter your starting bankroll.');
      if (!(u > 0) || u > b) return (err.textContent = 'Unit must be more than $0 and no bigger than the bankroll.');
      if (!(m > 0)) return (err.textContent = 'Max per slip must be more than $0.');
      S.setProfile({ name, startBankroll: b, unit: u, maxPerSlip: m, windowEnd: $('#ob-end').value || '', createdAt: new Date().toISOString() });
      $('#onboarding').hidden = true;
      startApp();
      toast(`Locked in. ${CFG.tagline}.`);
    };
  }

  // ---------------------------------------------------------------- router

  /**
   * Show one tab and render it. Hash-based so the back button works.
   * @param {string} name tab key. Side effects: DOM, location.hash.
   */
  function go(name) {
    if (!$('#tab-' + name)) name = 'picks';
    document.querySelectorAll('.tab').forEach(s => (s.hidden = s.dataset.tab !== name));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    ({ picks: renderPicks, calc: renderCalc, bets: renderBets, record: renderRecord, settings: renderSettings })[name]();
    window.scrollTo(0, 0);
  }

  /** Reveal the main app and render the current tab. Side effect: DOM. */
  function startApp() {
    $('#app').hidden = false;
    renderHeader();
    go((location.hash || '#picks').slice(1));
  }

  // ---------------------------------------------------------------- picks

  /**
   * Render "$" for a units stake using THIS user's unit size.
   * @param {object} pick has stake_units and optional stake_units_max
   * @returns {string} e.g. "0.5u ($5.00)" or "0.25–0.5u ($2.50–$5.00)" or "Skip"
   */
  function stakeText(pick) {
    const u = S.getProfile().unit;
    const lo = pick.stake_units, hi = pick.stake_units_max;
    if (!(lo > 0)) return 'Skip';
    if (hi > lo) return `${lo}–${hi}u (${money(lo * u)}–${money(hi * u)})`;
    return `${lo}u (${money(lo * u)})`;
  }

  /**
   * One pick card's HTML (singles, props, parlays, long shots, non-sports).
   * @param {object} pk pick (see README "picks.json schema") @param {string} cat
   * @returns {string} HTML
   */
  function pickCard(pk, cat) {
    const isMulti = Array.isArray(pk.legs) && pk.legs.length > 0;
    const action = pk.action || (pk.stake_units > 0 ? 'bet' : 'skip');
    const edge = typeof pk.edge === 'number' ? pk.edge : (typeof pk.fair === 'number' && typeof pk.price === 'number' ? C.edgePts(pk.fair, pk.price) : null);
    const link = safeUrl(pk.link);
    const stats = isMulti
      ? [['Est', mult(pk.est_multiple)], ['Quoted', pk.quoted_multiple ? mult(pk.quoted_multiple) : '—'],
         ['Hit', typeof pk.hit_prob === 'number' ? pct(pk.hit_prob / 100, 1) : '—'], ['Skip <', pk.skip_below ? mult(pk.skip_below) : '—']]
      : [['Price', typeof pk.price === 'number' ? pk.price + '¢' : '—'], ['Fair', typeof pk.fair === 'number' ? pk.fair + '%' : '—'],
         ['Edge', edge === null ? '—' : `<span class="${sign(edge)}">${edge > 0 ? '+' : ''}${edge.toFixed(1)}</span>`], ['Payout', typeof pk.price === 'number' ? mult(100 / pk.price) : '—']];
    return `<div class="card ${action === 'skip' ? 'skip' : ''}">
      <div class="pick-head">
        <div>
          <div class="pick-title">${esc(pk.side || pk.market)}</div>
          <div class="pick-sub">${esc(pk.market && pk.side ? pk.market + ' · ' : '')}${esc(pk.event || '')}${pk.platform ? ' · ' + esc(pk.platform) : ''}</div>
        </div>
        <span class="badge ${esc(action)}">${esc(action === 'wait' ? 'wait' : action)}</span>
      </div>
      <div class="pick-stats">${stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
      ${isMulti ? `<ul class="legs">${pk.legs.map(l => `<li>${esc(l.desc)}${l.price !== undefined ? ` <span class="muted">@ ${esc(l.price)}${/^\d+(\.\d+)?$/.test(String(l.price)) ? '¢' : ''}</span>` : ''}${l.fair !== undefined ? ` <span class="muted">(fair ${esc(l.fair)}%)</span>` : ''}</li>`).join('')}</ul>` : ''}
      <div><b>Stake:</b> ${esc(stakeText(pk))}</div>
      ${pk.pending_news ? `<div class="news">⏳ <b>Pending news:</b> ${esc(pk.pending_news)}</div>` : ''}
      ${pk.verify_note ? `<div class="verify">⚠️ ${esc(pk.verify_note)}</div>` : ''}
      ${pk.reasoning ? `<div class="reason">${esc(pk.reasoning)}</div>` : ''}
      <div class="pick-actions">
        ${link ? `<a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener">Open market ↗</a>` : ''}
        <button class="btn btn-sm btn-primary" data-load-pick="${esc(pk.id)}" data-cat="${esc(cat)}">Load in calculator</button>
      </div>
    </div>`;
  }

  /**
   * Game prediction card.
   * @param {object} g {game, pick, win_prob, projected_score, player_projections[], reasoning}
   * @returns {string} HTML
   */
  function predictionCard(g) {
    return `<div class="card">
      <div class="pick-head"><div><div class="pick-title">${esc(g.pick)} ${typeof g.win_prob === 'number' ? `<span class="muted">${esc(g.win_prob)}%</span>` : ''}</div>
      <div class="pick-sub">${esc(g.game || '')}${g.sport ? ' · ' + esc(g.sport) : ''}${g.start_time ? ' · ' + esc(fmtTime(g.start_time)) : ''}</div></div></div>
      ${g.projected_score ? `<div>Projected: <b>${esc(g.projected_score)}</b></div>` : ''}
      ${Array.isArray(g.player_projections) && g.player_projections.length ? `<ul class="legs">${g.player_projections.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${g.reasoning ? `<div class="reason">${esc(g.reasoning)}</div>` : ''}
    </div>`;
  }

  /** Fetch + render data/picks.json into #tab-picks. Side effects: network, DOM. */
  async function renderPicks() {
    const el = $('#tab-picks');
    el.innerHTML = '<h2>Today\'s picks</h2><p class="muted">Loading…</p>';
    try {
      picksData = await fetchData('data/picks.json');
    } catch (e) {
      el.innerHTML = '<h2>Today\'s picks</h2><p class="error">Couldn\'t load data/picks.json.</p>';
      return;
    }
    const d = picksData, sec = d.sections || {};
    let html = `<h2>Today's picks</h2>
      <div class="updated">Slate ${esc(d.slate_date || '')} · Last updated ${fmtTime(d.updated_at)}</div>
      ${(d.notes || []).map(n => `<div class="verify">${esc(n)}</div>`).join('')}`;
    for (const [key, title, cat] of PICK_SECTIONS) {
      const items = sec[key] || [];
      html += `<h3>${esc(title)}</h3>`;
      if (!items.length) { html += `<div class="section-empty">Nothing here today.</div>`; continue; }
      html += items.map(it => (key === 'predictions' ? predictionCard(it) : pickCard(it, cat))).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-load-pick]').forEach(b => (b.onclick = () => loadPickIntoCalc(b.dataset.loadPick, b.dataset.cat)));
  }

  /**
   * Prefill the calculator from a pick and switch tabs.
   * @param {string} id pick id @param {string} cat category key
   */
  function loadPickIntoCalc(id, cat) {
    let pk = null;
    Object.values(picksData.sections || {}).forEach(list => (list || []).forEach(p => { if (p.id === id) pk = p; }));
    if (!pk) return;
    const platform = PLATFORMS.includes(pk.platform) ? pk.platform : 'Other';
    const legs = Array.isArray(pk.legs) && pk.legs.length
      ? pk.legs.map(l => ({ desc: l.desc, platform: PLATFORMS.includes(l.platform) ? l.platform : platform, price: String(l.price ?? '') }))
      : [{ desc: [pk.market, pk.side].filter(Boolean).join(' — '), platform, price: String(pk.price ?? '') }];
    const unit = S.getProfile().unit;
    calc = Object.assign(freshCalc(), {
      legs, category: cat, pickId: pk.id,
      quoted: pk.quoted_multiple ? String(pk.quoted_multiple) : (legs.length === 1 && pk.price ? (100 / pk.price).toFixed(2) : ''),
      stake: pk.stake_units > 0 ? (pk.stake_units * unit).toFixed(2) : ''
    });
    go('calc');
    toast('Pick loaded. Enter the app\'s ACTUAL quoted multiple.');
  }

  // ---------------------------------------------------------------- calculator

  /** @returns {object} blank calculator state */
  function freshCalc() {
    return { legs: [{ desc: '', platform: 'Polymarket US', price: '' }, { desc: '', platform: 'Polymarket US', price: '' }],
             category: 'parlay', quoted: '', stake: '', myHit: '', pickId: null, share: null };
  }

  /**
   * Compute every derived calculator number from state. Pure.
   * @param {object} st calculator state
   * @returns {{parsed:(object|null)[], ok:boolean, est:number|null, hit:number|null,
   *            quoted:number|null, stake:number|null, gap:number|null, ev:number|null,
   *            evHit:number|null, payout:number|null}}
   *   evHit = user's own hit-chance override if given, else independent hit.
   *   Note: with no override, EV ≈ stake*gap (market-implied EV), because
   *   quoted*Πp = quoted/est.
   */
  function computeCalc(st) {
    const parsed = st.legs.map(l => C.parsePrice(l.price));
    const ok = parsed.length > 0 && parsed.every(Boolean);
    const pl = ok ? C.parlay(parsed.map(x => x.p)) : null;
    const quoted = parseFloat(st.quoted) > 1 ? parseFloat(st.quoted) : null;
    const stake = parseFloat(st.stake) > 0 ? parseFloat(st.stake) : null;
    const my = parseFloat(st.myHit);
    const evHit = my > 0 && my < 100 ? my / 100 : pl ? pl.hitChance : null;
    return {
      parsed, ok,
      est: pl ? pl.estMultiple : null,
      hit: pl ? pl.hitChance : null,
      quoted, stake, evHit,
      gap: pl && quoted ? C.gap(quoted, pl.estMultiple) : null,
      ev: stake && quoted && evHit ? C.expectedValue(stake, quoted, evHit) : null,
      payout: stake && quoted ? stake * quoted : null
    };
  }

  /** Build the calculator UI from `calc` state and wire inputs. Side effect: DOM. */
  function renderCalc() {
    const el = $('#tab-calc');
    const share = calc.share === null ? S.getSettings().shareByDefault : calc.share;
    const hasToken = !!S.getToken();
    el.innerHTML = `<h2>Bet calculator</h2>
      <p class="muted small">Prices: cents <b>63</b>, probability <b>0.63</b>, American <b>-150</b>/<b>+120</b>, or decimal <b>2.5</b>.</p>
      <div id="legs"></div>
      <button class="btn" id="add-leg">+ Add leg</button>
      <div class="calc-out" id="calc-out"></div>
      <label class="field"><span>Category</span>
        <select id="c-cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === calc.category ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>Quoted multiple <em>from the app</em></span><input id="c-quoted" inputmode="decimal" placeholder="e.g. 2.97" value="${esc(calc.quoted)}"></label>
        <label class="field"><span>Stake ($) <em>private</em></span><input id="c-stake" inputmode="decimal" placeholder="e.g. ${esc((S.getProfile().unit * 0.5).toFixed(2))}" value="${esc(calc.stake)}"></label>
      </div>
      <label class="field"><span>My hit chance % <em>optional, for EV</em></span><input id="c-my" inputmode="decimal" placeholder="defaults to independent hit chance" value="${esc(calc.myHit)}"></label>
      <div id="calc-out2" class="calc-out"></div>
      <label class="toggle"><input type="checkbox" id="c-share" ${share && hasToken ? 'checked' : ''} ${hasToken ? '' : 'disabled'}>
        <span>Share this bet's numbers <span class="muted small">(legs, prices, multiples, result — never $)</span></span></label>
      ${hasToken ? '' : '<p class="muted small">Sharing is off: add your GitHub token in Settings to contribute to the shared calibration log.</p>'}
      <p id="c-warn" class="error"></p>
      <div class="row"><button class="btn btn-primary btn-xl" id="c-save">Save bet</button></div>
      <button class="btn btn-sm" id="c-clear" style="margin-top:10px">Clear</button>`;
    renderLegs();
    $('#add-leg').onclick = () => { calc.legs.push({ desc: '', platform: calc.legs[calc.legs.length - 1]?.platform || 'Polymarket US', price: '' }); renderLegs(); };
    $('#c-cat').onchange = e => (calc.category = e.target.value);
    $('#c-quoted').oninput = e => { calc.quoted = e.target.value; updateCalcOut(); };
    $('#c-stake').oninput = e => { calc.stake = e.target.value; updateCalcOut(); };
    $('#c-my').oninput = e => { calc.myHit = e.target.value; updateCalcOut(); };
    $('#c-share').onchange = e => (calc.share = e.target.checked);
    $('#c-save').onclick = saveCalcBet;
    $('#c-clear').onclick = () => { calc = freshCalc(); renderCalc(); };
  }

  /** Render the leg editors (one block per leg). Side effect: DOM. */
  function renderLegs() {
    const wrap = $('#legs');
    wrap.innerHTML = calc.legs.map((l, i) => `<div class="leg" data-i="${i}">
      <b>Leg ${i + 1}</b>
      ${calc.legs.length > 1 ? `<button class="btn btn-sm btn-danger remove" data-rm="${i}">✕</button>` : ''}
      <input class="l-desc" placeholder="e.g. Guardians +1.5" value="${esc(l.desc)}" style="margin-top:8px">
      <div class="leg-grid">
        <select class="l-plat">${PLATFORMS.map(p => `<option ${p === l.platform ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <input class="l-price" inputmode="text" placeholder="63 / -150 / 2.5" value="${esc(l.price)}">
      </div>
      <div class="leg-hint"></div>
    </div>`).join('');
    wrap.querySelectorAll('.leg').forEach(div => {
      const i = +div.dataset.i;
      $('.l-desc', div).oninput = e => (calc.legs[i].desc = e.target.value);
      $('.l-plat', div).onchange = e => (calc.legs[i].platform = e.target.value);
      $('.l-price', div).oninput = e => { calc.legs[i].price = e.target.value; updateCalcOut(); };
    });
    wrap.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { calc.legs.splice(+b.dataset.rm, 1); renderLegs(); }));
    updateCalcOut();
  }

  /** Refresh the computed numbers + per-leg parse hints. Side effect: DOM. */
  function updateCalcOut() {
    const r = computeCalc(calc);
    document.querySelectorAll('#legs .leg').forEach((div, i) => {
      const h = $('.leg-hint', div);
      h.textContent = calc.legs[i].price ? (r.parsed[i] ? r.parsed[i].label : 'Can\'t read this price') : '';
      h.className = 'leg-hint' + (calc.legs[i].price && !r.parsed[i] ? ' error' : '');
    });
    const kpi = (k, v, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
    $('#calc-out').innerHTML = kpi('Est. multiple', mult(r.est)) + kpi('Hit chance (indep.)', pct(r.hit));
    if ($('#calc-out2')) {
      $('#calc-out2').innerHTML = kpi('Gap vs est.', r.gap === null ? '—' : (r.gap > 0 ? '+' : '') + pct(r.gap), sign(r.gap)) +
        kpi('Expected value', r.ev === null ? '—' : money(r.ev), sign(r.ev)) +
        kpi('Payout if win', money(r.payout)) +
        kpi('Units', r.stake ? (r.stake / S.getProfile().unit).toFixed(2) + 'u' : '—');
    }
    const w = $('#c-warn');
    if (w) w.textContent = r.stake && r.stake > S.getProfile().maxPerSlip ? `Stake is over your max per slip (${money(S.getProfile().maxPerSlip)}).` : '';
  }

  /**
   * Validate the calculator and save it as an open bet; optionally share.
   * Side effects: localStorage write, possible GitHub commit, DOM.
   */
  async function saveCalcBet() {
    const r = computeCalc(calc);
    if (!r.ok) return toast('Every leg needs a readable price.');
    if (!r.quoted) return toast('Enter the app\'s quoted multiple (e.g. 2.97).');
    if (!r.stake) return toast('Enter your stake.');
    if (r.stake > S.getProfile().maxPerSlip && !confirm(`That's over your ${money(S.getProfile().maxPerSlip)} max per slip. Save anyway?`)) return;
    const share = !!S.getToken() && (calc.share === null ? S.getSettings().shareByDefault : calc.share);
    const bet = {
      id: uid(), createdAt: new Date().toISOString(), settledAt: null,
      category: calc.category, platform: platformLabel(calc.legs),
      legs: calc.legs.map((l, i) => ({ desc: l.desc || `Leg ${i + 1}`, price: l.price, platform: l.platform, p: r.parsed[i].p })),
      estMultiple: r.est, quotedMultiple: r.quoted, hitChance: r.hit, stake: r.stake,
      status: 'open', share, shared: false, pickId: calc.pickId
    };
    S.upsertBet(bet);
    calc = freshCalc();
    renderHeader();
    toast('Bet saved to your tracker.');
    go('bets');
    if (share) await syncBet(bet);
  }

  /**
   * Slip-level platform label: the single platform, or "A + B" if mixed.
   * @param {{platform:string}[]} legs @returns {string}
   */
  function platformLabel(legs) {
    return [...new Set(legs.map(l => l.platform))].join(' + ');
  }

  /**
   * Push a bet's dollar-free record to the shared log; records success on the
   * bet. Errors are surfaced as a toast and leave bet.shared=false so the
   * "Sync unsynced" button in Settings can retry.
   * @param {object} bet @returns {Promise<boolean>} success
   */
  async function syncBet(bet) {
    const token = S.getToken();
    if (!token) return false;
    try {
      let login = S.getLogin();
      if (!login) { login = await G.whoAmI(token); S.setLogin(login); }
      await G.upsertRecord(G.buildRecord(bet, login), token);
      S.upsertBet(Object.assign({}, bet, { shared: true, syncedStatus: bet.status }));
      toast('Shared numbers logged ✔');
      return true;
    } catch (e) {
      S.upsertBet(Object.assign({}, bet, { shared: false }));
      toast('Shared log failed: ' + e.message, 4500);
      return false;
    }
  }

  // ---------------------------------------------------------------- bets / tracker

  /**
   * Draw the bankroll-over-time line on a canvas (HiDPI aware). No library.
   * @param {HTMLCanvasElement} cv @param {{t:string,v:number}[]} series
   */
  function drawChart(cv, series) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const pad = 28, vals = series.map(s => s.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const x = i => pad + (series.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (series.length - 1));
    const y = v => h - pad + 8 - ((v - lo) / (hi - lo)) * (h - 2 * pad);
    ctx.strokeStyle = '#2c2c31'; ctx.lineWidth = 1;
    const start = series[0].v;
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, y(start)); ctx.lineTo(w - pad, y(start)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2.5; ctx.beginPath();
    series.forEach((s, i) => (i ? ctx.lineTo(x(i), y(s.v)) : ctx.moveTo(x(i), y(s.v))));
    ctx.stroke();
    ctx.fillStyle = '#ff5a1f';
    series.forEach((s, i) => { ctx.beginPath(); ctx.arc(x(i), y(s.v), 3, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#9a9aa2'; ctx.font = '11px sans-serif';
    ctx.fillText(money(hi), 4, 14); ctx.fillText(money(lo), 4, h - 6);
  }

  /** Render KPIs, chart, open/settled bets, record table, backup buttons. */
  function renderBets() {
    const el = $('#tab-bets');
    const p = S.getProfile(), st = bankrollStats(), rec = recordByCategory();
    const bets = S.getBets();
    const open = bets.filter(b => b.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const settled = bets.filter(b => b.status !== 'open').sort((a, b) => String(b.settledAt).localeCompare(String(a.settledAt)));
    const kpi = (k, v, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
    const legsTxt = b => b.legs.map(l => esc(l.desc)).join(' + ');
    el.innerHTML = `<h2>${esc(p.name)}'s bankroll</h2>
      <p class="muted small">🔒 Private to this device. Unit ${money(p.unit)} · Max/slip ${money(p.maxPerSlip)}${p.windowEnd ? ' · Window ends ' + esc(p.windowEnd) : ''}</p>
      <div class="kpis">
        ${kpi('Current', money(st.current))}
        ${kpi('P/L', money(st.pl), sign(st.pl))}
        ${kpi('Open risk', money(st.openStake))}
        ${kpi('ROI', pct(rec.all.roi), sign(rec.all.roi))}
      </div>
      <h3>Bankroll over time</h3>
      <canvas class="chart" id="bk-chart"></canvas>
      <h3>Open bets (${open.length})</h3>
      ${open.length ? open.map(b => `<div class="card">
        <div class="pick-head"><div><div class="pick-title">${legsTxt(b)}</div>
        <div class="pick-sub">${esc(CATS[b.category] || b.category)} · ${esc(b.platform)} · ${fmtTime(b.createdAt)}${b.share ? (b.shared ? ' · shared ✔' : ' · share pending') : ''}</div></div>
        <span class="badge open">open</span></div>
        <div class="pick-stats">
          <div class="stat"><div class="k">Stake</div><div class="v">${money(b.stake)}</div></div>
          <div class="stat"><div class="k">Quoted</div><div class="v">${mult(b.quotedMultiple)}</div></div>
          <div class="stat"><div class="k">Est</div><div class="v">${mult(b.estMultiple)}</div></div>
          <div class="stat"><div class="k">To win</div><div class="v pos">${money(b.stake * b.quotedMultiple)}</div></div>
        </div>
        <div class="pick-actions">
          <button class="btn btn-sm btn-primary" data-settle="won" data-id="${b.id}">Won</button>
          <button class="btn btn-sm btn-danger" data-settle="lost" data-id="${b.id}">Lost</button>
          <button class="btn btn-sm" data-settle="push" data-id="${b.id}">Push</button>
          <button class="btn btn-sm" data-del="${b.id}">Delete</button>
        </div></div>`).join('') : '<div class="section-empty">No open bets. Load a pick or use the calculator.</div>'}
      <h3>Settled bets</h3>
      ${settled.length ? `<div class="table-wrap"><table><tr><th>Bet</th><th>Result</th><th class="num">Stake</th><th class="num">P/L</th><th></th></tr>
        ${settled.map(b => { const pl = C.profit(b.stake, b.quotedMultiple, b.status); return `<tr><td>${legsTxt(b)}<div class="muted small">${esc(CATS[b.category] || '')} · ${mult(b.quotedMultiple)}</div></td>
        <td><span class="badge ${b.status}">${b.status}</span></td><td class="num">${money(b.stake)}</td><td class="num ${sign(pl)}">${money(pl)}</td>
        <td><button class="btn btn-sm" data-reopen="${b.id}">↺</button></td></tr>`; }).join('')}</table></div>` : '<div class="section-empty">Nothing settled yet.</div>'}
      <h3>Record & ROI by type</h3>
      <div class="table-wrap"><table><tr><th>Type</th><th>W-L-P</th><th class="num">P/L</th><th class="num">ROI</th></tr>
        ${[...Object.keys(CATS), 'all'].map(k => { const r = rec[k]; return `<tr><td>${k === 'all' ? '<b>All</b>' : CATS[k]}</td><td>${r.w}-${r.l}-${r.p}</td>
        <td class="num ${sign(r.pl)}">${money(r.pl)}</td><td class="num ${sign(r.roi)}">${pct(r.roi)}</td></tr>`; }).join('')}</table></div>
      <h3>Backup</h3>
      <div class="row"><button class="btn" id="exp">Export JSON</button><button class="btn" id="imp">Import JSON</button></div>
      <input type="file" id="imp-file" accept="application/json,.json" hidden>`;
    drawChart($('#bk-chart'), st.series);
    el.querySelectorAll('[data-settle]').forEach(b => (b.onclick = () => settleBet(b.dataset.id, b.dataset.settle)));
    el.querySelectorAll('[data-reopen]').forEach(b => (b.onclick = () => settleBet(b.dataset.reopen, 'open')));
    el.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => {
      if (confirm('Delete this bet from your tracker? (Shared log entries are not removed.)')) { S.deleteBet(b.dataset.del); renderHeader(); renderBets(); }
    }));
    wireBackup(el);
  }

  /**
   * Change a bet's status, update bankroll, and re-share if it was shared.
   * @param {string} id @param {'won'|'lost'|'push'|'open'} status
   * Side effects: localStorage, DOM, possible GitHub commit.
   */
  async function settleBet(id, status) {
    const bet = S.getBets().find(b => b.id === id);
    if (!bet) return;
    const upd = Object.assign({}, bet, { status, settledAt: status === 'open' ? null : new Date().toISOString(), shared: false });
    S.upsertBet(upd);
    renderHeader();
    renderBets();
    if (upd.share && S.getToken()) { await syncBet(upd); renderBets(); }
  }

  /**
   * Wire Export/Import buttons inside a rendered container.
   * Export downloads a JSON file; Import overwrites local data after confirm.
   * @param {Element} root
   */
  function wireBackup(root) {
    $('#exp', root).onclick = () => {
      const blob = new Blob([JSON.stringify(S.exportAll(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `betdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp', root).onclick = () => $('#imp-file', root).click();
    $('#imp-file', root).onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!confirm('Replace the profile and bets on this device with this backup?')) return;
        S.importAll(data);
        toast('Backup restored.');
        startApp();
      } catch (err) { toast('Import failed: ' + err.message, 4000); }
    };
  }

  // ---------------------------------------------------------------- record

  /**
   * Summarise graded predictions into accuracy + calibration buckets.
   * Bucket = floor(win_prob / 5) * 5, e.g. 62% -> "60–65%". A well-calibrated
   * picker's actual hit rate in each bucket ≈ the bucket's average probability.
   * @param {object[]} preds predictions with win_prob (50..100) and result
   * @returns {{graded:number, wins:number, buckets:object[]}}
   */
  function calibration(preds) {
    const graded = preds.filter(p => p.result === 'win' || p.result === 'loss');
    const map = {};
    graded.forEach(p => {
      const lo = Math.min(95, Math.floor(p.win_prob / 5) * 5);
      const b = map[lo] || (map[lo] = { lo, n: 0, wins: 0, probSum: 0 });
      b.n++; b.probSum += p.win_prob; if (p.result === 'win') b.wins++;
    });
    return { graded: graded.length, wins: graded.filter(p => p.result === 'win').length,
             buckets: Object.values(map).sort((a, b) => a.lo - b.lo) };
  }

  /** Render prediction record + shared-log platform gaps. Side effects: network, DOM. */
  async function renderRecord() {
    const el = $('#tab-record');
    el.innerHTML = '<h2>Prediction record</h2><p class="muted">Loading…</p>';
    let preds = null, log = null;
    try { preds = await fetchData('data/predictions.json'); } catch (e) { /* shown below */ }
    try { log = await fetchData(CFG.betLogPath); } catch (e) { /* shown below */ }
    let html = '<h2>Prediction record</h2>';
    if (!preds) html += '<p class="error">Couldn\'t load data/predictions.json.</p>';
    else {
      const list = preds.predictions || [];
      const cal = calibration(list);
      html += `<div class="updated">Last updated ${fmtTime(preds.updated_at)}</div>
        <div class="kpis">
          <div class="kpi"><div class="k">Win-pick accuracy</div><div class="v">${cal.graded ? pct(cal.wins / cal.graded) : '—'}</div></div>
          <div class="kpi"><div class="k">Graded</div><div class="v">${cal.wins}-${cal.graded - cal.wins}</div></div>
          <div class="kpi"><div class="k">Pending</div><div class="v">${list.filter(p => p.result === 'pending').length}</div></div>
          <div class="kpi"><div class="k">Total</div><div class="v">${list.length}</div></div>
        </div>
        <h3>Calibration</h3>
        ${cal.buckets.length ? `<div class="table-wrap"><table><tr><th>Predicted</th><th class="num">Picks</th><th class="num">Avg pred.</th><th class="num">Actual</th><th class="num">Diff</th></tr>
          ${cal.buckets.map(b => { const avg = b.probSum / b.n / 100, act = b.wins / b.n; return `<tr><td>${b.lo}–${b.lo + 5}%</td><td class="num">${b.n}</td><td class="num">${pct(avg)}</td><td class="num">${pct(act)}</td><td class="num ${sign(act - avg)}">${((act - avg) * 100).toFixed(1)} pts</td></tr>`; }).join('')}</table></div>`
          : '<div class="section-empty">No graded predictions yet. They\'re graded the morning after each slate.</div>'}
        ${list.length ? `<h3>Recent</h3><div class="table-wrap"><table><tr><th>Date</th><th>Pick</th><th class="num">Prob</th><th>Result</th></tr>
          ${list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.pick)}<div class="muted small">${esc(p.game)}</div></td><td class="num">${esc(p.win_prob)}%</td><td><span class="badge ${p.result === 'win' ? 'won' : p.result === 'loss' ? 'lost' : 'open'}">${esc(p.result)}</span></td></tr>`).join('')}</table></div>` : ''}`;
    }
    html += '<h3>Platform pricing gaps (shared log)</h3>';
    if (!log) html += '<p class="error">Couldn\'t load the shared log.</p>';
    else {
      const recs = log.records || [];
      const by = {};
      recs.forEach(r => { if (typeof r.gap === 'number') { const b = by[r.platform] || (by[r.platform] = { n: 0, sum: 0 }); b.n++; b.sum += r.gap; } });
      html += Object.keys(by).length ? `<p class="muted small">Average of quoted ÷ estimated − 1. Negative = the platform pays less than the legs multiplied out.</p>
        <div class="table-wrap"><table><tr><th>Platform</th><th class="num">Slips</th><th class="num">Avg gap</th></tr>
        ${Object.entries(by).map(([k, b]) => `<tr><td>${esc(k)}</td><td class="num">${b.n}</td><td class="num ${sign(b.sum / b.n)}">${pct(b.sum / b.n)}</td></tr>`).join('')}</table></div>
        <p class="muted small">${recs.length} shared record(s). The live site can lag a minute or two behind new commits.</p>`
        : '<div class="section-empty">No shared records yet.</div>';
    }
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------- settings

  /** Render profile editor, sharing/token management, backup, reset. */
  function renderSettings() {
    const el = $('#tab-settings');
    const p = S.getProfile(), token = S.getToken(), login = S.getLogin(), set = S.getSettings();
    const unsynced = S.getBets().filter(b => b.share && !b.shared).length;
    const c = CFG;
    el.innerHTML = `<h2>Settings</h2>
      <h3>Profile</h3>
      <form id="pf">
        <label class="field"><span>Display name</span><input id="pf-name" value="${esc(p.name)}" maxlength="40"></label>
        <div class="row">
          <label class="field"><span>Starting bankroll ($)</span><input id="pf-bank" type="number" step="0.01" value="${esc(p.startBankroll)}"></label>
          <label class="field"><span>Unit ($)</span><input id="pf-unit" type="number" step="0.01" value="${esc(p.unit)}"></label>
        </div>
        <div class="row">
          <label class="field"><span>Max per slip ($)</span><input id="pf-max" type="number" step="0.01" value="${esc(p.maxPerSlip)}"></label>
          <label class="field"><span>Window ends</span><input id="pf-end" type="date" value="${esc(p.windowEnd || '')}"></label>
        </div>
        <button class="btn btn-primary" type="submit">Save profile</button>
        <button class="btn btn-sm" type="button" id="pf-2pct">Set unit to 2% of current bankroll</button>
      </form>

      <h3>Shared calibration log</h3>
      <p class="muted small">Sharing writes <b>only</b> legs, prices, multiples, gap and result (never dollars) to
        <code>${esc(c.betLogPath)}</code> in <code>${esc(c.repoOwner)}/${esc(c.repoName)}</code>, signed as your GitHub user.
        Only repo collaborators can write. Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a>
        with access to <b>only</b> this repo and <b>Contents: Read and write</b>. It's stored only in this browser.</p>
      <p>${token ? `Token saved${login ? ` · signed in as <b>${esc(login)}</b>` : ''}.` : '<span class="error">No token — sharing disabled.</span>'}</p>
      <label class="field"><span>GitHub token</span><input id="tk" type="password" autocomplete="off" placeholder="${token ? '•••••••• (saved)' : 'github_pat_…'}"></label>
      <div class="row"><button class="btn btn-primary" id="tk-save">Save & test</button>${token ? '<button class="btn btn-danger" id="tk-del">Remove token</button>' : ''}</div>
      <label class="toggle"><input type="checkbox" id="share-def" ${set.shareByDefault ? 'checked' : ''}><span>Share new bets by default</span></label>
      ${unsynced ? `<button class="btn" id="resync">Sync ${unsynced} unsynced shared bet(s)</button>` : ''}

      <h3>Backup</h3>
      <div class="row"><button class="btn" id="exp">Export JSON</button><button class="btn" id="imp">Import JSON</button></div>
      <input type="file" id="imp-file" accept="application/json,.json" hidden>
      <p class="muted small">Backups include your profile and bets but never your token.</p>

      <h3>Danger zone</h3>
      <button class="btn btn-danger" id="reset">Reset profile & wipe this device</button>
      <p class="muted small" style="margin-top:24px">${esc(c.appName)} · ${esc(c.tagline)}</p>`;

    $('#pf').onsubmit = e => {
      e.preventDefault();
      const n = $('#pf-name').value.trim(), b = parseFloat($('#pf-bank').value), u = parseFloat($('#pf-unit').value), m = parseFloat($('#pf-max').value);
      if (!n || !(b > 0) || !(u > 0) || !(m > 0)) return toast('Fill in name, bankroll, unit and max with positive numbers.');
      S.setProfile(Object.assign({}, p, { name: n, startBankroll: b, unit: u, maxPerSlip: m, windowEnd: $('#pf-end').value || '' }));
      renderHeader(); toast('Profile saved.');
    };
    $('#pf-2pct').onclick = () => { $('#pf-unit').value = (bankrollStats().current * 0.02).toFixed(2); };
    $('#tk-save').onclick = async () => {
      const t = $('#tk').value.trim() || token;
      if (!t) return toast('Paste a token first.');
      toast('Checking token…');
      try {
        const r = await G.checkToken(t);
        S.setToken(t); S.setLogin(r.login);
        toast(r.canPush === false ? `Saved, but ${r.login} can't write to this repo — ask to be added as a collaborator.` : `Token works. Signed in as ${r.login}.`, 4500);
      } catch (e) { toast(e.message, 4000); }
      renderSettings();
    };
    if ($('#tk-del')) $('#tk-del').onclick = () => { S.setToken(''); toast('Token removed.'); renderSettings(); };
    $('#share-def').onchange = e => S.setSettings({ shareByDefault: e.target.checked });
    if ($('#resync')) $('#resync').onclick = async () => {
      for (const b of S.getBets().filter(x => x.share && !x.shared)) await syncBet(b);
      renderSettings();
    };
    wireBackup(el);
    $('#reset').onclick = () => {
      if (!confirm('Wipe your profile, bets and token from this device? Export a backup first if you want to keep them.')) return;
      S.resetAll();
      location.hash = '';
      location.reload();
    };
  }

  // ---------------------------------------------------------------- boot

  /** Entry point: brand the page, then onboarding or the app. */
  function boot() {
    applyBrand();
    document.querySelectorAll('.tabbar button').forEach(b => (b.onclick = () => go(b.dataset.go)));
    window.addEventListener('hashchange', () => { if (S.getProfile()) go(location.hash.slice(1)); });
    if (!S.getProfile()) showOnboarding(); else startApp();
  }

  // Exposed for debugging/tests only.
  window.BetDash = { computeCalc, calibration, bankrollStats, recordByCategory };
  boot();
})();
