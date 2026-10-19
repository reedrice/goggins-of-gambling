/**
 * js/app.js — UI controller: onboarding, tabs, rendering, event wiring.
 *
 * PURPOSE
 *   Renders every screen from:
 *     - window.APP_CONFIG   brand text, repo wiring, platform list (config.js)
 *     - window.STR          every user-facing string + tooltips (js/strings.js)
 *     - window.Store        private per-device data (js/storage.js)
 *     - data/*.json         shared, public, dollar-free data fetched relative
 *                           to the site (picks, predictions, bet-log, markets)
 *   Math lives in BetCalc (calc.js), logos in Teams (teams.js), the market
 *   picker in Picker (picker.js), remote writes in GitHubLog (github-log.js).
 *
 * FLOW
 *   boot() -> applyBrand() -> no profile? showOnboarding() : startApp()
 *   startApp() -> header (bankroll + "I bet on" toggle) + hash router
 *   (#picks, #calc, #bets, #record, #settings). Each render function rebuilds
 *   its own section.
 *
 * PREFERENCES (Store.getPrefs)
 *   platform     "My platform": where every Open button deep-links. The header
 *                toggle, the onboarding step and Settings all write this one
 *                localStorage value (betdash_prefs.platform).
 *   priceFormat  cents (default) | american | decimal. Display only; inputs
 *                accept any format.
 *
 * SECURITY
 *   All JSON-sourced text goes through esc() before innerHTML, and links go
 *   through safeUrl() (http/https only): picks.json is written by a job and
 *   market data comes from third-party APIs.
 */
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const STR = window.STR;
  const C = window.BetCalc;
  const S = window.Store;
  const G = window.GitHubLog;
  const T = window.Teams;

  /** Calculator platform dropdown: config order + Other. */
  const PLATFORMS = [...CFG.platforms, CFG.otherPlatform];
  /** Bet category keys (stored on bets and in the shared log). */
  const CAT_KEYS = ['single', 'prop', 'parlay', 'longshot', 'nonsports'];
  /** picks.json section key -> category used when a pick is loaded into the builder. */
  const PICK_SECTIONS = [['predictions', null], ['singles', 'single'], ['props', 'prop'], ['parlays', 'parlay'], ['longshots', 'longshot'], ['nonsports', 'nonsports']];

  let calc = freshCalc();
  let picksData = null;
  /** data/book-odds.json (other apps' prices); optional, loaded with the picks. */
  let bookOdds = null;
  /** Game predictions for the "My prediction" line: picks.sections.predictions + data/predictions.json. */
  let gamePreds = [];
  let picker = null;

  // ---------------------------------------------------------------- utils

  const $ = (sel, root = document) => root.querySelector(sel);

  /** HTML-escape any value. @param {*} v @returns {string} */
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Allow only http(s) links; adds https:// to bare hosts. @returns {string|null} */
  function safeUrl(u) {
    if (!u) return null;
    let s = String(u).trim();
    if (!/^[a-z]+:/i.test(s)) s = 'https://' + s;
    try { const url = new URL(s); return /^https?:$/.test(url.protocol) ? url.href : null; } catch (e) { return null; }
  }

  /** @param {number} n @returns {string} "$1,234.56" / "-$5.00" */
  function money(n) {
    if (typeof n !== 'number' || !isFinite(n)) return STR.none;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const pct = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? (x * 100).toFixed(d) + '%' : STR.none);
  const mult = x => (typeof x === 'number' && isFinite(x) ? x.toFixed(2) + 'x' : STR.none);
  const uid = () => 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const sign = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  /** Price (cents) in the user's chosen display format. */
  const fmtP = c => C.formatPrice(c, S.getPrefs().priceFormat);

  /** "Oct 19, 12:55 AM CDT" in America/Chicago. */
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso || STR.none);
    return d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  /** Transient message. Side effect: DOM. */
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  /** Fetch a repo data file relative to the site, bypassing caches. */
  async function fetchData(path) {
    const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }

  /**
   * Small (i) button; tapping it shows STR.tips[key] (see installTips()).
   * @param {string} key tooltip key in strings.js @returns {string} HTML
   */
  function tip(key) {
    return STR.tip(key) ? `<button type="button" class="tip" data-tip="${esc(key)}" aria-label="${esc(STR.tipButton)}">i</button>` : '';
  }

  /** One global listener for every (i) button: show/hide a small bubble. */
  function installTips() {
    const pop = $('#tip-pop');
    document.addEventListener('click', e => {
      const b = e.target.closest('.tip');
      if (!b) { pop.hidden = true; return; }
      e.preventDefault();
      e.stopPropagation();
      pop.textContent = STR.tip(b.dataset.tip);
      pop.hidden = false;
      const r = b.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 24);
      pop.style.width = w + 'px';
      pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
      pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
    }, true);
  }

  // ---------------------------------------------------------------- platforms

  /** @param {string} name platform name @returns {object} config entry or Other */
  const platformByName = name => PLATFORMS.find(p => p.name === name) || Object.assign({}, CFG.otherPlatform, { name: name || CFG.otherPlatform.name });
  /** @param {string} id @returns {object} */
  const platformById = id => PLATFORMS.find(p => p.id === id) || CFG.platforms[0];

  /** Colored platform badge. @param {string} name @returns {string} HTML */
  function platformBadge(name) {
    const p = platformByName(name);
    return `<span class="pbadge" style="background:${esc(p.color)}" title="${esc(p.name)}">${esc(p.short)}</span>`;
  }

  /** The user's chosen "My platform" config entry. */
  const myPlatform = () => platformById(S.getPrefs().platform);

  /**
   * Save "My platform" and refresh everything that shows it.
   * @param {string} id one of CFG.myPlatforms. Side effects: localStorage, DOM.
   */
  function setPlatform(id) {
    if (!CFG.myPlatforms.includes(id)) return;
    S.setPrefs({ platform: id });
    renderPlatformToggle();
    const tab = (location.hash || '#picks').slice(1);
    if (['picks', 'settings', 'calc'].includes(tab)) go(tab);
    toast(STR.platformSaved(platformById(id).name));
  }

  /** Segmented "I bet on" control HTML (shared by header + onboarding). */
  function platformToggleHtml(current, big) {
    return `<div class="seg ${big ? 'seg-big' : ''}" role="radiogroup">${CFG.myPlatforms.map(id => {
      const p = platformById(id);
      return `<button type="button" role="radio" aria-checked="${id === current}" class="${id === current ? 'on' : ''}" data-plat="${esc(id)}">${platformBadge(p.name)} ${esc(p.name)}</button>`;
    }).join('')}</div>`;
  }

  /** Render the header toggle. Side effect: DOM. */
  function renderPlatformToggle() {
    const el = $('#plat-toggle');
    if (!el) return;
    el.innerHTML = `<span class="muted small">${esc(STR.myPlatform)}</span> ${platformToggleHtml(S.getPrefs().platform)} ${tip('myPlatform')}`;
    el.querySelectorAll('[data-plat]').forEach(b => (b.onclick = () => setPlatform(b.dataset.plat)));
  }

  /**
   * Where an "Open" button should go for the user's platform.
   * @param {object} o pick/leg with polymarket_url|link, kalshi_url, kalshi_match
   * @param {string} [searchText] text for the Kalshi search fallback
   * @returns {{url:string|null, label:string, badge:string}} badge = '' or 'Not on Kalshi'
   */
  function openTarget(o, searchText) {
    const plat = myPlatform();
    if (plat.id === 'kalshi') {
      const match = o.kalshi_match || o.kalshiMatch || (o.kalshi_url || o.kalshiUrl ? 'event' : 'none');
      // fixKalshiUrl upgrades links saved before the app-deep-link fix.
      const url = safeUrl(window.Picker.fixKalshiUrl(o.kalshi_url || o.kalshiUrl));
      if (match !== 'none' && url) return { url, label: STR.picks.openPlatform('Kalshi'), badge: '' };
      return { url: window.MarketsCore.kalshiSearchUrl(searchText), label: STR.picks.openPlatform('Kalshi'), badge: STR.picks.notOnKalshi };
    }
    return { url: safeUrl(o.polymarket_url || o.link), label: STR.picks.openPlatform(plat.name), badge: '' };
  }

  /** Render an Open button (+ "Not on Kalshi" badge) for a pick/leg. */
  function openButton(o, searchText) {
    const t = openTarget(o, searchText);
    if (!t.url) return '';
    return `<a class="btn btn-sm" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.label)}</a>${t.badge ? `<span class="badge skip">${esc(t.badge)}</span>` : ''}`;
  }

  // ---------------------------------------------------------------- brand

  /** Fill [data-brand] elements + title from APP_CONFIG; tab labels from STR. */
  function applyBrand() {
    document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = CFG[el.dataset.brand] || ''; });
    document.title = `${CFG.appName} — ${CFG.tagline}`;
    const s = CFG.slogans || [];
    if (s.length) $('#slogan').textContent = s[new Date().getDate() % s.length];
    document.querySelectorAll('.tabbar [data-go]').forEach(b => { $('.tl', b).textContent = STR.tabs[b.dataset.go] || b.dataset.go; });
    $('#hdr-bank-label').textContent = STR.bankroll;
  }

  // ---------------------------------------------------------------- bankroll math

  /**
   * Derive bankroll stats from the profile + bets.
   * @returns {{current, pl, openStake, available, series:{t,v}[]}}
   *   current = start + Σ settled P/L (derived, never stored).
   */
  function bankrollStats() {
    const p = S.getProfile();
    const bets = S.getBets();
    let current = p.startBankroll;
    const series = [{ t: p.createdAt, v: current }];
    bets.filter(b => b.status !== 'open').sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)))
      .forEach(b => { current += C.profit(b.stake, b.quotedMultiple, b.status); series.push({ t: b.settledAt, v: current }); });
    const openStake = bets.filter(b => b.status === 'open').reduce((s, b) => s + b.stake, 0);
    return { current, pl: current - p.startBankroll, openStake, available: current - openStake, series };
  }

  /**
   * Won-lost-refund + return per category plus "all".
   * @returns {object} {cat: {w,l,p,staked,pl,roi}}; roi = pl / staked (settled only)
   */
  function recordByCategory() {
    const out = {};
    [...CAT_KEYS, 'all'].forEach(k => (out[k] = { w: 0, l: 0, p: 0, staked: 0, pl: 0, roi: null }));
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

  /** Header bankroll figure. */
  function renderHeader() { $('#hdr-bankroll').textContent = money(bankrollStats().current); }

  // ---------------------------------------------------------------- onboarding

  /**
   * Blocking first-run setup (all text from STR.ob). Includes the
   * "Where do you bet?" step, which writes the same prefs.platform value as
   * the header toggle and Settings.
   * Side effects: DOM; on submit writes profile + prefs to localStorage.
   */
  function showOnboarding() {
    $('#app').hidden = true;
    const wrap = $('#onboarding');
    wrap.hidden = false;
    const ob = STR.ob;
    let plat = S.getPrefs().platform;
    wrap.innerHTML = `<form id="onboarding-form" class="onboard-card" autocomplete="off" novalidate>
      <div class="onboard-brand"><h1 class="brand-name">${esc(CFG.appName)}</h1><p class="brand-tag">${esc(CFG.tagline)}</p></div>
      <p class="onboard-pitch">${esc(CFG.onboardingPitch)}</p>
      <div class="onboard-step">${esc(ob.step)}</div>
      <p class="onboard-private">${esc(ob.private)}</p>
      <label class="field"><span>${esc(ob.name)}</span><input id="ob-name" type="text" maxlength="40" placeholder="${esc(ob.namePh)}"></label>
      <label class="field big"><span>${esc(ob.bankroll)}</span><input id="ob-bankroll" type="number" inputmode="decimal" min="1" step="0.01" placeholder="${esc(ob.bankrollPh)}"></label>
      <label class="field"><span>${esc(ob.unit)} ${tip('unit')} <em>${esc(ob.unitHint)}</em></span><input id="ob-unit" type="number" inputmode="decimal" min="0.01" step="0.01"></label>
      <label class="field"><span>${esc(ob.max)} <em>${esc(ob.maxHint)}</em></span><input id="ob-max" type="number" inputmode="decimal" min="0.01" step="0.01"></label>
      <div class="field"><span>${esc(ob.platform)}</span><em class="muted small">${esc(ob.platformHint)}</em><div id="ob-plat">${platformToggleHtml(plat, true)}</div></div>
      <label class="field"><span>${esc(ob.end)} <em>${esc(ob.endHint)}</em></span><input id="ob-end" type="date"></label>
      <p id="ob-error" class="error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-xl">${esc(ob.submit)}</button>
    </form>`;
    const bank = $('#ob-bankroll'), unit = $('#ob-unit'), max = $('#ob-max');
    [unit, max].forEach(el => el.addEventListener('input', () => (el.dataset.touched = '1')));
    bank.addEventListener('input', () => {
      const b = parseFloat(bank.value);
      if (!(b > 0)) return;
      if (!unit.dataset.touched) unit.value = (b * 0.02).toFixed(2);
      if (!max.dataset.touched) max.value = (b * 0.05).toFixed(2);
    });
    const wirePlat = () => $('#ob-plat').querySelectorAll('[data-plat]').forEach(b => (b.onclick = () => {
      plat = b.dataset.plat;
      $('#ob-plat').innerHTML = platformToggleHtml(plat, true);
      wirePlat();
    }));
    wirePlat();
    setTimeout(() => $('#ob-name').focus(), 50);
    $('#onboarding-form').onsubmit = e => {
      e.preventDefault();
      const name = $('#ob-name').value.trim();
      const b = parseFloat(bank.value);
      const u = parseFloat(unit.value) || +(b * 0.02).toFixed(2);
      const m = parseFloat(max.value) || +(b * 0.05).toFixed(2);
      const err = $('#ob-error');
      if (!name) return (err.textContent = ob.errName);
      if (!(b > 0)) return (err.textContent = ob.errBankroll);
      if (!(u > 0) || u > b) return (err.textContent = ob.errUnit);
      if (!(m > 0)) return (err.textContent = ob.errMax);
      S.setProfile({ name, startBankroll: b, unit: u, maxPerSlip: m, windowEnd: $('#ob-end').value || '', createdAt: new Date().toISOString() });
      S.setPrefs({ platform: plat });
      wrap.hidden = true;
      wrap.innerHTML = '';
      startApp();
      toast(ob.done(CFG.tagline));
    };
  }

  // ---------------------------------------------------------------- router

  /** Show one tab and render it (hash-based). */
  function go(name) {
    if (!$('#tab-' + name)) name = 'picks';
    document.querySelectorAll('.tab').forEach(s => (s.hidden = s.dataset.tab !== name));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    ({ picks: renderPicks, calc: renderCalc, bets: renderBets, record: renderRecord, settings: renderSettings })[name]();
    window.scrollTo(0, 0);
  }

  /** Reveal the app; load the market index in the background (team logos). */
  function startApp() {
    $('#app').hidden = false;
    renderHeader();
    renderPlatformToggle();
    window.Picker.loadIndex().catch(() => {});
    go((location.hash || '#picks').slice(1));
  }

  // ---------------------------------------------------------------- picks

  /** "Suggested bet" text using THIS user's standard bet size. */
  function stakeText(pick) {
    const u = S.getProfile().unit;
    const lo = pick.stake_units, hi = pick.stake_units_max;
    if (!(lo > 0)) return STR.picks.skip;
    if (hi > lo) return STR.stakeRange(money(lo * u), money(hi * u), lo, hi);
    return STR.stake(money(lo * u), lo);
  }

  /** Small labelled number box. */
  const stat = (k, v, tipKey) => `<div class="stat"><div class="k">${esc(k)}${tipKey ? tip(tipKey) : ''}</div><div class="v">${v}</div></div>`;

  /** Normalise picks.json team refs ({league|sport, abbr}) for Teams.badge. */
  const teamRef = t => t && { league: String(t.league || t.sport || '').toLowerCase(), abbr: t.abbr };

  /**
   * "Other apps" line for a single-bet card: the cheapest app price for this
   * exact bet from today's data/book-odds.json rows (refs with leg null),
   * compared with Polymarket US at the same moment. '' when there's no data,
   * the feed is off, or the rows are for a different slate.
   * @param {object} pk pick
   * @returns {string} HTML
   */
  function otherAppsLine(pk) {
    const bo = bookOdds;
    if (!bo || bo.status !== 'active' || !Array.isArray(bo.comparisons) || !picksData) return '';
    const rows = bo.comparisons.filter(r => r.date === picksData.slate_date && Array.isArray(r.refs) &&
      r.refs.some(x => x.pick_id === pk.id && x.leg === null) && typeof r.book_chance === 'number');
    if (!rows.length) return '';
    const best = rows.reduce((a, b) => (b.book_chance < a.book_chance ? b : a));
    const name = (platformById(best.book) || { name: best.book }).name;
    // Show cents (or the user's format) plus the app's own American odds.
    const price = esc(fmtP(best.book_chance)) + (S.getPrefs().priceFormat === 'cents' && best.book_price ? ` (${esc(best.book_price)})` : '');
    const pm = esc(fmtP(best.polymarket_price));
    const P = STR.picks;
    const text = best.book_chance < best.polymarket_price
      ? P.otherCheaper(esc(name), price, esc(String(Math.round((best.polymarket_price - best.book_chance) * 10) / 10)), pm)
      : P.otherNone(pm, esc(name), price);
    return `<div class="other-apps small">${text} <span class="muted">${esc(P.otherAsOf(fmtTime(best.fetched_at)))}</span> ${tip('otherApps')}</div>`;
  }

  /** Color legend for the risk labels, shown once above the picks. */
  function riskLegend() {
    const E = STR.eval;
    return `<div class="risk-legend small"><span class="muted">${esc(E.legendTitle)}</span>
      ${window.PickEval.RISK_KEYS.map(k => `<span class="risk risk-${k}">${esc(E.risk[k])} <span class="rl">${esc(E.legend[k])}</span></span>`).join('')}</div>`;
  }

  /**
   * "My hit chance" bar + risk label + "My take" + "My prediction" block.
   * Values come from picks.json when the daily job set them, otherwise
   * PickEval computes them (see js/evaluate.js for the rules + thresholds).
   * @param {object} pk @param {string} sec section key (singles, parlays, ...)
   * @returns {string} HTML
   */
  function evalBlock(pk, sec) {
    const E = STR.eval;
    const ev = window.PickEval.evaluate(pk, sec, STR);
    const pctTxt = ev.pct === null ? STR.none : (Math.round(ev.pct * 10) / 10) + '%';
    const width = ev.pct === null ? 0 : Math.max(2, Math.min(100, ev.pct));   // numeric only, safe in style
    const note = ev.sameGame === true ? (ev.source === 'given' ? E.sameGameGiven : E.sameGameLegs) : ev.sameGame === false ? E.diffGames : '';
    const preds = window.PickEval.findPredictions(pk, gamePreds, picksData && picksData.slate_date);
    return `<div class="eval">
      <div class="eval-top">
        <span class="eval-k">${esc(E.hitChance)} ${tip('hitChance')}</span>
        <b class="eval-pct">${esc(pctTxt)}</b>
        ${ev.risk ? `<span class="risk risk-${esc(ev.risk)}">${esc(E.risk[ev.risk] || ev.risk)}</span>${tip('risk')}` : ''}
      </div>
      <div class="hitbar" role="img" aria-label="${esc(E.hitChance + ' ' + pctTxt)}"><span class="risk-bg-${esc(ev.risk || 'none')}" style="width:${width}%"></span></div>
      ${note ? `<div class="eval-note small muted">${esc(note)}</div>` : ''}
      <div class="take"><b>${esc(E.take)}</b> ${esc(ev.verdict)} ${tip('take')}</div>
      ${preds.map(g => `<div class="pred small">🔮 ${esc(E.prediction(g.pick, g.projected_score, g.win_prob))}</div>`).join('')}
    </div>`;
  }

  /** One pick card. @param {object} pk @param {string} cat category @param {string} sec section key */
  function pickCard(pk, cat, sec) {
    const P = STR.picks;
    const isMulti = Array.isArray(pk.legs) && pk.legs.length > 0;
    const action = pk.action || (pk.stake_units > 0 ? 'bet' : 'skip');
    const edge = typeof pk.edge === 'number' ? pk.edge : (typeof pk.fair === 'number' && typeof pk.price === 'number' ? C.edgePts(pk.fair, pk.price) : null);
    const stats = isMulti
      ? stat(P.ourPayout, mult(pk.est_multiple), 'ourPayout') + stat(P.appPayout, pk.quoted_multiple ? mult(pk.quoted_multiple) : STR.none, 'payout') +
        stat(P.skipBelow, pk.skip_below ? mult(pk.skip_below) : STR.none, 'skipBelow')   // hit chance moved to evalBlock
      : stat(P.price, typeof pk.price === 'number' ? esc(fmtP(pk.price)) : STR.none, 'price') + stat(P.fair, typeof pk.fair === 'number' ? esc(fmtP(pk.fair)) : STR.none, 'fair') +
        stat(P.advantage, edge === null ? STR.none : `<span class="${sign(edge)}">${edge > 0 ? '+' : ''}${edge.toFixed(1)}¢</span>`, 'advantage') +
        stat(P.payout, typeof pk.price === 'number' ? mult(100 / pk.price) : STR.none, 'payout');
    const teams = (pk.teams || []).map(teamRef);
    return `<div class="card ${action === 'skip' ? 'skip' : ''}">
      <div class="pick-head">
        <div class="pick-id">${teams.length ? `<span class="logos">${T.badges(teams, 30)}</span>` : ''}<div>
          <div class="pick-title">${esc(pk.side || pk.market)}</div>
          <div class="pick-sub">${esc(pk.market && pk.side ? pk.market + ' · ' : '')}${esc(pk.event || '')}</div>
        </div></div>
        <span class="badge ${esc(action)}">${esc(P.badge[action] || action)}</span>
      </div>
      ${evalBlock(pk, sec || 'singles')}
      <div class="pick-stats">${stats}</div>
      ${!isMulti && typeof pk.kalshi_price === 'number' ? `<div class="muted small">${esc(P.kalshiPrice(fmtP(pk.kalshi_price)))}</div>` : ''}
      ${isMulti ? '' : otherAppsLine(pk)}
      ${isMulti ? `<ul class="legs">${pk.legs.map(l => `<li>${l.team ? T.badge(teamRef(l.team), 20) : ''}<span>${esc(l.desc)}${typeof l.price === 'number' ? ` <span class="muted">${esc(fmtP(l.price))}</span>` : ''}${typeof l.kalshi_price === 'number' ? ` <span class="kpx">Kalshi ${esc(fmtP(l.kalshi_price))}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
      <div><b>${esc(P.bet)}:</b> ${esc(stakeText(pk))} ${tip('unit')}</div>
      ${pk.pending_news ? `<div class="news">⏳ <b>${esc(P.news)}</b> ${esc(pk.pending_news)}</div>` : ''}
      ${pk.verify_note ? `<div class="verify">⚠️ ${esc(pk.verify_note)}</div>` : ''}
      ${pk.reasoning ? `<div class="reason">${esc(pk.reasoning)}</div>` : ''}
      <div class="pick-actions">
        ${openButton(pk, pk.side || pk.event)}
        <button class="btn btn-sm btn-primary" data-load-pick="${esc(pk.id)}" data-cat="${esc(cat)}">${esc(P.toCalc)}</button>
      </div>
    </div>`;
  }

  /** "Who we think wins" card. */
  function predictionCard(g) {
    return `<div class="card">
      <div class="pick-title">${esc(g.pick)} ${typeof g.win_prob === 'number' ? `<span class="muted">${esc(g.win_prob)}% ${tip('chance')}</span>` : ''}</div>
      <div class="pick-sub">${esc(g.game || '')}${g.sport ? ' · ' + esc(g.sport) : ''}${g.start_time ? ' · ' + esc(fmtTime(g.start_time)) : ''}</div>
      ${g.projected_score ? `<div>${esc(STR.picks.projected)} <b>${esc(g.projected_score)}</b></div>` : ''}
      ${Array.isArray(g.player_projections) && g.player_projections.length ? `<ul class="legs">${g.player_projections.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${g.reasoning ? `<div class="reason">${esc(g.reasoning)}</div>` : ''}
    </div>`;
  }

  /** Fetch + render data/picks.json. Waits briefly for team logos. */
  async function renderPicks() {
    const el = $('#tab-picks');
    el.innerHTML = `<h2>${esc(STR.picks.title)}</h2><p class="muted">${esc(STR.loading)}</p>`;
    let predFile = null;
    try {
      [picksData, bookOdds, predFile] = await Promise.all([
        fetchData('data/picks.json'),
        fetchData(CFG.bookOddsPath || 'data/book-odds.json').catch(() => null),   // optional
        fetchData('data/predictions.json').catch(() => null),                     // optional
        Promise.race([window.Picker.loadIndex().catch(() => {}), new Promise(r => setTimeout(r, 1500))])
      ]);
    } catch (e) {
      el.innerHTML = `<h2>${esc(STR.picks.title)}</h2><p class="error">${esc(STR.picks.loadError)}</p>`;
      return;
    }
    const d = picksData, sec = d.sections || {};
    gamePreds = [...(sec.predictions || []), ...((predFile && predFile.predictions) || [])];
    let html = `<h2>${esc(STR.picks.title)}</h2>
      <div class="updated">${esc(STR.picks.updated(d.slate_date || '', fmtTime(d.updated_at)))}</div>
      ${(d.notes || []).map(n => `<div class="verify">${esc(n)}</div>`).join('')}
      ${riskLegend()}`;
    for (const [key, cat] of PICK_SECTIONS) {
      const items = sec[key] || [];
      html += `<h3>${esc(STR.picks.sections[key])}</h3>`;
      if (!items.length) { html += `<div class="section-empty">${esc(STR.picks.empty)}</div>`; continue; }
      html += items.map(it => (key === 'predictions' ? predictionCard(it) : pickCard(it, cat, key))).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-load-pick]').forEach(b => (b.onclick = () => loadPickIntoCalc(b.dataset.loadPick, b.dataset.cat)));
  }

  /**
   * Turn a pick (or one of its legs) into a builder leg.
   * @param {object} o pick or leg @param {object} pk parent pick @param {string} fallbackDesc
   */
  function pickToLeg(o, pk, fallbackDesc) {
    const fromUS = o.market_id || /polymarket\.us/.test(o.polymarket_url || pk.polymarket_url || '');
    const platform = fromUS ? 'Polymarket US' : (PLATFORMS.find(p => p.name === pk.platform) ? pk.platform : 'Other');
    const slug = (/polymarket\.(?:us|com)\/(?:sports\/[a-z0-9]+|event)\/([a-z0-9-]+)/.exec(o.polymarket_url || pk.polymarket_url || pk.link || '') || [])[1] || null;
    return {
      desc: o.desc || fallbackDesc, platform, price: o.price === undefined || o.price === null ? '' : String(o.price),
      link: o.polymarket_url || pk.polymarket_url || pk.link, kalshiUrl: o.kalshi_url || pk.kalshi_url || null,
      kalshiMatch: o.kalshi_match || pk.kalshi_match || null, kalshiPrice: typeof o.kalshi_price === 'number' ? o.kalshi_price : null,
      marketId: o.market_id || null, side: o.market_side || null, eventSlug: slug, eventTitle: pk.event || '',
      teams: o.team ? [teamRef(o.team)] : (pk.teams || []).map(teamRef), asOf: picksData.updated_at, live: false
    };
  }

  /** Prefill the builder from a pick and switch tabs. */
  function loadPickIntoCalc(id, cat) {
    let pk = null;
    Object.values(picksData.sections || {}).forEach(list => (list || []).forEach(p => { if (p.id === id) pk = p; }));
    if (!pk) return;
    const legs = Array.isArray(pk.legs) && pk.legs.length
      ? pk.legs.map(l => pickToLeg(l, pk, l.desc))
      : [pickToLeg(pk, pk, [pk.side || pk.market].filter(Boolean).join(''))];
    const unit = S.getProfile().unit;
    calc = Object.assign(freshCalc(), {
      legs, category: cat, catTouched: true, pickId: pk.id,
      quoted: pk.quoted_multiple ? String(pk.quoted_multiple) : (legs.length === 1 && pk.price ? (100 / pk.price).toFixed(2) : ''),
      stake: pk.stake_units > 0 ? (pk.stake_units * unit).toFixed(2) : ''
    });
    go('calc');
    toast(STR.picks.loaded);
    refreshLivePrices(true);
  }

  // ---------------------------------------------------------------- bet builder

  /** @returns {object} empty builder state */
  function freshCalc() {
    return { legs: [], category: 'single', catTouched: false, quoted: '', stake: '', myHit: '', pickId: null, share: null };
  }

  /**
   * All derived builder numbers. Pure.
   * @returns {{parsed, ok, est, hit, quoted, stake, evHit, gap, ev, ev10, payout}}
   *   est = Π 1/p (our payout estimate if picks are unrelated); hit = Π p;
   *   gap = quoted/est - 1; ev = stake*(quoted*evHit - 1); ev10 = same for $10.
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
      parsed, ok, est: pl ? pl.estMultiple : null, hit: pl ? pl.hitChance : null, quoted, stake, evHit,
      gap: pl && quoted ? C.gap(quoted, pl.estMultiple) : null,
      ev: stake && quoted && evHit ? C.expectedValue(stake, quoted, evHit) : null,
      ev10: quoted && evHit ? C.expectedValue(10, quoted, evHit) : null,
      payout: stake && quoted ? stake * quoted : null
    };
  }

  /** Build the builder tab: picker (once) + slip + numbers. */
  function renderCalc() {
    const el = $('#tab-calc');
    const K = STR.calc;
    const share = calc.share === null ? S.getSettings().shareByDefault : calc.share;
    const hasToken = !!S.getToken();
    el.innerHTML = `<h2>${esc(K.title)}</h2>
      <div id="picker-root"></div>
      <div class="slip-head"><h3>${esc(K.slip)}</h3><span id="slip-asof" class="muted small"></span></div>
      <div id="slip"></div>
      <div class="row"><button class="btn" id="add-manual">${esc(K.manual)}</button><button class="btn" id="refresh-px">${esc(K.refresh)}</button></div>
      <div class="calc-out" id="calc-out"></div>
      <label class="field"><span>${esc(K.category)}</span>
        <select id="c-cat">${CAT_KEYS.map(k => `<option value="${k}" ${k === calc.category ? 'selected' : ''}>${esc(STR.categories[k])}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>${esc(K.quoted)} ${tip('quoted')}</span><input id="c-quoted" inputmode="decimal" placeholder="${esc(K.quotedPh)}" value="${esc(calc.quoted)}"></label>
        <label class="field"><span>${esc(K.stakeLabel)}</span><input id="c-stake" inputmode="decimal" placeholder="${esc((S.getProfile().unit).toFixed(2))}" value="${esc(calc.stake)}"></label>
      </div>
      <label class="field"><span>${esc(K.myChance)} ${tip('myChance')} <em>${esc(K.myChanceHint)}</em></span><input id="c-my" inputmode="decimal" placeholder="${esc(K.myChancePh)}" value="${esc(calc.myHit)}"></label>
      <div id="calc-out2" class="calc-out"></div>
      <label class="toggle"><input type="checkbox" id="c-share" ${share && hasToken ? 'checked' : ''} ${hasToken ? '' : 'disabled'}><span>${esc(K.share)} ${tip('share')}</span></label>
      ${hasToken ? '' : `<p class="muted small">${esc(K.shareOff)}</p>`}
      <p id="c-warn" class="error"></p>
      <button class="btn btn-primary btn-xl" id="c-save">${esc(K.saveBet)}</button>
      <button class="btn btn-sm" id="c-clear" style="margin-top:10px">${esc(K.clear)}</button>`;
    picker = window.Picker.create($('#picker-root'), { onAdd: addPickedLeg, fmt: fmtP });
    $('#add-manual').onclick = () => {
      calc.legs.push({ desc: '', platform: myPlatform().name, price: '', manual: true });
      renderSlip();
      const inputs = document.querySelectorAll('#slip .l-desc');
      if (inputs.length) inputs[inputs.length - 1].focus();
    };
    $('#refresh-px').onclick = () => refreshLivePrices(false);
    $('#c-cat').onchange = e => { calc.category = e.target.value; calc.catTouched = true; };
    $('#c-quoted').oninput = e => { calc.quoted = e.target.value; updateCalcOut(); };
    $('#c-stake').oninput = e => { calc.stake = e.target.value; updateCalcOut(); };
    $('#c-my').oninput = e => { calc.myHit = e.target.value; updateCalcOut(); };
    $('#c-share').onchange = e => (calc.share = e.target.checked);
    $('#c-save').onclick = saveCalcBet;
    $('#c-clear').onclick = () => { calc = freshCalc(); renderCalc(); };
    renderSlip();
  }

  /** Picker callback: add a leg, then fetch its live price. */
  function addPickedLeg(leg) {
    calc.legs.push(leg);
    autoCategory();
    renderSlip();
    toast(STR.calc.added(leg.desc));
    if (leg.marketId) {
      window.Picker.livePrice(leg.marketId, leg.side).then(c => {
        if (c == null || !calc.legs.includes(leg)) return;
        leg.price = Number.isInteger(c) ? String(c) : c + 'c';
        leg.asOf = new Date().toISOString();
        leg.live = true;
        renderSlip();
      }).catch(() => {});
    }
  }

  /** 1 pick = single (or player bet), 2+ = combo, unless the user chose a type. */
  function autoCategory() {
    if (calc.catTouched) return;
    calc.category = calc.legs.length > 1 ? 'parlay' : (calc.legs[0] && /—/.test(calc.legs[0].desc) && calc.legs[0].teams && calc.legs[0].teams.length === 1 ? 'prop' : 'single');
    const sel = $('#c-cat');
    if (sel) sel.value = calc.category;
  }

  /**
   * Re-fetch live Polymarket US prices for every picker leg.
   * @param {boolean} quiet no toast
   */
  async function refreshLivePrices(quiet) {
    const legs = calc.legs.filter(l => l.marketId && l.side);
    if (!legs.length) return;
    let ok = 0;
    await Promise.all(legs.map(async l => {
      try {
        const c = await window.Picker.livePrice(l.marketId, l.side);
        if (c != null) { l.price = Number.isInteger(c) ? String(c) : c + 'c'; l.asOf = new Date().toISOString(); l.live = true; ok++; }
      } catch (e) { /* keep old price */ }
    }));
    if ($('#slip')) renderSlip();
    if (!quiet) toast(ok ? STR.calc.refreshed : STR.calc.refreshFail);
  }

  /** Render the slip legs (logos, remove ×, related flags, as-of). */
  function renderSlip() {
    const wrap = $('#slip');
    if (!wrap) return;
    const K = STR.calc;
    const counts = {};
    calc.legs.forEach(l => { if (l.eventSlug) counts[l.eventSlug] = (counts[l.eventSlug] || 0) + 1; });
    if (!calc.legs.length) wrap.innerHTML = `<div class="section-empty">${esc(K.slipEmpty)}</div>`;
    else wrap.innerHTML = calc.legs.map((l, i) => {
      const related = l.eventSlug && counts[l.eventSlug] > 1;
      const known = PLATFORMS.some(p => p.name === l.platform);
      return `<div class="leg ${related ? 'related' : ''}" data-i="${i}">
        <button class="btn btn-sm btn-danger remove" data-rm="${i}" aria-label="${esc(K.remove)}">✕</button>
        <div class="leg-top">${l.teams && l.teams.length ? `<span class="logos">${T.badges(l.teams, 28)}</span>` : platformBadge(l.platform)}
          ${l.manual ? `<input class="l-desc" placeholder="${esc(K.legDescPh)}" value="${esc(l.desc)}" aria-label="${esc(K.legDesc)}">` : `<div class="leg-desc"><b>${esc(l.desc)}</b>${l.eventTitle ? `<div class="muted small">${esc(l.eventTitle)}</div>` : ''}</div>`}
        </div>
        <div class="leg-grid">
          <select class="l-plat" aria-label="${esc(K.legPlatform)}">${known ? '' : `<option selected>${esc(l.platform)}</option>`}${PLATFORMS.map(p => `<option ${p.name === l.platform ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <input class="l-price" inputmode="text" placeholder="${esc(K.legPricePh)}" value="${esc(l.price)}" aria-label="${esc(K.legPrice)}">
        </div>
        <div class="leg-hint"></div>
        ${typeof l.kalshiPrice === 'number' ? `<div class="kpx">Kalshi ${esc(fmtP(l.kalshiPrice))}</div>` : ''}
        ${related ? `<div class="related-flag">⚠️ ${esc(K.related)} ${tip('related')}</div>` : ''}
      </div>`;
    }).join('') + `<p class="muted small">${esc(K.priceHint)}</p>`;
    wrap.querySelectorAll('.leg').forEach(div => {
      const i = +div.dataset.i;
      const d = $('.l-desc', div);
      if (d) d.oninput = e => (calc.legs[i].desc = e.target.value);
      $('.l-plat', div).onchange = e => (calc.legs[i].platform = e.target.value);
      $('.l-price', div).oninput = e => { calc.legs[i].price = e.target.value; calc.legs[i].live = false; updateCalcOut(); };
    });
    wrap.querySelectorAll('[data-rm]').forEach(b => (b.onclick = () => { calc.legs.splice(+b.dataset.rm, 1); autoCategory(); renderSlip(); }));
    // "Prices as of": oldest timestamp among picker legs.
    const times = calc.legs.filter(l => l.asOf).map(l => l.asOf).sort();
    const allLive = calc.legs.filter(l => l.asOf).every(l => l.live);
    $('#slip-asof').textContent = times.length ? (allLive ? K.livePrices(fmtTime(times[0])) : K.pricesAsOf(fmtTime(times[0]))) : '';
    updateCalcOut();
  }

  /** Refresh computed numbers + per-leg price hints. */
  function updateCalcOut() {
    const K = STR.calc;
    const r = computeCalc(calc);
    document.querySelectorAll('#slip .leg').forEach((div, i) => {
      const h = $('.leg-hint', div);
      const l = calc.legs[i];
      const ok = r.parsed[i];
      h.textContent = l.price ? (ok ? `${fmtP(ok.p * 100)} · ${(1 / ok.p).toFixed(2)}x` : K.cantRead) : '';
      h.className = 'leg-hint' + (l.price && !ok ? ' error' : '');
    });
    const kpi = (k, v, cls = '', tipKey = '') => `<div class="kpi"><div class="k">${esc(k)} ${tipKey ? tip(tipKey) : ''}</div><div class="v ${cls}">${v}</div></div>`;
    if (!$('#calc-out')) return;
    $('#calc-out').innerHTML = kpi(K.outPayout, mult(r.est), '', 'ourPayout') + kpi(K.outChance, pct(r.hit), '', 'chance');
    const unit = S.getProfile().unit;
    $('#calc-out2').innerHTML =
      kpi(K.outGap, r.gap === null ? STR.none : (r.gap > 0 ? '+' : '') + pct(r.gap, 1), sign(r.gap), 'gap') +
      kpi(K.outProfit, r.ev10 === null ? STR.none : money(r.ev10), sign(r.ev10), 'profit') +
      kpi(K.outReturn, money(r.payout)) +
      kpi(K.outSize, r.stake ? `${money(r.stake)} <span class="small muted">(${esc(STR.unitWords(+(r.stake / unit).toFixed(2)))})</span>` : STR.none, '', 'unit');
    const w = $('#c-warn');
    if (w) w.textContent = r.stake && r.stake > S.getProfile().maxPerSlip ? K.overMax(money(S.getProfile().maxPerSlip)) : '';
  }

  /** Validate and save as an open bet; optionally share. */
  async function saveCalcBet() {
    const K = STR.calc;
    const r = computeCalc(calc);
    if (!r.ok) return toast(K.errLegs);
    if (!r.quoted) return toast(K.errQuoted);
    if (!r.stake) return toast(K.errStake);
    if (r.stake > S.getProfile().maxPerSlip && !confirm(K.overMaxConfirm(money(S.getProfile().maxPerSlip)))) return;
    const share = !!S.getToken() && (calc.share === null ? S.getSettings().shareByDefault : calc.share);
    const bet = {
      id: uid(), createdAt: new Date().toISOString(), settledAt: null,
      category: calc.category, platform: [...new Set(calc.legs.map(l => l.platform))].join(' + '),
      legs: calc.legs.map((l, i) => ({
        desc: l.desc || `Pick ${i + 1}`, price: l.price, platform: l.platform, p: r.parsed[i].p,
        marketId: l.marketId || null, side: l.side || null, eventSlug: l.eventSlug || null, eventTitle: l.eventTitle || null,
        teams: l.teams || [], link: l.link || null, kalshiUrl: l.kalshiUrl || null, asOf: l.asOf || null
      })),
      estMultiple: r.est, quotedMultiple: r.quoted, hitChance: r.hit, stake: r.stake,
      status: 'open', share, shared: false, pickId: calc.pickId
    };
    S.upsertBet(bet);
    calc = freshCalc();
    renderHeader();
    toast(K.saved);
    go('bets');
    if (share) await syncBet(bet);
  }

  /** Push a bet's dollar-free record to the shared log. @returns {Promise<boolean>} */
  async function syncBet(bet) {
    const token = S.getToken();
    if (!token) return false;
    try {
      let login = S.getLogin();
      if (!login) { login = await G.whoAmI(token); S.setLogin(login); }
      await G.upsertRecord(G.buildRecord(bet, login), token);
      S.upsertBet(Object.assign({}, bet, { shared: true, syncedStatus: bet.status }));
      toast(STR.calc.shared);
      return true;
    } catch (e) {
      S.upsertBet(Object.assign({}, bet, { shared: false }));
      toast(STR.calc.shareFail(e.message), 4500);
      return false;
    }
  }

  // ---------------------------------------------------------------- my bets

  /** Bankroll-over-time line on a canvas (HiDPI aware). */
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
    ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad, y(series[0].v)); ctx.lineTo(w - pad, y(series[0].v)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2.5; ctx.beginPath();
    series.forEach((s, i) => (i ? ctx.lineTo(x(i), y(s.v)) : ctx.moveTo(x(i), y(s.v))));
    ctx.stroke();
    ctx.fillStyle = '#ff5a1f';
    series.forEach((s, i) => { ctx.beginPath(); ctx.arc(x(i), y(s.v), 3, 0, 7); ctx.fill(); });
    ctx.fillStyle = '#9a9aa2'; ctx.font = '11px sans-serif';
    ctx.fillText(money(hi), 4, 14); ctx.fillText(money(lo), 4, h - 6);
  }

  /** Legs of a saved bet with logos. */
  function legsHtml(b) {
    return b.legs.map(l => `<span class="bleg">${l.teams && l.teams.length ? T.badges(l.teams, 20) : platformBadge(l.platform)} ${esc(l.desc)}</span>`).join('');
  }

  /** My bets tab. */
  function renderBets() {
    const B = STR.bets;
    const el = $('#tab-bets');
    const p = S.getProfile(), st = bankrollStats(), rec = recordByCategory();
    const bets = S.getBets();
    const open = bets.filter(b => b.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const settled = bets.filter(b => b.status !== 'open').sort((a, b) => String(b.settledAt).localeCompare(String(a.settledAt)));
    const kpi = (k, v, cls = '', tipKey = '') => `<div class="kpi"><div class="k">${esc(k)} ${tipKey ? tip(tipKey) : ''}</div><div class="v ${cls}">${v}</div></div>`;
    el.innerHTML = `<h2>${esc(B.title(p.name))}</h2>
      <p class="muted small">${esc(B.privateNote(money(p.unit), money(p.maxPerSlip)))}${p.windowEnd ? esc(B.windowEnds(p.windowEnd)) : ''}</p>
      <div class="kpis">${kpi(B.now, money(st.current))}${kpi(B.pl, money(st.pl), sign(st.pl))}${kpi(B.open, money(st.openStake))}${kpi(B.roi, pct(rec.all.roi, 1), sign(rec.all.roi), 'roi')}</div>
      <h3>${esc(B.chart)}</h3>
      <canvas class="chart" id="bk-chart"></canvas>
      <h3>${esc(B.openTitle(open.length))}</h3>
      ${open.length ? open.map(b => `<div class="card">
        <div class="pick-head"><div><div class="bet-legs">${legsHtml(b)}</div>
        <div class="pick-sub">${platformBadge(b.platform.split(' + ')[0])} ${esc(STR.categories[b.category] || b.category)} · ${esc(b.platform)} · ${fmtTime(b.createdAt)}${b.share ? (b.shared ? B.shared : B.sharePending) : ''}</div></div>
        <span class="badge open">${esc(B.status.open)}</span></div>
        <div class="pick-stats">
          ${stat(B.amount, money(b.stake))}${stat(B.appPays, mult(b.quotedMultiple), 'payout')}${stat(B.ourEst, mult(b.estMultiple), 'ourPayout')}${stat(B.toWin, `<span class="pos">${money(b.stake * b.quotedMultiple)}</span>`)}
        </div>
        <div class="pick-actions">
          <button class="btn btn-sm btn-primary" data-settle="won" data-id="${b.id}">${esc(B.won)}</button>
          <button class="btn btn-sm btn-danger" data-settle="lost" data-id="${b.id}">${esc(B.lost)}</button>
          <button class="btn btn-sm" data-settle="push" data-id="${b.id}">${esc(B.push)}</button>
          <button class="btn btn-sm" data-del="${b.id}">${esc(B.del)}</button>
        </div></div>`).join('') : `<div class="section-empty">${esc(B.openEmpty)}</div>`}
      <h3>${esc(B.settledTitle)}</h3>
      ${settled.length ? `<div class="table-wrap"><table><tr><th>${esc(B.bet)}</th><th>${esc(B.result)}</th><th class="num">${esc(B.amount)}</th><th class="num">${esc(B.plCol)}</th><th></th></tr>
        ${settled.map(b => { const pl = C.profit(b.stake, b.quotedMultiple, b.status); return `<tr><td><div class="bet-legs">${legsHtml(b)}</div><div class="muted small">${esc(STR.categories[b.category] || '')} · ${mult(b.quotedMultiple)}</div></td>
        <td><span class="badge ${b.status}">${esc(B.status[b.status])}</span></td><td class="num">${money(b.stake)}</td><td class="num ${sign(pl)}">${money(pl)}</td>
        <td><button class="btn btn-sm" data-reopen="${b.id}" aria-label="${esc(B.reopen)}">↺</button></td></tr>`; }).join('')}</table></div>` : `<div class="section-empty">${esc(B.settledEmpty)}</div>`}
      <h3>${esc(B.recordTitle)}</h3>
      <div class="table-wrap"><table><tr><th>${esc(B.type)}</th><th>${esc(B.wlp)}</th><th class="num">${esc(B.pl)}</th><th class="num">${esc(B.roi)} ${tip('roi')}</th></tr>
        ${[...CAT_KEYS, 'all'].map(k => { const r = rec[k]; return `<tr><td>${k === 'all' ? `<b>${esc(B.all)}</b>` : esc(STR.categories[k])}</td><td>${r.w}-${r.l}-${r.p}</td>
        <td class="num ${sign(r.pl)}">${money(r.pl)}</td><td class="num ${sign(r.roi)}">${pct(r.roi, 1)}</td></tr>`; }).join('')}</table></div>
      <h3>${esc(B.backup)}</h3>
      <div class="row"><button class="btn" id="exp">${esc(B.export)}</button><button class="btn" id="imp">${esc(B.import)}</button></div>
      <input type="file" id="imp-file" accept="application/json,.json" hidden>`;
    drawChart($('#bk-chart'), st.series);
    el.querySelectorAll('[data-settle]').forEach(b => (b.onclick = () => settleBet(b.dataset.id, b.dataset.settle)));
    el.querySelectorAll('[data-reopen]').forEach(b => (b.onclick = () => settleBet(b.dataset.reopen, 'open')));
    el.querySelectorAll('[data-del]').forEach(b => (b.onclick = () => {
      if (confirm(B.delConfirm)) { S.deleteBet(b.dataset.del); renderHeader(); renderBets(); }
    }));
    wireBackup(el);
  }

  /** Change status, update bankroll, re-share if it was shared. */
  async function settleBet(id, status) {
    const bet = S.getBets().find(b => b.id === id);
    if (!bet) return;
    const upd = Object.assign({}, bet, { status, settledAt: status === 'open' ? null : new Date().toISOString(), shared: false });
    S.upsertBet(upd);
    renderHeader();
    renderBets();
    if (upd.share && S.getToken()) { await syncBet(upd); renderBets(); }
  }

  /** Export / import buttons inside a container. */
  function wireBackup(root) {
    const B = STR.bets;
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
        if (!confirm(B.importConfirm)) return;
        S.importAll(data);
        toast(B.restored);
        startApp();
      } catch (err) { toast(B.importFail(err.message), 4000); }
    };
  }

  // ---------------------------------------------------------------- record

  /**
   * Accuracy + 5-point calibration buckets (floor(win_prob/5)*5).
   * @param {object[]} preds @returns {{graded, wins, buckets}}
   */
  function calibration(preds) {
    const graded = preds.filter(p => p.result === 'win' || p.result === 'loss');
    const map = {};
    graded.forEach(p => {
      const lo = Math.min(95, Math.floor(p.win_prob / 5) * 5);
      const b = map[lo] || (map[lo] = { lo, n: 0, wins: 0, probSum: 0 });
      b.n++; b.probSum += p.win_prob; if (p.result === 'win') b.wins++;
    });
    return { graded: graded.length, wins: graded.filter(p => p.result === 'win').length, buckets: Object.values(map).sort((a, b) => a.lo - b.lo) };
  }

  /**
   * "How each app's prices compare" (Record tab). One block per platform in
   * APP_CONFIG.platforms order. Five cells, ONE value each (dash = no data):
   *   Bets you logged | Paid vs. our estimate | From odds feed |
   *   Price vs. Polymarket | Total
   * (Owner feedback: don't stack the % under the count.) Details:
   *   1. Bets you logged: shared bet-log records (count + average payout gap
   *      vs. our multiplied estimate)
   *   2. From odds feed: data/book-odds.json comparisons (count + average
   *      cents difference vs. Polymarket US). Until the feed is switched on
   *      (status !== 'active') every row says "Coming soon, waiting on odds
   *      feed". Polymarket US is the baseline; platforms with oddsApi:null
   *      (bet365) say "Not in the odds feed".
   *   3. Total: both counts added.
   * Laid out as a 5-column grid under each app name (CSS .pc-*) so it fits a
   * 390px phone without sideways scrolling. Feed status notes ("Needs a paid
   * odds plan", "Coming soon…") go next to the app name, not in a cell. Numbers come from BetCalc.platformSummary.
   * @param {object|null} log data/bet-log.json @param {object|null} odds data/book-odds.json
   * @returns {string} HTML
   */
  function renderPlatformCompare(log, odds) {
    const R = STR.record;
    let html = `<h3>${esc(R.platTitle)}</h3><p class="muted small">${esc(R.platNote)}</p>`;
    if (!log) html += `<p class="error">${esc(R.logError)}</p>`;
    const recs = (log && log.records) || [];
    const feedOn = !!(odds && odds.status === 'active');
    const sum = C.platformSummary(recs, feedOn ? odds.comparisons : [], CFG.platforms);
    // One value per cell; a dash when there's nothing yet. Feed status notes
    // (baseline / paid plan / not in feed / coming soon) sit under the app name.
    const dash = `<span class="muted">${esc(R.dash)}</span>`;
    const gapCell = l => (l.n ? `<span class="${sign(l.avgGap)}">${esc(pct(l.avgGap, 1))}</span>` : dash);
    const diffCell = f => {
      if (!f.n) return dash;
      const d = Math.round(f.avgDiff * 10) / 10;
      // app costs MORE than Polymarket = you win less = red
      return `<span class="${d > 0 ? 'neg' : d < 0 ? 'pos' : ''}">${d > 0 ? '+' : d < 0 ? '−' : ''}${esc(String(Math.abs(d)))}¢</span>`;
    };
    const feedNote = (p, f) => {
      if (p.id === (odds && odds.baseline || 'polymarket_us')) return R.feedBaseline;
      if (!p.oddsApi) return R.feedMissing;
      if (!feedOn) return R.feedSoon;
      if (!f.n && p.oddsApiPaid) return R.feedPaid;
      return '';
    };
    const block = (p, row) => {
      const note = feedNote(p, row.feed);
      return `
      <div class="pc-row">
        <div class="pc-name">${platformBadge(p.name)} <span>${esc(p.name)}</span>${note ? `<span class="pc-note muted">${esc(note)}</span>` : ''}</div>
        <div class="pc-cells">
          <div class="pc-cell">${row.logged.n ? `<b>${row.logged.n}</b>` : dash}</div>
          <div class="pc-cell">${gapCell(row.logged)}</div>
          <div class="pc-cell">${row.feed.n ? `<b>${row.feed.n}</b>` : dash}</div>
          <div class="pc-cell">${diffCell(row.feed)}</div>
          <div class="pc-cell pc-total"><b>${row.total}</b></div>
        </div>
      </div>`;
    };
    html += `<div class="pc">
      <div class="pc-head">
        <span>${esc(R.colLogged)} ${tip('colLogged')}</span>
        <span>${esc(R.colGap)} ${tip('colGap')}</span>
        <span>${esc(R.colFeed)} ${tip('colFeed')}</span>
        <span>${esc(R.colDiff)} ${tip('colDiff')}</span>
        <span>${esc(R.colTotal)} ${tip('colTotal')}</span>
      </div>
      ${CFG.platforms.map((p, i) => block(p, sum.rows[i])).join('')}
      ${sum.other.n ? block(Object.assign({}, CFG.otherPlatform, { oddsApi: null }), { logged: sum.other, feed: { n: 0, avgDiff: null }, total: sum.other.n }) : ''}
    </div>`;
    if (log) html += `<p class="muted small">${esc(R.platLag(recs.length))}</p>`;
    return html;
  }

  /** Record tab: prediction record + per-platform price comparison (all 10 apps). */
  async function renderRecord() {
    const R = STR.record;
    const el = $('#tab-record');
    el.innerHTML = `<h2>${esc(R.title)}</h2><p class="muted">${esc(STR.loading)}</p>`;
    let preds = null, log = null;
    try { preds = await fetchData('data/predictions.json'); } catch (e) { /* shown below */ }
    try { log = await fetchData(CFG.betLogPath); } catch (e) { /* shown below */ }
    // data/book-odds.json: automatic price comparisons (The Odds API). Missing
    // or status "waiting_for_feed" -> the middle column says "Coming soon".
    let odds = null;
    try { odds = await fetchData(CFG.bookOddsPath || 'data/book-odds.json'); } catch (e) { /* optional */ }
    let html = `<h2>${esc(R.title)}</h2>`;
    if (!preds) html += `<p class="error">${esc(R.loadError)}</p>`;
    else {
      const list = preds.predictions || [];
      const cal = calibration(list);
      const kpi = (k, v) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
      html += `<div class="updated">${esc(R.updated(fmtTime(preds.updated_at)))}</div>
        <div class="kpis">${kpi(R.accuracy, cal.graded ? pct(cal.wins / cal.graded) : STR.none)}${kpi(R.graded, `${cal.wins}-${cal.graded - cal.wins}`)}${kpi(R.pending, list.filter(p => p.result === 'pending').length)}${kpi(R.total, list.length)}</div>
        <h3>${esc(R.calTitle)} ${tip('calibration')}</h3>
        ${cal.buckets.length ? `<div class="table-wrap"><table><tr><th>${esc(R.calSaid)}</th><th class="num">${esc(R.calPicks)}</th><th class="num">${esc(R.calAvg)}</th><th class="num">${esc(R.calActual)}</th><th class="num">${esc(R.calOff)}</th></tr>
          ${cal.buckets.map(b => { const avg = b.probSum / b.n / 100, act = b.wins / b.n; return `<tr><td>${b.lo}–${b.lo + 5}%</td><td class="num">${b.n}</td><td class="num">${pct(avg)}</td><td class="num">${pct(act)}</td><td class="num ${sign(act - avg)}">${esc(R.pts(((act - avg) * 100).toFixed(1)))}</td></tr>`; }).join('')}</table></div>`
          : `<div class="section-empty">${esc(R.calEmpty)}</div>`}
        ${list.length ? `<h3>${esc(R.recent)}</h3><div class="table-wrap"><table><tr><th>${esc(R.date)}</th><th>${esc(R.pick)}</th><th class="num">${esc(R.chance)}</th><th>${esc(R.result)}</th></tr>
          ${list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.pick)}<div class="muted small">${esc(p.game)}</div></td><td class="num">${esc(p.win_prob)}%</td><td><span class="badge ${p.result === 'win' ? 'won' : p.result === 'loss' ? 'lost' : 'open'}">${esc(R.resultWords[p.result] || p.result)}</span></td></tr>`).join('')}</table></div>` : ''}`;
    }
    html += renderPlatformCompare(log, odds);
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------- settings

  /** Settings tab. */
  function renderSettings() {
    const X = STR.settings;
    const el = $('#tab-settings');
    const p = S.getProfile(), token = S.getToken(), login = S.getLogin(), set = S.getSettings(), prefs = S.getPrefs();
    const unsynced = S.getBets().filter(b => b.share && !b.shared).length;
    el.innerHTML = `<h2>${esc(X.title)}</h2>
      <h3>${esc(X.platform)} ${tip('myPlatform')}</h3>
      <div id="set-plat">${platformToggleHtml(prefs.platform, true)}</div>
      <label class="field"><span>${esc(X.priceFormat)} ${tip('priceFormat')}</span>
        <select id="set-fmt">${Object.entries(X.formats).map(([k, v]) => `<option value="${k}" ${k === prefs.priceFormat ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>

      <h3>${esc(X.profile)}</h3>
      <form id="pf">
        <label class="field"><span>${esc(X.name)}</span><input id="pf-name" value="${esc(p.name)}" maxlength="40"></label>
        <div class="row">
          <label class="field"><span>${esc(X.bankroll)}</span><input id="pf-bank" type="number" step="0.01" value="${esc(p.startBankroll)}"></label>
          <label class="field"><span>${esc(X.unit)} ${tip('unit')}</span><input id="pf-unit" type="number" step="0.01" value="${esc(p.unit)}"></label>
        </div>
        <div class="row">
          <label class="field"><span>${esc(X.max)}</span><input id="pf-max" type="number" step="0.01" value="${esc(p.maxPerSlip)}"></label>
          <label class="field"><span>${esc(X.end)}</span><input id="pf-end" type="date" value="${esc(p.windowEnd || '')}"></label>
        </div>
        <button class="btn btn-primary" type="submit">${esc(X.saveProfile)}</button>
        <button class="btn btn-sm" type="button" id="pf-2pct">${esc(X.twoPct)}</button>
      </form>

      <h3>${esc(X.sharing)} ${tip('share')}</h3>
      <p class="muted small">${esc(X.sharingNote(CFG.betLogPath, `${CFG.repoOwner}/${CFG.repoName}`))}</p>
      <details class="howto"><summary>${esc(X.tokenHow)}</summary><p class="small">${esc(X.tokenSteps)} <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com ↗</a></p></details>
      <p>${token ? esc(X.tokenSaved(login)) : `<span class="error">${esc(X.tokenNone)}</span>`}</p>
      <label class="field"><span>${esc(X.tokenLabel)}</span><input id="tk" type="password" autocomplete="off" placeholder="${esc(token ? X.tokenSavedPh : X.tokenPh)}"></label>
      <div class="row"><button class="btn btn-primary" id="tk-save">${esc(X.tokenSave)}</button>${token ? `<button class="btn btn-danger" id="tk-del">${esc(X.tokenRemove)}</button>` : ''}</div>
      <label class="toggle"><input type="checkbox" id="share-def" ${set.shareByDefault ? 'checked' : ''}><span>${esc(X.shareDefault)}</span></label>
      ${unsynced ? `<button class="btn" id="resync">${esc(X.resync(unsynced))}</button>` : ''}

      <h3>${esc(STR.bets.backup)}</h3>
      <div class="row"><button class="btn" id="exp">${esc(STR.bets.export)}</button><button class="btn" id="imp">${esc(STR.bets.import)}</button></div>
      <input type="file" id="imp-file" accept="application/json,.json" hidden>
      <p class="muted small">${esc(X.backupNote)}</p>

      <h3>${esc(X.danger)}</h3>
      <button class="btn btn-danger" id="reset">${esc(X.reset)}</button>
      <p class="muted small" style="margin-top:24px">${esc(CFG.appName)} · ${esc(CFG.tagline)}</p>`;

    $('#set-plat').querySelectorAll('[data-plat]').forEach(b => (b.onclick = () => setPlatform(b.dataset.plat)));
    $('#set-fmt').onchange = e => { S.setPrefs({ priceFormat: e.target.value }); toast(X.profileSaved); };
    $('#pf').onsubmit = e => {
      e.preventDefault();
      const n = $('#pf-name').value.trim(), b = parseFloat($('#pf-bank').value), u = parseFloat($('#pf-unit').value), m = parseFloat($('#pf-max').value);
      if (!n || !(b > 0) || !(u > 0) || !(m > 0)) return toast(X.profileErr);
      S.setProfile(Object.assign({}, p, { name: n, startBankroll: b, unit: u, maxPerSlip: m, windowEnd: $('#pf-end').value || '' }));
      renderHeader(); toast(X.profileSaved);
    };
    $('#pf-2pct').onclick = () => { $('#pf-unit').value = (bankrollStats().current * 0.02).toFixed(2); };
    $('#tk-save').onclick = async () => {
      const t = $('#tk').value.trim() || token;
      if (!t) return toast(X.tokenPaste);
      toast(X.tokenChecking);
      try {
        const r = await G.checkToken(t);
        S.setToken(t); S.setLogin(r.login);
        toast(r.canPush === false ? X.tokenNoWrite(r.login) : X.tokenOk(r.login), 4500);
      } catch (e) { toast(e.message, 4000); }
      renderSettings();
    };
    if ($('#tk-del')) $('#tk-del').onclick = () => { S.setToken(''); toast(X.tokenRemoved); renderSettings(); };
    $('#share-def').onchange = e => S.setSettings({ shareByDefault: e.target.checked });
    if ($('#resync')) $('#resync').onclick = async () => {
      for (const b of S.getBets().filter(x => x.share && !x.shared)) await syncBet(b);
      renderSettings();
    };
    wireBackup(el);
    $('#reset').onclick = () => {
      if (!confirm(X.resetConfirm)) return;
      S.resetAll();
      location.hash = '';
      location.reload();
    };
  }

  // ---------------------------------------------------------------- boot

  /** Entry point. */
  function boot() {
    T.install();
    installTips();
    applyBrand();
    document.querySelectorAll('.tabbar button').forEach(b => (b.onclick = () => go(b.dataset.go)));
    window.addEventListener('hashchange', () => { if (S.getProfile()) go(location.hash.slice(1)); });
    if (!S.getProfile()) showOnboarding(); else startApp();
  }

  window.BetDash = { computeCalc, calibration, bankrollStats, recordByCategory, openTarget, getCalc: () => calc };
  boot();
})();
