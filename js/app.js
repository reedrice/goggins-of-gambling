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
 *   priceFormat  american (default) | decimal. Old 'cents' is shown as american:
 *                NO cents on screen since Oct 19 2026 (Reed). Display only; inputs
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
  const GT = window.GameTime;

  /** Calculator platform dropdown: config order + Other. */
  const PLATFORMS = [...CFG.platforms, CFG.otherPlatform];
  /** Bet category keys (stored on bets and in the shared log). */
  const CAT_KEYS = ['single', 'prop', 'parlay', 'longshot', 'nonsports'];
  /** picks.json section key -> category used when a pick is loaded into the builder. */
  const PICK_SECTIONS = [['predictions', null], ['singles', 'single'], ['props', 'prop'], ['parlays', 'parlay'], ['longshots', 'longshot'], ['lottery', 'longshot'], ['nonsports', 'nonsports']];

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

  /** @param {number} n @returns {string} "$1,235" / "-$5" / "under $1" (no cents) */
  function money(n) {
    if (typeof n !== 'number' || !isFinite(n)) return STR.none;
    return window.Plain.dollars(n);   // whole dollars, no cents (HANDOFF §52)
  }
  const pct = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? (x * 100).toFixed(d) + '%' : STR.none);
  const uid = () => 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const sign = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  /** Price (cents) in the user's chosen display format. */
  // Never cents on screen (Reed, Oct 19 2026): decimal if chosen, else American odds. Cents stay internal.
  const fmtP = c => C.formatPrice(c, S.getPrefs().priceFormat === 'decimal' ? 'decimal' : 'american');

  // ------------------------------------------------- payout explainer
  // Next to every price: "$10 → $24.39". The example
  // stake is the user's own standard bet from their local profile ($10 when
  // not set). It is computed here in the browser only and never written to
  // the repo. Math: BetCalc.payout / slipPays (tested in tests/calc.test.js).

  /** Example stake in dollars: the user's standard bet, else $10. */
  const exStake = () => { const u = Number((S.getProfile() || {}).unit); return u > 0 && isFinite(u) ? u : 10; };

  /** Dollars without a trailing ".00": "$10", "$24.39". */
  const cash = n => window.Plain.dollars(n);   // whole dollars, no cents (HANDOFF §52)

  /** Compact text for Build-a-bet buttons: "$10 → $24.39" ('' for a bad price). @param {number} c cents */
  function payShort(c) {
    const p = C.payout(c, exStake());
    return p ? STR.pay.short(cash(exStake()), cash(p.pays)) : '';
  }

  // ------------------------------------------------- 2nd-grade money words
  // Reed (Oct 19 2026): lead with dollars and plain chances, show the cents
  // price ONCE and small, mention another app only when it's cheaper, and
  // move "tap …" instructions out of titles. Pure wording rules live in
  // js/plain.js (tested); the sentences in STR.plain.
  const PL = window.Plain;
  const isC = v => typeof v === 'number' && isFinite(v) && v > 0 && v < 100;

  /**
   * "Wins about 6 out of 10 times" / "All 3 win about 1 in 4 times".
   * @param {number} p chance 0..1 @param {number} [k=1] picks in the combo
   */
  function chanceText(p, k = 1) {
    const w = PL.chanceWords(p);
    if (!w) return '';
    const X = k > 1 ? STR.plain.allChance : STR.plain.chance;
    if (w.kind === 'almost') return k > 1 ? X.almost(k) : X.almost;
    return k > 1 ? X[w.kind](k, w.n) : X[w.kind](w.n);
  }

  /** Chance sentence + 10 dots (dots hidden from screen readers). @returns {string} HTML */
  const chanceHtml = (p, k) => {
    const t = chanceText(p, k);
    return t ? `<span class="chance-w">${esc(t)}</span> <span class="dots" aria-hidden="true">${esc(PL.dots(p))}</span>` : '';
  };

  /** "Bet $10 → get $15.75 back" at a price in cents (stake = standard bet, else $10). */
  function betGetText(c) {
    const p = C.payout(c, exStake());
    return p ? STR.plain.betGet(cash(exStake()), cash(p.pays)) : '';
  }

  /**
   * Price on the user's app plus a cheaper app, if any.
   * Sources: o.price = Polymarket US (picks.json / picker legs), o.kalshi_price
   * or o.kalshiPrice = Kalshi, extra = more {id, c} candidates (book-odds).
   * With Kalshi as "My platform" and a Kalshi price known, Kalshi leads.
   * @returns {{mine:{name:string,c:number}|null, cheaper:{name:string,c:number}|null}}
   */
  function appPrices(o, extra) {
    const me = myPlatform();
    const pm = isC(o.price) ? o.price : null;
    const k = isC(o.kalshi_price) ? o.kalshi_price : isC(o.kalshiPrice) ? o.kalshiPrice : null;
    const named = id => (platformById(id) || { name: id }).name;
    const cands = [];
    if (pm !== null) cands.push({ id: 'polymarket_us', c: pm });
    if (k !== null) cands.push({ id: 'kalshi', c: k });
    (extra || []).forEach(x => isC(x.c) && !cands.some(y => y.id === x.id) && cands.push(x));
    const mineC = cands.find(x => x.id === me.id) || cands.find(x => x.id === 'polymarket_us') || cands[0];
    if (!mineC) return { mine: null, cheaper: null };
    const best = cands.filter(x => x !== mineC && x.c < mineC.c).sort((a, b) => a.c - b.c)[0];
    return { mine: { name: named(mineC.id), c: mineC.c }, cheaper: best ? { name: named(best.id), c: best.c } : null };
  }

  /** "Vegas -185 (BetMGM)" or "Polymarket US price: -174", plus "Cheaper on Kalshi (-170)". @returns {string} HTML ('' when no price) */
  /**
   * Vegas line for a pick/leg/slip leg: "Vegas: +120 (DraftKings)" from the
   * sportsbook lookup (js/vegas.js); '' when no real price exists. Never guessed.
   * @param {string} marketId @param {string} side 'yes'|'no' @returns {string} plain text
   */
  function vegasText(marketId, side) {
    const v = window.Vegas.lookup(marketId, side);
    return v ? STR.plain.vegas(v.p, (platformById(v.book) || { name: v.book }).name) : '';
  }

  function priceLineHtml(o, extra, withTip) {
    const { mine, cheaper } = appPrices(o, extra);
    if (!mine) return '';
    // Cents ALWAYS come with their American odds: "63.5¢ (-174)"; then the real Vegas number when we have one.
    // No cents (Reed, Oct 19 2026): the real Vegas number when we have one, else the app's own price as +/- odds.
    const vg = vegasText(o.market_id, o.market_side);
    return `<div class="price-on small muted">${vg ? `<span class="vegas-line">${esc(vg)}</span>` : esc(STR.plain.appOdds(mine.name, fmtP(mine.c)))}${withTip ? ' ' + tip('americanOdds') : ''}${cheaper ? ` · <span class="cheaper">${esc(STR.plain.cheaperOn(cheaper.name, fmtP(cheaper.c)))}</span>` : ''}</div>`;
  }

  /** "+1.5 = they win, or lose by just 1 run" for a spread text. @returns {string} HTML */
  function spreadHtml(text, o) {
    const s = PL.spreadNote(text, PL.leagueOf(o));
    if (!s) return '';
    return `<div class="spread-note small muted">${esc(s.plus ? STR.plain.spreadPlus(s.line, s.n, s.unit) : STR.plain.spreadMinus(s.line, s.n, s.unit))}</div>`;
  }

  /** "Tap: Guardians +1.5" / "Tap: No (4 or fewer)". @returns {string} HTML */
  function tapHtml(split) {
    if (!split.tap) return '';
    return '';   // §54: no "Tap: Yes/No" instructions (analyzer, not pick seller)
  }

  /**
   * One combo leg (pick card), plain version:
   *   Guardians +1.5 runs                         (title, position badge)
   *   Bet $10 → get $15.75 back
   *   Wins about 6 out of 10 times ●●●●●●○○○○
   *   👉 Tap: Guardians +1.5
   *   +1.5 = they win, or lose by just 1 run
   *   Vegas -185 (BetMGM)   (else "Polymarket US price: -174") · Cheaper on Kalshi (-170)
   *   🕒 Mon Oct 19 · 7:08 PM CT
   * @param {object} l picks.json leg @returns {string} HTML
   */
  function plainLegHtml(l, tipFirstLeg) {
    const sp = PL.splitTap(l.desc);
    const { mine } = appPrices(l);
    const p = isC(l.fair) ? l.fair / 100 : mine ? mine.c / 100 : null;
    return `<span class="leg-body"><span class="leg-title">${posText(sp.title, l)}</span>
      ${mine ? `<span class="pay-big">${esc(betGetText(mine.c))}</span>` : ''}
      ${p ? `<span class="chance-line">${chanceHtml(p)}</span>` : ''}
      ${tapHtml(sp)}${spreadHtml(sp.title + ' ' + (sp.tap || ''), l)}${priceLineHtml(l, null, tipFirstLeg)}
      ${GT.valid(l.start_time) ? `<span class="leg-when small muted">🕒 ${esc(GT.format(l.start_time))}</span>` : ''}</span>`;
  }

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
      // .tip = (i) button (text from STR.tips); .pos-badge = player position badge
      // (its own text in data-tip-text, e.g. "QB = Quarterback").
      const b = e.target.closest('.tip, .pos-badge');
      if (!b) { pop.hidden = true; return; }
      e.preventDefault();
      e.stopPropagation();
      pop.textContent = b.dataset.tipText || STR.tip(b.dataset.tip);
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
    // Record too: its "Price vs. <your app>" column follows this setting.
    if (['picks', 'settings', 'calc', 'record'].includes(tab)) go(tab);
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
    // #live and #picks are the two views of the Picks tab (renderPicks).
    if (name === 'live' || name === 'picks') { picksView = name; S.setPrefs({ picksView: name }); }
    if (name === 'live') name = 'picks';
    // #play and #bets are the two views of the My Bets tab ("My bets" | "Play money 🎮").
    if (name === 'play' || name === 'bets') { betsView = name; S.setPrefs({ betsView: name }); name = 'bets'; }
    if (!$('#tab-' + name)) name = 'picks';
    document.querySelectorAll('.tab').forEach(s => (s.hidden = s.dataset.tab !== name));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    const want = '#' + (name === 'picks' ? picksView || savedView() : name === 'bets' ? betsView || savedBetsView() : name);
    if (location.hash !== want) history.replaceState(null, '', want);
    ({ picks: renderPicks, calc: renderCalc, bets: renderBets, record: renderRecord, trent: renderTrent, settings: renderSettings })[name]();
    window.scrollTo(0, 0);
  }

  /** Reveal the app; load the market index in the background (team logos). */
  function startApp() {
    $('#app').hidden = false;
    renderHeader();
    renderPlatformToggle();
    window.Picker.loadIndex().catch(() => {});
    go(pendingPick ? 'picks' : location.hash ? location.hash.slice(1) : savedView());
    startLiveAlerts();
    seedBets();
  }

  /**
   * Copy bets placed outside the app (data/seed-bets.json, committed, dollar-free)
   * into this browser's My Bets list (localStorage) once each.
   * - stake = stake_units x profile.unit (dollars only ever live in localStorage).
   * - ids already seeded are kept in prefs.seededBets, so a bet the user deletes
   *   or settles is never re-added or overwritten.
   * Side effects: localStorage (bets + prefs); re-renders My Bets if it is open.
   */
  async function seedBets() {
    let data;
    try { data = await fetchData('data/seed-bets.json'); } catch (e) { return; }
    const p = S.getProfile(); if (!p || !Array.isArray(data.bets)) return;
    const done = new Set(S.getPrefs().seededBets || []);
    const have = new Set(S.getBets().map(b => b.id));
    let added = 0;
    for (const s of data.bets) {
      if (done.has(s.id)) continue;
      done.add(s.id);
      if (have.has(s.id)) continue;
      S.upsertBet({
        id: s.id, createdAt: s.createdAt, settledAt: null, category: s.category || 'parlay', platform: s.platform,
        legs: s.legs.map(d => ({ desc: d, price: '', platform: s.platform, p: null, startTime: null })),
        estMultiple: s.quoted_multiple, quotedMultiple: s.quoted_multiple, hitChance: null,
        stake: Math.round(s.stake_units * (p.unit || 10) * 100) / 100,
        status: 'open', share: false, shared: false, pickId: null, seeded: true
      });
      added++;
    }
    S.setPrefs({ seededBets: [...done] });
    if (added) { renderHeader(); if (!$('#tab-bets').hidden) renderBets(); }
  }

  // ------------------------------------------- PLAY MONEY (points, just for fun)
  // Math + checks: js/play.js (window.Play). State: localStorage betdash_play
  // ({name, bets}) via Store.getPlay/setPlay. No real money anywhere: points only.
  // Prices: the LIVE Polymarket US buy price (Picker.livePrice) at the moment the
  // bet is placed, shown as American odds + "Bet 100 pts, get X back".
  // Results: settlePlay() reads each game from the public Polymarket US gateway
  // (closed market, winning side priced 1) — real results only.
  // Shared leaderboard: "Post my score" opens a pre-filled public GitHub issue;
  // scripts/play-leaderboard.mjs re-settles those bets and writes
  // data/play/leaderboard.json (HANDOFF §34). No keys or secrets on the site.
  const PY = window.Play;
  let playStake = PY.DEFAULT_STAKE, lastSettle = 0, playBoard = null;
  const pts = n => Math.round(n).toLocaleString('en-US');

  /** Can a pick card be played? Every leg needs a real market id + side. */
  function playable(pk) {
    const legs = Array.isArray(pk.legs) && pk.legs.length ? pk.legs : [pk];
    return legs.length <= PY.MAX_LEGS && legs.every(l => l.market_id && (l.market_side === 'yes' || l.market_side === 'no'));
  }

  /** Live Polymarket US price for each leg (null when any is missing). */
  async function livePlayPrices(legs) {
    const cs = await Promise.all(legs.map(l => window.Picker.livePrice(l.marketId, l.side).catch(() => null)));
    return cs.every(c => c >= 1 && c <= 99) ? cs : null;
  }

  /** Validate + store a new play bet. legs: [{marketId, side, c, desc, eventSlug}]. */
  function placePlay(stake, legs) {
    const X = STR.play, st = S.getPlay();
    if (!PY.validName(st.name)) { toast(X.err.name, 4000); go('play'); return false; }
    const err = PY.checkNew(st.bets, stake, legs);
    if (err) { toast(X.err[err], 4000); return false; }
    const back = PY.getBack(stake, legs.map(l => l.c));
    st.bets.push({ id: uid(), at: new Date().toISOString(), stake, legs, status: 'open', ret: 0, settledAt: null });
    S.setPlay(st);
    toast(X.placed(pts(stake), pts(back)), 3500);
    return true;
  }

  /** "🎮 Play" on a pick card: live price -> confirm -> place 100 pts. */
  async function playPick(id) {
    let pk = null;
    Object.values(picksData.sections || {}).forEach(list => (list || []).forEach(p => { if (p.id === id) pk = p; }));
    if (!pk || !playable(pk)) return;
    const raw = Array.isArray(pk.legs) && pk.legs.length ? pk.legs : [pk];
    const legs = raw.map(l => ({ marketId: l.market_id, side: l.market_side, desc: String(l.desc || pk.side || pk.market || '').slice(0, 80) }));
    const cs = await livePlayPrices(legs);
    if (!cs) return toast(STR.play.err.price, 4000);
    legs.forEach((l, i) => { l.c = cs[i]; l.eventSlug = PY.gameSlug(l.marketId); });
    const stake = PY.DEFAULT_STAKE, back = PY.getBack(stake, cs);
    if (!confirm(STR.play.confirm(legs.map(l => l.desc).join(' + '), PY.comboOdds(cs), pts(stake), pts(back)))) return;
    placePlay(stake, legs);
  }

  /** Build a Bet: the play line under the slip ("Bet 100 pts, get 227 back · +127"). */
  function updatePlayLine() {
    const line = $('#p-line'), btn = $('#p-bet');
    if (!line || !btn) return;
    const legs = calc.legs, ok = legs.length && legs.every(l => l.marketId && l.side);
    const cs = ok ? legs.map(l => C.parsePrice(l.price)).map(x => (x ? x.p * 100 : null)) : [];
    const priced = ok && cs.every(c => c >= 1 && c <= 99);
    btn.textContent = STR.play.calcBtn(pts(playStake || 0));
    btn.disabled = !priced || !(playStake > 0);
    line.textContent = !legs.length ? '' : !ok ? STR.play.calcNeedsReal
      : priced ? `${STR.play.betGet(pts(playStake || 0), pts(PY.getBack(playStake || 0, cs)))} · ${PY.comboOdds(cs)}` : '';
  }

  /** Build a Bet: place the slip as a play bet at fresh live prices. */
  async function playFromCalc() {
    const legs = calc.legs.map(l => ({ marketId: l.marketId, side: l.side, desc: String(l.desc || '').slice(0, 80), eventSlug: l.eventSlug || PY.gameSlug(l.marketId) }));
    if (!legs.length || !legs.every(l => l.marketId && l.side)) return toast(STR.play.calcNeedsReal, 4000);
    const cs = await livePlayPrices(legs);
    if (!cs) return toast(STR.play.err.price, 4000);
    legs.forEach((l, i) => (l.c = cs[i]));
    if (placePlay(playStake, legs)) go('play');
  }

  /** Settle open play bets from real results (at most every 2 min unless forced). */
  async function settlePlay(force) {
    if (!force && Date.now() - lastSettle < 120000) return 0;
    lastSettle = Date.now();
    const st = S.getPlay(), open = st.bets.filter(b => b.status === 'open');
    if (!open.length) return 0;
    const cache = {};
    const ev = slug => cache[slug] || (cache[slug] = fetch(`${window.MarketsCore.GATEWAY}/v1/events/slug/${encodeURIComponent(slug)}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
    let n = 0;
    for (const b of open) {
      const res = await Promise.all(b.legs.map(async l => { const slug = l.eventSlug || PY.gameSlug(l.marketId); return slug ? PY.legResult(await ev(slug), l.marketId, l.side) : null; }));
      const r = PY.settle(b, res);
      if (r.status !== 'open') { Object.assign(b, r, { settledAt: new Date().toISOString() }); n++; }
    }
    if (n) S.setPlay(st);
    return n;
  }

  /** Pre-filled GitHub issue for "Post my score" (public; no token needed). */
  function postScoreUrl(st) {
    const body = 'Play money, just for fun. Posted from the dashboard; the leaderboard script re-checks every bet.\n\n```json\n' + JSON.stringify(PY.submission(st.name, st.bets)) + '\n```';
    return `https://github.com/${CFG.repoOwner || 'reedrice'}/${CFG.repoName || 'goggins-of-gambling'}/issues/new?title=${encodeURIComponent(PY.ISSUE_PREFIX + st.name)}&body=${encodeURIComponent(body)}`;
  }

  /** The Play money view (My Bets tab -> "Play money 🎮", #play). */
  async function renderPlay() {
    const X = STR.play, el = $('#bets-view');
    const draw = () => {
      if ($('#bets-view') !== el) return;
      const st = S.getPlay();
      if (!PY.validName(st.name)) {
        el.innerHTML = `<div class="play-tag">${esc(X.banner)}</div><h2>${esc(X.title)}</h2>
          <label class="field"><span>${esc(X.nameLabel)}</span><input id="play-name" maxlength="20" placeholder="${esc(X.namePh)}" value="${esc(S.getProfile().name || '')}"></label>
          <p class="muted small">${esc(X.nameHint)}</p><button class="btn btn-play btn-xl" id="play-start">${esc(X.start)}</button>`;
        $('#play-start').onclick = () => { const n = PY.cleanName($('#play-name').value); if (!PY.validName(n)) return toast(X.nameHint, 4000); S.setPlay({ name: n, bets: st.bets }); draw(); };
        return;
      }
      const s = PY.stats(st.bets);
      const kpi = (k, v, cls = '') => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div></div>`;
      const roi = s.roi == null ? STR.none : `${s.roi > 0 ? '+' : ''}${Math.round(s.roi * 100)}%`;
      const best = s.best ? `${esc(s.best.odds)} · ${esc(pts(s.best.ret))}` : STR.none;
      const betCard = b => {
        const cs = b.legs.map(l => l.c), back = PY.getBack(b.stake, cs);
        const res = b.status === 'won' ? X.won(pts(b.ret)) : b.status === 'lost' ? X.lost : b.status === 'push' ? X.push : X.waiting;
        return `<div class="card play-bet ${esc(b.status)}"><div class="pb-legs">${b.legs.map(l => `<div><b>${esc(l.desc || l.marketId)}</b> <span class="muted small">${esc(PY.american(l.c))}</span></div>`).join('')}</div>
          <div class="small">${esc(X.betGet(pts(b.stake), pts(back)))} · ${esc(PY.comboOdds(cs))}</div>
          <div class="small pb-res">${esc(res)} · <span class="muted">${esc(fmtTime(b.at))}</span></div></div>`;
      };
      const open = st.bets.filter(b => b.status === 'open').reverse(), done = st.bets.filter(b => b.status !== 'open').reverse();
      // Leaderboard: shared rows + my own live row (marked "you"; replaces my posted row if names match).
      const rows = ((playBoard && playBoard.rows) || []).filter(r => r && r.name !== st.name).map(r => Object.assign({}, r));
      rows.push({ name: st.name, points: s.points, w: s.w, l: s.l, roi: s.roi, best: s.best, me: true });
      rows.sort((a, b) => b.points - a.points);
      const fmtRoi = r => (r == null ? '–' : `${r > 0 ? '+' : ''}${Math.round(r * 100)}%`);
      el.innerHTML = `<div class="play-tag">${esc(X.banner)}</div>
        <h2>${esc(X.title)} · ${esc(st.name)}</h2>
        <div class="kpis">${kpi(X.points, esc(pts(s.points)))}${kpi(X.wl, `${s.w}-${s.l}`)}${kpi(X.roi, esc(roi), s.roi == null ? '' : sign(s.roi))}${kpi(X.best, best)}</div>
        <button class="btn btn-sm" id="play-check">${esc(X.check)}</button>
        <h3>${esc(X.open(open.length))}</h3>${open.length ? open.map(betCard).join('') : `<div class="section-empty">${esc(X.none)}</div>`}
        ${done.length ? `<h3>${esc(X.settled)}</h3>${done.map(betCard).join('')}` : ''}
        <h3>${esc(X.board)}</h3>
        <table class="play-board"><thead><tr><th>#</th><th>${esc(X.colName)}</th><th>${esc(X.colPts)}</th><th>${esc(X.colWL)}</th><th>${esc(X.colRoi)}</th><th>${esc(X.colBest)}</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${r.me ? ` <span class="muted small">${esc(X.you)}</span>` : ''}</td><td>${esc(pts(r.points))}</td><td>${r.w}-${r.l}</td><td>${esc(fmtRoi(r.roi))}</td><td>${r.best ? esc(r.best.odds) : '–'}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">${esc(X.boardNote)}</p>
        <a class="btn btn-play" id="play-post" target="_blank" rel="noopener" href="${esc(postScoreUrl(st))}">${esc(X.post)} ↗</a>
        <p class="muted small">${esc(X.postNote)}</p>`;
      $('#play-check').onclick = async () => { toast(X.checking); const n = await settlePlay(true); toast(X.settledN(n)); draw(); };
    };
    draw();
    const [n] = await Promise.all([settlePlay(false), fetchData('data/play/leaderboard.json').then(d => (playBoard = d)).catch(() => null)]);
    draw();
    if (n) toast(STR.play.settledN(n));
  }

  // ------------------------------------------- live alerts: badge + pop-up
  // Pablo's request for Richie (HANDOFF §31 "Requests for Reed's bot", Oct 19 2026).
  // Reads Richie's feed data/live/<LiveBets.SLUG>.json (his file, we only read it):
  // alerts[] newest first, each {id, at (ISO UTC), type, tier, text, ...}.
  //  - Badge on the "Live Bets 🔴" toggle and the bottom-bar Picks button =
  //    alerts newer than localStorage['liveBets.alertsSeen.' + SLUG]. That key is
  //    Richie's and READ-ONLY here: js/live-bets.js writes it when the Live view
  //    draws, which clears the badge. No stored value yet = every alert counts.
  //  - Pop-up on any page for a new big edge (type 'new_edge', tier 'big'),
  //    linking to #live. Dismissed ids are kept in OUR key betdash_liveDismissed.
  //  - Polls about every 60 s, only while the page is visible.
  // Missing LiveBets/SLUG/file or bad JSON = no badge, no pop-up, no error shown.
  // Text goes in with textContent (data is untrusted). No cents, no dollars.
  const LIVE_POLL_MS = 60000, LIVE_DISMISS_KEY = 'betdash_liveDismissed';
  const LIVE_TXT = { toast: 'New big edge:', see: 'See it', close: 'Close' };   // kept here: strings.js is outside this change's scope
  let liveAlerts = [], liveTimer = null;
  const liveSlug = () => (window.LiveBets && typeof LiveBets.SLUG === 'string' && /^[a-z0-9-]+$/.test(LiveBets.SLUG) ? LiveBets.SLUG : '');
  const readLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /** Alerts newer than Richie's last-seen marker (all of them when there is none). */
  function liveNew() {
    const slug = liveSlug(); if (!slug) return [];
    const seen = readLS('liveBets.alertsSeen.' + slug);
    return liveAlerts.filter(a => a && typeof a.at === 'string' && (!seen || a.at > seen));
  }

  /** Put the count on the toggle + Picks nav button ('' hides it; 9+ caps it). */
  function paintLiveBadges() {
    const n = liveNew().length, txt = n ? (n > 9 ? '9+' : String(n)) : '';
    document.querySelectorAll('[data-picks-view="live"], .tabbar [data-go="picks"]').forEach(b => {
      let i = b.querySelector('.live-badge');
      if (!txt) { if (i) i.remove(); return; }
      if (!i) { i = document.createElement('i'); i.className = 'live-badge'; b.appendChild(i); }
      i.textContent = txt; i.setAttribute('aria-label', txt + ' new live alerts');
    });
  }

  /** Small dismissible pop-up for the newest not-dismissed big edge. */
  function paintLiveToast() {
    let dismissed = [];
    try { dismissed = JSON.parse(readLS(LIVE_DISMISS_KEY) || '[]'); } catch (e) { dismissed = []; }
    if (!Array.isArray(dismissed)) dismissed = [];
    const onLive = !$('#tab-picks').hidden && picksView === 'live';
    const a = onLive ? null : liveNew().find(x => x.type === 'new_edge' && x.tier === 'big' && x.id && !dismissed.includes(x.id));
    let t = $('#live-toast');
    if (!a) { if (t) t.remove(); return; }
    if (t && t.dataset.id === String(a.id)) return;
    if (t) t.remove();
    t = document.createElement('div'); t.id = 'live-toast'; t.className = 'live-toast'; t.setAttribute('role', 'status'); t.dataset.id = String(a.id);
    const msg = document.createElement('a'); msg.href = '#live'; msg.className = 'lt-msg';
    const b = document.createElement('b'); b.textContent = LIVE_TXT.toast + ' ';
    msg.append('🔴 ', b, String(a.text || a.side || ''), ' ');
    const see = document.createElement('span'); see.className = 'lt-see'; see.textContent = LIVE_TXT.see + ' →'; msg.appendChild(see);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'lt-x'; x.textContent = '×'; x.setAttribute('aria-label', LIVE_TXT.close);
    const dismiss = () => { try { localStorage.setItem(LIVE_DISMISS_KEY, JSON.stringify([a.id, ...dismissed].slice(0, 100))); } catch (e) {} t.remove(); };
    msg.onclick = dismiss; x.onclick = dismiss;
    t.append(msg, x); document.body.appendChild(t);
  }

  /** Fetch the feed once, then repaint. Any failure = treat as no alerts. */
  async function pollLiveAlerts() {
    const slug = liveSlug();
    if (!slug) { liveAlerts = []; } else {
      try {
        const r = await fetch(`data/live/${slug}.json?ts=${Date.now()}`, { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        liveAlerts = j && Array.isArray(j.alerts) ? j.alerts.slice(0, 50) : [];
      } catch (e) { liveAlerts = []; }
    }
    paintLiveBadges(); paintLiveToast();
  }

  /** Poll every ~60 s while visible; poll right away when the page comes back. */
  function startLiveAlerts() {
    const tick = () => { if (document.visibilityState === 'visible') pollLiveAlerts(); };
    tick();
    clearInterval(liveTimer); liveTimer = setInterval(tick, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', tick);
  }

  // ---------------------------------------------------------------- picks

  /** Size text using THIS user's standard bet size (not shown on cards since §54). */
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
   * Other apps' prices for a single bet, from today's data/book-odds.json rows
   * (refs with leg null), latest check only (BetCalc.groupPrices). Fed into
   * appPrices() so the card only says "Cheaper on X (-156)" when another app
   * really is cheaper than the user's "My platform" (Reed, Oct 19 2026: show
   * the other app only if it's cheaper). [] when there's no data, the feed is
   * off, or the rows are for a different slate.
   * @param {object} pk pick @returns {{id:string, c:number}[]}
   */
  function bookPrices(pk) {
    const bo = bookOdds;
    if (!bo || bo.status !== 'active' || !Array.isArray(bo.comparisons) || !picksData) return [];
    const rows = bo.comparisons.filter(r => r.date === (pk.slate_date || picksData.slate_date) && Array.isArray(r.refs) &&
      r.refs.some(x => x.pick_id === pk.id && x.leg === null));
    const groups = C.groupPrices(rows).sort((x, y) => String(y.fetched_at).localeCompare(String(x.fetched_at)));
    if (!groups.length) return [];
    return Object.entries(groups[0].prices).map(([id, c]) => ({ id, c }));
  }

  /** Dollars this pick suggests (stake_units × the user's standard bet), else the example stake. */
  function pickStake(pk) {
    const u = Number((S.getProfile() || {}).unit);
    return pk.stake_units > 0 && u > 0 ? pk.stake_units * u : exStake();
  }

  /** Color legend for the risk labels, shown once above the picks. */
  function riskLegend() {
    const E = STR.eval;
    // + the one "How prices work" (i) for the whole Picks tab
    return `<div class="risk-legend small"><span class="muted">${esc(STR.pay.howTitle)} ${tip('howPrices')}</span><span class="muted">${esc(E.legendTitle)}</span>
      ${window.PickEval.RISK_KEYS.map(k => `<span class="risk risk-${k}">${esc(E.risk[k])} <span class="rl">${esc(E.legend[k])}</span></span>`).join('')}</div>`;
  }

  /**
   * "My hit chance" bar + risk label + "My take" + "My prediction" block.
   * Values come from picks.json when the daily job set them, otherwise
   * PickEval computes them (see js/evaluate.js for the rules + thresholds).
   * @param {object} pk @param {string} sec section key (singles, parlays, ...)
   * @returns {string} HTML
   */
  /** Analytics line (§56) for any bet with a Polymarket US market id; filled by js/our-chance.js. */
  function ocDiv(marketId, side, price, text, player) {
    return marketId && window.OurChance && price > 0 && price < 100 ? `<div class="oc oc-sm" data-oc="${window.OurChance.attr({ marketId, side: side || 'yes', market: price, text: text || '', player: player || null })}"></div>` : '';
  }
  function evalBlock(pk, sec) {
    const E = STR.eval;
    const ev = window.PickEval.evaluate(pk, sec, STR);
    // Plain chance: "Wins about 5 out of 10 times" / "All 3 win about 1 in 4 times" (no %).
    const k = Array.isArray(pk.legs) && pk.legs.length > 1 ? pk.legs.length : 1;
    const pctTxt = ev.pct === null ? STR.none : chanceText(ev.pct / 100, k) || STR.none;
    const width = ev.pct === null ? 0 : Math.max(2, Math.min(100, ev.pct));   // numeric only, safe in style
    const note = ev.sameGame === true ? (ev.source === 'given' ? E.sameGameGiven : E.sameGameLegs) : ev.sameGame === false ? E.diffGames : '';
    const preds = window.PickEval.findPredictions(pk, gamePreds, picksData && pickDayOf(pk, picksData))   // pick's own day (next-day picks);
    const multi = Array.isArray(pk.legs) && pk.legs.length > 0;
    const oc = !multi && pk.market_id && window.OurChance ? `<div class="oc" data-oc="${window.OurChance.attr({ marketId: pk.market_id, side: pk.market_side || 'yes', market: pk.price, text: pk.side, player: pk.player || null })}"></div>` : '';
    return `<div class="eval">${oc}
      <div class="eval-top">
        <b class="eval-pct">${esc(pctTxt)}</b> ${tip('hitChance')}
        ${ev.risk ? `<span class="risk risk-${esc(ev.risk)}">${esc(E.risk[ev.risk] || ev.risk)}</span>${tip('risk')}` : ''}
      </div>
      <div class="hitbar" role="img" aria-label="${esc(E.hitChance + ' ' + pctTxt)}"><span class="risk-bg-${esc(ev.risk || 'none')}" style="width:${width}%"></span></div>
      ${note ? `<div class="eval-note small muted">${esc(note)}</div>` : ''}
      <div class="take"><b>${esc(E.take)}</b> ${esc(PL.neutral(ev.verdict) || STR.eval.verdicts.neutral)} ${tip('take')}</div>
      ${preds.map(g => `<div class="pred small">🔮 ${esc(E.prediction(g.pick, g.projected_score, g.win_prob))}</div>`).join('')}
    </div>`;
  }

  /**
   * Escaped pick text with a position badge after the player's name, for
   * picks fetch-markets.mjs tagged with player / player_team / league.
   * @param {string} text @param {object} o pick or leg @returns {string} HTML
   */
  const posText = (text, o) => (o && o.player ? window.Positions.inText(text, o.league, o.player_team, o.player) : esc(text));

  /**
   * Escaped leg text (slip / saved bet) with a position badge. Older legs
   * without player info get none. @param {object} l leg @returns {string} HTML
   */
  // The 'tap "…"' / '— YES' part is cut off the title (shown as its own "Tap:" line where it helps).
  const legText = l => { const t = PL.splitTap(l.desc).title; return l.player ? window.Positions.inText(t, l.league, l.playerTeam, l.player) : esc(t); };

  /** One pick card. @param {object} pk @param {string} cat category @param {string} sec section key */

  // ------------------------------------------------- Share a pick (HANDOFF §46)
  let pendingPick = new URLSearchParams(location.search).get('pick');
  const shareAm = c => (c > 0 && c < 100 ? C.formatPrice(c, 'american') : '');
  const multAm = m => (m >= 2 ? '+' + Math.round((m - 1) * 100).toLocaleString('en-US') : m > 1 ? '-' + Math.round(100 / (m - 1)) : '');
  function chanceLine(pct) {
    const w = PL.chanceWords(pct / 100);
    if (!w) return '';
    return w.kind === 'almost' ? 'Wins almost every time' : w.kind === 'of10' ? `Wins about ${w.n} out of 10 times` : `Hits about 1 in ${w.n.toLocaleString('en-US')} times`;
  }
  function shareDate(day) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? new Date(day + 'T12:00:00') : null;
    return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  const legSport = (l, pk) => String((l.team && l.team.league) || l.league || (pk.sport || '').split('+')[0] || '').trim().toUpperCase();
  /** Card pick -> Share info (no stakes, no cents). */
  function shareInfoPick(pk) {
    const multi = Array.isArray(pk.legs) && pk.legs.length > 0;
    const legs = multi ? pk.legs.map(l => ({ sport: legSport(l, pk), text: legName(l.desc), am: shareAm(l.price) }))
      : [{ sport: legSport(pk, pk), text: legName(pk.side) || pk.market, am: shareAm(pk.price) }];
    const m = multi ? (pk.quoted_multiple || pk.est_multiple) : (pk.price > 0 ? 100 / pk.price : 0);
    const hp = typeof pk.hit_prob === 'number' ? pk.hit_prob : (!multi && pk.price) || 0;
    return { id: pk.id, multi, title: multi ? (pk.market || pk.side) : (legName(pk.side) || pk.market), sub: pk.event || '', date: shareDate(picksData && pickDayOf(pk, picksData)), legs,
      combinedAm: m ? multAm(m) : '', pay10: m ? Math.round(10 * m).toLocaleString('en-US') : '', chance: chanceLine(hp) };
  }
  /** Record pick-history entry -> Share info. */
  function shareInfoHist(h) {
    const m = histMultiple(h), multi = (h.legs || []).length > 1;
    return { id: h.id, multi, title: histName(h), sub: h.sport || '', date: shareDate(h.slate_date),
      legs: (h.legs || []).map(l => ({ sport: legSport(l, h), text: legName(l.desc), am: shareAm(l.publish) })),
      combinedAm: m ? multAm(m) : '', pay10: m ? Math.round(10 * m).toLocaleString('en-US') : '', chance: chanceLine(h.hit_prob) };
  }
  // ---- Charts everywhere (HANDOFF §53): one spec shape for every place a bet shows.
  const vizOn = () => !!window.Viz;
  const vizSlugOf = l => l.eventSlug || (window.Play && window.Play.gameSlug ? window.Play.gameSlug(l.marketId || l.market_id || '') : null);
  /** Stored/builder leg ({desc, marketId, side, eventSlug, league, player}) or a plain text leg -> Viz leg. */
  function vizLeg(l) {
    if (typeof l === 'string') return { text: l.replace(/\s*\(\d+\/\d+\)\s*$/, '') };
    return { text: legName(PL.splitTap(l.desc || '').title || l.desc || ''), player: l.player || null, league: (l.league || '').toLowerCase(),
      marketSlug: l.marketId || l.market_id || null, eventSlug: vizSlugOf(l), side: l.side === 'no' || l.market_side === 'no' ? 1 : 0,
      extraPoints: l.extraPoints || null };
  }
  /** Small "📊 Chart" button for one spec ('' if the page has no Viz). */
  const chartBtnFor = (spec, label) => (vizOn() && spec && (spec.legs || []).length ? window.Viz.chartBtn(spec, label) : '');
  /** Per-leg mini chart button for combo legs. */
  const legChartBtn = (leg, sub) => chartBtnFor({ title: leg.text, sub: sub || '', legs: [leg] }, '📊');

  /** Pick -> Viz.open spec (one leg per combo leg). */
  function vizSpec(pk) {
    const leg = (l, text) => ({ text, player: l.player || null, league: (l.league || (l.team && l.team.league) || (pk.sport || '').split('+')[0] || '').toLowerCase(),
      marketSlug: l.market_id || null, eventSlug: window.Viz.slugFromUrl(l.polymarket_url || l.link || pk.polymarket_url || pk.link), side: l.market_side === 'no' ? 1 : 0,
      question: l.question || null,
      // Snapshot point: the price when the pick was posted (§53), so the chart has something even without live history.
      extraPoints: l.price > 0 && picksData && picksData.updated_at ? [{ t: picksData.updated_at, chance: l.price }] : null });
    const multi = Array.isArray(pk.legs) && pk.legs.length > 0;
    return { title: multi ? (pk.market || pk.side) : (legName(pk.side) || pk.market), sub: pk.event || '',
      legs: multi ? pk.legs.map(l => leg(l, legName(l.desc))) : [leg(pk, legName(pk.side) || pk.market)] };
  }
  const shareBtn = id => `<button type="button" class="share-btn" data-share="${esc(id)}" aria-haspopup="menu" aria-label="Share">⤴ Share</button>`;
  /** After the Picks list renders: wire Share buttons and handle a ?pick=<id> deep link. */
  let shareAll = {};
  async function afterPicksRender(el, all) {
    shareAll = all;
    el.querySelectorAll('[data-share]').forEach(b => (b.onclick = e => { e.stopPropagation(); const pk = all[b.dataset.share]; if (pk) window.Share.menu(shareInfoPick(pk), b); }));
    // Tap a pick card (not a button/link) -> price chart + prop bet bars pop-up (HANDOFF §48).
    el.querySelectorAll('.card[data-pick-id]').forEach(c => c.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select, details, summary, .tip') || !window.Viz) return;
      const pk = all[c.dataset.pickId]; if (pk) window.Viz.open(vizSpec(pk));
    }));
    if (!pendingPick) return;
    const id = pendingPick;
    const pk = all[id];
    if (pk) {
      const day = pickDayOf(pk, picksData);
      if (picksDay !== day || picksSport) { picksDay = day; picksSport = ''; renderPicks(); return; }
      pendingPick = null;
      const card = el.querySelector(`[data-pick-id="${CSS.escape(id)}"]`);
      if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('pick-hl'); setTimeout(() => card.classList.remove('pick-hl'), 4000); }
    } else {
      pendingPick = null;
      try { const hist = await fetchData('data/pick-history.json'); const h = ((hist && hist.picks) || []).find(x => x.id === id); if (h) openHistSlip(h); else toast('That pick is no longer on the board.'); } catch (e) { /* ignore */ }
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }

  function pickCard(pk, cat, sec) {
    const P = STR.picks;
    const isMulti = Array.isArray(pk.legs) && pk.legs.length > 0;
    const action = pk.action || (pk.stake_units > 0 ? 'bet' : 'skip');
    const edge = typeof pk.edge === 'number' ? pk.edge : (typeof pk.fair === 'number' && typeof pk.price === 'number' ? C.edgePts(pk.fair, pk.price) : null);
    // Plain money lines (no tiles). Combo: "If all 3 win: your $5 turns into
    // $23" (frame of reference only; the minimum-payout line was removed in §54).
    // Single: "Bet $10 → get $25 back", tap line, spread note, deal word,
    // "Vegas +150 (Bovada)" or "Polymarket US price: +150" · "Cheaper on Kalshi (+156)".
    const st = exStake();   // §54: frame of reference with the user's own standard bet, not a suggested size
    const multX = pk.quoted_multiple || pk.est_multiple;
    const sp = PL.splitTap(pk.side || '');
    const deal = PL.dealWord(edge);
    // Lottery tickets (HANDOFF §44): extra "$1 → $X · $10 → $Y", combined American odds and "1 in N".
    const lotto = sec === 'lottery' && multX > 0
      ? `<div class="lotto-line"><b>${esc(cash(1))} → ${esc(cash(multX))}</b> · ${esc(cash(10))} → ${esc(cash(10 * multX))} · <b>+${Math.round((multX - 1) * 100).toLocaleString('en-US')}</b><div class="small muted">${esc(STR.picks.lottoFun)}</div></div>`
      : '';
    const moneyHtml = lotto + (isMulti
      ? `${multX > 0 ? `<div class="pay-big">${esc(STR.plain.ifAllWin(pk.legs.length, cash(st), cash(st * multX)))} ${tip('ourPayout')}</div>` : ''}
         `
      : `${isC(pk.price) ? `<div class="pay-big">${esc(betGetText(appPrices(pk, bookPrices(pk)).mine.c))} ${tip('payout')}</div>` : ''}
         ${tapHtml(sp)}${spreadHtml((pk.side || '') + ' ' + (pk.market || ''), pk)}
         ${deal ? `<div class="deal deal-${deal} small">${esc(STR.plain.deal[deal])} ${tip('advantage')}</div>` : ''}
         ${priceLineHtml(pk, bookPrices(pk), true)}`);
    const teams = (pk.teams || []).map(teamRef);
    return `<div class="card ${action === 'skip' ? 'skip' : ''} ${sec === 'lottery' ? 'lotto' : ''}" data-pick-id="${esc(pk.id || '')}">
      <div class="pick-head">
        <div class="pick-id">${teams.length ? `<span class="logos">${T.badges(teams, 30)}</span>` : ''}<div>
          ${/* Combos: the tier name ("Small payout · 3 picks") is the title; the legs list below says what's in it. */ ''}
          <div class="pick-title">${esc(isMulti ? pk.market || pk.side : sp.title || pk.market)}</div>
          <div class="pick-sub">${!isMulti && pk.market && pk.side ? posText(pk.market, pk) + ' · ' : ''}${esc(pk.event || '')}</div>
        </div></div>
        <span class="pick-actions">${P.badge[action] ? `<span class="badge ${esc(action)}">${esc(P.badge[action])}</span>` : ''}${pk.id ? shareBtn(pk.id) : ''}${vizOn() ? chartBtnFor(vizSpec(pk)) : ''}</span>
      </div>
      ${evalBlock(pk, sec || 'singles')}
      ${moneyHtml}
      ${isMulti ? `<ul class="legs">${pk.legs.map((l, i) => `<li>${l.team ? T.badge(teamRef(l.team), 20) : ''}${plainLegHtml(l, i === 0)}${vizOn() ? legChartBtn(vizSpec({ ...pk, legs: [l] }).legs[0], pk.event) : ''}${ocDiv(l.market_id, l.market_side, l.price, l.desc, l.player)}</li>`).join('')}</ul>` : ''}
      ${/* PL.noCents: any "41¢" the daily job wrote shows as American odds */ ''}
      ${lineupHtml(pk.lineup_note)}
      ${pk.pending_news ? `<div class="news">⏳ <b>${esc(P.news)}</b> ${esc(PL.neutral(PL.noCents(pk.pending_news)))}</div>` : ''}
      ${pk.verify_note ? `<div class="verify">⚠️ ${esc(PL.neutral(PL.noCents(pk.verify_note)))}</div>` : ''}
      ${pk.reasoning ? `<div class="reason">${esc(PL.neutral(PL.noCents(pk.reasoning)))}</div>` : ''}
      <div class="pick-actions card-actions">
        ${openButton(pk, pk.side || pk.event)}
        <button class="btn btn-sm btn-primary" data-load-pick="${esc(pk.id)}" data-cat="${esc(cat)}">${esc(P.toCalc)}</button>
        ${playable(pk) ? `<button class="btn btn-sm btn-play" data-play-pick="${esc(pk.id)}">${esc(STR.play.cardBtn)}</button>` : ''}
      </div>
    </div>`;
  }

  /**
   * Lineup note from the noon / 4 PM lineup check (scripts/update-picks.mjs
   * `lineup`, HANDOFF §34): green "in", orange "at risk", red "out", plus
   * where the news came from and when it was checked (Central time).
   * @param {{status:string,text:string,source:string,source_url?:string,checked_at:string}|null} n
   */
  function lineupHtml(n) {
    if (!n || !n.text) return '';
    const L = STR.plain.lineup || {};
    const icon = { confirmed: '✅', at_risk: '⚠️', out: '⛔' }[n.status] || 'ℹ️';
    const when = n.checked_at ? new Date(n.checked_at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT' : '';
    const src = n.source_url ? `<a href="${esc(n.source_url)}" target="_blank" rel="noopener">${esc(n.source)}</a>` : esc(n.source || '');
    return `<div class="lineup lineup-${esc(n.status)}">${icon} <b>${esc((L.label || {})[n.status] || 'Lineup:')}</b> ${esc(PL.noCents(n.text))}
      <span class="lineup-src">${esc(L.source || 'Source:')} ${src}${when ? ` · ${esc(when)}` : ''}</span></div>`;
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
  // ------------------------------------------------- picks view toggle
  // Two views on the Picks tab: "Today's Picks" (#picks) | "Live Bets 🔴" (#live).
  // Remembered in localStorage (betdash_prefs.picksView) and linkable by hash.
  // The Live Bets view is RICHIE'S AREA (HANDOFF §32): this file only draws the
  // toggle and hands him an empty container; js/live-bets.js fills it.
  let picksView = null;
  const savedView = () => (S.getPrefs().picksView === 'live' ? 'live' : 'picks');

  /** Picks tab entry point: toggle on top, then the chosen view. */
  function renderPicks() {
    const tab = $('#tab-picks');
    if (!picksView) picksView = savedView();
    const btn = (v, label) => `<button type="button" class="${picksView === v ? 'on' : ''}" data-picks-view="${v}" aria-pressed="${picksView === v}">${esc(label)}</button>`;
    tab.innerHTML = `<div class="view-toggle" role="group" aria-label="${esc(STR.live.group)}">${btn('picks', STR.live.today)}${btn('live', STR.live.live)}</div><div id="picks-view"></div>`;
    tab.querySelectorAll('[data-picks-view]').forEach(b => (b.onclick = () => go(b.dataset.picksView)));
    if (picksView === 'live') {
      // Richie's container. Keep this tie-in tiny: one div + one call.
      // Below Richie's container: OUR "Live Bets record" (Reed: it lives here, never on
      // the Record tab, and never as a new bottom tab). Pablo's files stay untouched.
      $('#picks-view').innerHTML = '<div id="live-bets-root" class="live-bets-root"></div><section id="live-record-root" class="live-record-root"></section>';
      fetchData('data/live-record.json').catch(() => null).then(rec => { const box = $('#live-record-root'); if (box) box.innerHTML = liveRecordHtml(rec); });
      if (window.LiveBets && typeof LiveBets.render === 'function') LiveBets.render($('#live-bets-root'));
      [0, 1500, 4000].forEach(ms => setTimeout(() => { paintLiveBadges(); paintLiveToast(); }, ms));   // Richie's view updates its seen key -> badge clears
      return;
    }
    paintLiveBadges(); paintLiveToast();
    return renderTodayPicks();
  }

  async function renderTodayPicks() {
    const el = $('#picks-view');
    el.innerHTML = `<h2>${esc(STR.picks.title)}</h2><p class="muted">${esc(STR.loading)}</p>`;
    let predFile = null;
    try {
      [picksData, bookOdds, predFile] = await Promise.all([
        fetchData('data/picks.json'),
        fetchData(CFG.bookOddsPath || 'data/book-odds.json').catch(() => null),   // optional
        fetchData('data/predictions.json').catch(() => null),                     // optional
        window.Positions.load(),                                                   // optional: player position badges
        Promise.race([window.Picker.loadIndex().catch(() => {}), new Promise(r => setTimeout(r, 1500))])
      ]);
    } catch (e) {
      el.innerHTML = `<h2>${esc(STR.picks.title)}</h2><p class="error">${esc(STR.picks.loadError)}</p>`;
      return;
    }
    // "Refresh prices" result (js/live-picks.js) wins over the file it was
    // made from, so live prices survive re-renders (day/sport chips).
    if (livePx && livePx.base === picksData.updated_at) picksData = livePx.doc;
    const d = picksData, sec = d.sections || {};
    gamePreds = [...(sec.predictions || []), ...((predFile && predFile.predictions) || [])];
    // Day switcher (Today / Tomorrow): picks.json may hold more than one
    // slate. A pick's day is its own slate_date, else the file's slate_date.
    const days = pickDays(d);
    if (!days.includes(picksDay)) picksDay = defaultPickDay(days);
    // Sport chips (our sports from config.js, only those with picks that day).
    // A combo's sport is "NBA + NFL", so it shows under each of its sports.
    const sportsOf = it => String(it.sport || '').split('+').map(x => x.trim()).filter(Boolean);
    const inDay = it => !days.length || pickDayOf(it, d) === picksDay;
    const order = (window.APP_CONFIG && APP_CONFIG.sports) || [];
    const daySports = [...new Set(Object.values(sec).flatMap(l => (l || []).filter(inDay).flatMap(sportsOf)))]
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    if (picksSport && !daySports.includes(picksSport)) picksSport = '';
    const onDay = it => inDay(it) && (!picksSport || sportsOf(it).includes(picksSport));
    const isFileDay = !days.length || picksDay === d.slate_date;   // notes are written for the file's own slate
    const title = !days.length || picksDay === todayCT() ? STR.picks.title : picksDay === tomorrowCT() ? STR.picks.titleTomorrow : STR.picks.titleDay;
    let html = `<h2>${esc(title)}</h2>
      <div class="updated">${esc(STR.picks.updated(dayWords(picksDay || d.slate_date || ''), fmtTime(d.updated_at)))}</div>
      <div class="px-refresh"><button type="button" class="btn btn-sm" id="picks-refresh">${esc(STR.calc.refresh)}</button>
        <span id="picks-px-status" class="muted small">${livePx && livePx.base === d.updated_at ? esc(livePx.msg) : ''}</span></div>
      ${days.length > 1 ? `<div class="chips pick-days" role="group" aria-label="${esc(STR.picks.dayGroup)}">${days.map(day =>
        `<button type="button" class="chip ${day === picksDay ? 'on' : ''}" data-pick-day="${esc(day)}" aria-pressed="${day === picksDay}">${esc(dayWords(day, true))} <span class="muted small">(${countOnDay(d, day)})</span></button>`).join('')}</div>` : ''}
      ${daySports.length > 1 ? `<div class="chips pick-sports" role="group" aria-label="${esc(STR.picks.sportGroup)}">${['', ...daySports].map(s =>
        `<button type="button" class="chip ${s === picksSport ? 'on' : ''}" data-pick-sport="${esc(s)}" aria-pressed="${s === picksSport}">${esc(s || STR.picks.allSports)}</button>`).join('')}</div>` : ''}
      ${isFileDay ? (d.notes || []).map(n => `<div class="verify">${esc(PL.noCents(n))}</div>`).join('') : ''}
      ${riskLegend()}`;
    for (const [key, cat] of PICK_SECTIONS) {
      const items = (sec[key] || []).filter(onDay);
      // Another day with nothing in this section: skip it (keeps the phone view short).
      if (!items.length && days.length > 1 && !isFileDay) continue;
      html += `<h3>${esc(STR.picks.sections[key])}</h3>`;
      if (!items.length) { html += `<div class="section-empty">${esc(STR.picks.empty)}</div>`; continue; }
      html += items.map(it => (key === 'predictions' ? predictionCard(it) : pickCard(it, cat, key))).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-load-pick]').forEach(b => (b.onclick = () => loadPickIntoCalc(b.dataset.loadPick, b.dataset.cat)));
    el.querySelectorAll('[data-play-pick]').forEach(b => (b.onclick = () => playPick(b.dataset.playPick)));
    $('#picks-refresh').onclick = refreshPickPrices;
    el.querySelectorAll('[data-pick-day]').forEach(b => (b.onclick = () => { picksDay = b.dataset.pickDay; renderPicks(); }));
    el.querySelectorAll('[data-pick-sport]').forEach(b => (b.onclick = () => { picksSport = b.dataset.pickSport; renderPicks(); }));
    const all = {};
    for (const [key] of PICK_SECTIONS) if (key !== 'predictions') (sec[key] || []).forEach(it => it && it.id && (all[it.id] = it));
    afterPicksRender(el, all);
  }

  // ------------------------------------------------- Picks "Refresh prices" (HANDOFF §37)
  /** Last live re-price: {base: picks.json updated_at it came from, doc, msg}. */
  let livePx = null;

  /**
   * Re-price the pick cards with live Polymarket US prices, straight from the
   * public gateway in the browser (CORS-open, no key). If no price comes back
   * (network/CORS), fall back to re-loading the latest committed picks.json
   * and say when that was last updated. Vegas lines stay from committed data.
   */
  async function refreshPickPrices() {
    const btn = $('#picks-refresh'), st = $('#picks-px-status'), P = STR.picks;
    if (btn) btn.disabled = true;
    if (st) st.textContent = P.pxLoading;
    let fresh;
    try { fresh = await fetchData('data/picks.json'); } catch (e) { fresh = picksData; }
    const r = await window.LivePicks.reprice(fresh, (id, side) => window.Picker.livePrice(id, side)).catch(() => null);
    if (r && r.ok) livePx = { base: fresh.updated_at, doc: r.doc, msg: P.pxLive(fmtTime(r.at), r.skipped) };
    else livePx = { base: fresh.updated_at, doc: fresh, msg: P.pxSaved(fmtTime(fresh.updated_at)) };
    toast(r && r.ok ? STR.calc.refreshed : STR.calc.refreshFail);
    renderTodayPicks();
  }

  // ------------------------------------------------- picks day switcher
  // picks.json can carry tomorrow's picks next to today's (each with its own
  // slate_date, see HANDOFF §23). The Picks tab shows one day at a time.

  /** Selected day on the Picks tab (YYYY-MM-DD), kept while the page is open. */
  let picksDay = null;
  /** Selected sport chip on the Picks tab ('' = all sports). */
  let picksSport = '';

  /** Today's date in Central time, YYYY-MM-DD. */
  const todayCT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

  /** A pick's day: its own slate_date, else the file's. */
  const pickDayOf = (it, doc) => (it && /^\d{4}-\d{2}-\d{2}$/.test(it.slate_date || '') ? it.slate_date : doc.slate_date);

  /** Sorted distinct days in the file ([] when there's no slate_date at all). */
  function pickDays(doc) {
    const set = new Set();
    Object.values(doc.sections || {}).forEach(list => (list || []).forEach(it => { const day = pickDayOf(it, doc); if (day) set.add(day); }));
    if (!set.size && doc.slate_date) set.add(doc.slate_date);
    return [...set].sort();
  }

  /** Default day: today if it has picks, else the next day that does, else the latest. */
  function defaultPickDay(days) {
    const t = todayCT();
    return days.includes(t) ? t : days.find(x => x > t) || days[days.length - 1] || null;
  }

  /** Number of pick cards (all sections) on a day. */
  const countOnDay = (doc, day) => Object.values(doc.sections || {}).reduce((n, list) => n + (list || []).filter(it => pickDayOf(it, doc) === day).length, 0);

  /** Tomorrow's date in Central time, YYYY-MM-DD. */
  function tomorrowCT() {
    const tm = new Date(todayCT() + 'T12:00:00Z'); tm.setUTCDate(tm.getUTCDate() + 1);
    return tm.toISOString().slice(0, 10);
  }

  /**
   * "Today, Mon, Oct 19" / "Tomorrow, Tue, Oct 20" / "Wed, Oct 21" for a
   * YYYY-MM-DD day. short = no weekday ("Today, Oct 19"), for the chips.
   */
  function dayWords(day, short) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return day || '';
    const opts = short ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };
    const words = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', opts);
    if (day === todayCT()) return STR.picks.dayToday(words);
    if (day === tomorrowCT()) return STR.picks.dayTomorrow(words);
    return words;
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
      teams: o.team ? [teamRef(o.team)] : (pk.teams || []).map(teamRef), asOf: picksData.updated_at, live: false,
      player: o.player || null, playerTeam: o.player_team || null, league: o.league || null,   // position badge
      startTime: GT.valid(o.start_time) ? o.start_time : GT.valid(pk.start_time) ? pk.start_time : null // else looked up from the snapshot in legStart()
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
      stake: ''   // §54: no suggested stake; the user types their own
    });
    calc.legs = GT.sortLegs(calc.legs, legStart);
    go('calc');
    toast(STR.picks.loaded);
    // Snapshot index may still be loading: once it's there, fill start times and re-sort.
    window.Picker.loadIndex().then(() => { calc.legs = GT.sortLegs(calc.legs, legStart); if ($('#slip')) renderSlip(); }).catch(() => {});
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
      <button class="btn btn-sm" id="c-clear" style="margin-top:10px">${esc(K.clear)}</button>
      <div class="play-calc card">
        <div class="play-tag">${esc(STR.play.banner)}</div>
        <h3>${esc(STR.play.calcTitle)}</h3>
        <label class="field"><span>${esc(STR.play.calcStake)}</span><input id="p-stake" inputmode="numeric" value="${esc(String(playStake))}"></label>
        <div id="p-line" class="small"></div>
        <button class="btn btn-play btn-xl" id="p-bet"></button>
      </div>`;
    picker = window.Picker.create($('#picker-root'), { onAdd: addPickedLeg, fmt: fmtP, pay: payShort });
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
    $('#p-stake').oninput = e => { playStake = parseInt(e.target.value, 10) || 0; updatePlayLine(); };
    $('#p-bet').onclick = playFromCalc;
    $('#c-clear').onclick = () => { calc = freshCalc(); renderCalc(); };
    renderSlip();
  }

  // ---------------------------------------------------------------- game start times
  //
  // Every leg shows when its game starts ("Mon Oct 19 · 7:08 PM CT ·
  // Starts in 2h"). Source order: leg.startTime (stored by the picker) ->
  // snapshot lookup by game/market id (then stored on the leg) -> nothing.
  // Formatting and lookup rules: js/gametime.js.

  /**
   * Start time of a leg, filling leg.startTime from the snapshot when found.
   * @param {object} l slip or saved leg (mutated: startTime) @returns {string|null} ISO
   */
  function legStart(l) {
    if (!l) return null;
    if (GT.valid(l.startTime)) return l.startTime;
    const t = window.Picker.startTimeFor(l);
    if (t) l.startTime = t;
    return t || null;
  }

  /**
   * One line: "🕒 Mon Oct 19 · 7:08 PM CT · Starts in 2h". '' when unknown.
   * @param {object} l leg @param {boolean} withHint add the countdown (open slips/bets only)
   */
  function legWhen(l, withHint) {
    const iso = legStart(l);
    if (!iso) return '';
    const h = withHint ? GT.hint(iso, Date.now(), STR.gameTime) : '';
    const started = h === STR.gameTime.started;
    return `<div class="leg-when small"><span aria-hidden="true">🕒</span> ${esc(GT.format(iso))}${h ? ` · <span class="${started ? 'warn-text' : 'muted'}">${esc(h)}</span>` : ''}</div>`;
  }

  /** Picker callback: add a leg (slip stays in game order), then fetch its live price. */
  function addPickedLeg(leg) {
    calc.legs.push(leg);
    calc.legs = GT.sortLegs(calc.legs, legStart);
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
        <button class="btn btn-sm btn-danger remove" data-rm="${i}" aria-label="${esc(K.remove)}">✕</button>${l.manual ? '' : legChartBtn(vizLeg(l))}
        <div class="leg-top">${l.teams && l.teams.length ? `<span class="logos">${T.badges(l.teams, 28)}</span>` : platformBadge(l.platform)}
          ${l.manual ? `<input class="l-desc" placeholder="${esc(K.legDescPh)}" value="${esc(l.desc)}" aria-label="${esc(K.legDesc)}">` : `<div class="leg-desc"><b>${legText(l)}</b>${tapHtml(PL.splitTap(l.desc))}${spreadHtml(PL.splitTap(l.desc).title, l)}${l.eventTitle ? `<div class="muted small">${esc(l.eventTitle)}</div>` : ''}${legWhen(l, true)}</div>`}
        </div>
        ${l.manual ? legWhen(l, true) : ''}
        <div class="leg-grid">
          <select class="l-plat" aria-label="${esc(K.legPlatform)}">${known ? '' : `<option selected>${esc(l.platform)}</option>`}${PLATFORMS.map(p => `<option ${p.name === l.platform ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <input class="l-price" inputmode="text" placeholder="${esc(K.legPricePh)}" value="${esc(l.price)}" aria-label="${esc(K.legPrice)}">
        </div>
        <div class="leg-hint"></div>
        <div class="leg-am small muted" hidden><span class="am-t"></span> ${tip('americanOdds')}</div>
        <div class="leg-cheaper small"></div>
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
      // Plain: "Bet $10 → get $11.76 back · Wins about 8 out of 10 times" (no "x", no %).
      h.textContent = l.price ? (ok ? `${betGetText(ok.p * 100) || fmtP(ok.p * 100)} · ${chanceText(ok.p)}` : K.cantRead) : '';
      h.className = 'leg-hint' + (l.price && !ok ? ' error' : '');
      // Small price line: "Vegas -174 (BetMGM)" or "Polymarket US price: -170" (only when the typed price is readable).
      const am = $('.leg-am', div);
      if (am) {
        am.hidden = !ok;
        if (ok) $('.am-t', am).textContent = vegasText(l.marketId, l.side) || STR.plain.appOdds(l.platform, fmtP(ok.p * 100));   // Vegas, else the typed price as +/- odds
      }
      // Kalshi only when it's cheaper than the price typed for this leg.
      const ch = $('.leg-cheaper', div);
      if (ch) ch.textContent = ok && l.platform !== 'Kalshi' && isC(l.kalshiPrice) && l.kalshiPrice < ok.p * 100 ? STR.plain.cheaperOn('Kalshi', fmtP(l.kalshiPrice)) : '';
    });
    const kpi = (k, v, cls = '', tipKey = '') => `<div class="kpi"><div class="k">${esc(k)} ${tipKey ? tip(tipKey) : ''}</div><div class="v ${cls}">${v}</div></div>`;
    if (!$('#calc-out')) return;
    // Whole-slip line: the stake typed below (else the standard bet) × the app's
    // quoted payout when typed, else our estimate from the leg prices.
    // Plain sentences instead of number tiles:
    //   "If all 3 win: your $5 turns into $23.40" (at these prices)
    //   "All 3 win about 1 in 4 times ●●○○○○○○○○"
    const n = r.parsed.filter(Boolean).length;
    const st = r.stake || exStake(), x = r.quoted || r.est;
    $('#calc-out').innerHTML = r.est
      ? `<div class="pay-big">${esc(n > 1 ? STR.plain.ifAllWin(n, cash(st), cash(st * x)) : STR.plain.ifWins(cash(st), cash(st * x)))}${!r.quoted ? ` <span class="muted small">(${esc(STR.pay.slipNote)})</span>` : ''} ${tip('howPrices')}</div>
         <div class="chance-line">${chanceHtml(r.hit, n)} ${tip('chance')}</div>`
      : '';
    const unit = S.getProfile().unit;
    $('#calc-out2').innerHTML =
      kpi(K.outGap, r.gap === null ? STR.none : (r.gap > 0 ? '+' : '') + pct(r.gap, 1), sign(r.gap), 'gap') +
      kpi(K.outProfit, r.ev10 === null ? STR.none : money(r.ev10), sign(r.ev10), 'profit') +
      kpi(K.outReturn, money(r.payout)) +
      kpi(K.outSize, r.stake ? `${money(r.stake)} <span class="small muted">(${esc(STR.unitWords(+(r.stake / unit).toFixed(2)))})</span>` : STR.none, '', 'unit');
    updatePlayLine();
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
        teams: l.teams || [], link: l.link || null, kalshiUrl: l.kalshiUrl || null, asOf: l.asOf || null,
        startTime: legStart(l), // game start ISO or null (never made up)
        player: l.player || null, playerTeam: l.playerTeam || null, league: l.league || null // position badge
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

  /**
   * Legs of a saved bet with logos and game start, earliest game first.
   * @param {object} b Bet @param {boolean} [withHint] countdown (open bets)
   */
  function legsHtml(b, withHint) {
    return GT.sortLegs(b.legs, legStart).map(l => `<div class="bleg">${legChartBtn(vizLeg(l))}${l.teams && l.teams.length ? T.badges(l.teams, 20) : platformBadge(l.platform)}<span class="bleg-txt">${legText(l)}${typeof l.p === 'number' && l.p > 0 && l.p < 1 ? `<span class="payx">${esc(betGetText(l.p * 100))} · ${esc(chanceText(l.p))}</span>` : ''}${legWhen(l, withHint)}</span></div>`).join('');
  }

  /**
   * Older saved bets have no leg start times: look them up once the
   * snapshot index is loaded, store them, and redraw if any were found.
   * Side effect: localStorage (S.upsertBet).
   */
  function backfillBetTimes() {
    window.Picker.loadIndex().then(() => {
      let changed = 0;
      S.getBets().forEach(b => {
        const missing = (b.legs || []).filter(l => !GT.valid(l.startTime));
        if (!missing.length) return;
        const before = missing.length;
        missing.forEach(legStart);
        if (missing.some(l => GT.valid(l.startTime))) { S.upsertBet(b); changed += before; }
      });
      if (changed && !$('#tab-bets').hidden) renderBets();
    }).catch(() => {});
  }

  /** My bets tab. */
  // ------------------------------------------------- my bets view toggle
  let betsView = null;
  const savedBetsView = () => (S.getPrefs().betsView === 'play' ? 'play' : 'bets');

  /** My Bets tab: toggle "My bets" | "Play money 🎮", then that view. */
  function renderBets() {
    const tab = $('#tab-bets'), X = STR.play;
    if (!betsView) betsView = savedBetsView();
    const btn = (v, label) => `<button type="button" class="${betsView === v ? 'on' : ''}" data-bets-view="${v}" aria-pressed="${betsView === v}">${esc(label)}</button>`;
    tab.innerHTML = `<div class="view-toggle" role="group" aria-label="${esc(X.viewGroup)}">${btn('bets', X.viewMine)}${btn('play', X.viewPlay)}</div><div id="bets-view"></div>`;
    tab.querySelectorAll('[data-bets-view]').forEach(b => (b.onclick = () => go(b.dataset.betsView)));
    return betsView === 'play' ? renderPlay() : renderMyBets();
  }

  function renderMyBets() {
    const B = STR.bets;
    const el = $('#bets-view');
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
        <div class="pick-head"><div><div class="bet-legs">${legsHtml(b, true)}</div>
        <div class="pick-sub">${platformBadge(b.platform.split(' + ')[0])} ${esc(STR.categories[b.category] || b.category)} · ${esc(b.platform)} · ${fmtTime(b.createdAt)}${b.share ? (b.shared ? B.shared : B.sharePending) : ''}</div></div>
        <span class="badge open">${esc(B.status.open)}</span></div>
        <!-- Plain: "If all 3 win: your $5 turns into $23.40" + chance (no "x" multiples) -->
        <div class="pay-big">${esc(b.legs.length > 1 ? STR.plain.ifAllWin(b.legs.length, cash(b.stake), cash(b.stake * b.quotedMultiple)) : STR.plain.ifWins(cash(b.stake), cash(b.stake * b.quotedMultiple)))}</div>
        ${typeof b.hitChance === 'number' ? `<div class="chance-line">${chanceHtml(b.hitChance, b.legs.length)}</div>` : ''}
        <div class="pick-actions card-actions settle-actions">
          <button class="btn btn-sm btn-primary" data-settle="won" data-id="${b.id}">${esc(B.won)}</button>
          <button class="btn btn-sm btn-danger" data-settle="lost" data-id="${b.id}">${esc(B.lost)}</button>
          <button class="btn btn-sm" data-settle="push" data-id="${b.id}">${esc(B.push)}</button>
          <button class="btn btn-sm" data-del="${b.id}">${esc(B.del)}</button>
        </div></div>`).join('') : `<div class="section-empty">${esc(B.openEmpty)}</div>`}
      <h3>${esc(B.settledTitle)}</h3>
      ${settled.length ? `<div class="table-wrap"><table><tr><th>${esc(B.bet)}</th><th>${esc(B.result)}</th><th class="num">${esc(B.amount)}</th><th class="num">${esc(B.plCol)}</th><th></th></tr>
        ${settled.map(b => { const pl = C.profit(b.stake, b.quotedMultiple, b.status); return `<tr><td><div class="bet-legs">${legsHtml(b)}</div><div class="muted small">${esc(STR.categories[b.category] || '')} · ${esc(STR.plain.youGet(cash(b.stake * b.quotedMultiple)))}</div></td>
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
    backfillBetTimes();
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
   *   Price vs. <your app> | Total
   * (Owner feedback: don't stack the % under the count.) Details:
   *   1. Bets you logged: shared bet-log records (count + average payout gap
   *      vs. our multiplied estimate)
   *   2. From odds feed: data/book-odds.json comparisons (count + average
   *      cents difference vs. the user's "My platform", BetCalc.compareToBaseline;
   *      bets with no price from that app are left out). The user's app is
   *      listed first and labelled "Your app (we compare others to this)";
   *      with Kalshi picked, Polymarket US is an ordinary compared row. Until the feed is switched on
   *      (status !== 'active') every row says "Coming soon, waiting on odds
   *      feed". Platforms with oddsApi:null
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
    let html = `<h3>${esc(R.platTitle)} ${tip('howPrices')}</h3><p class="muted small">${esc(R.platNote)} ${esc(STR.pay.diffNote)}</p>`;
    if (!log) html += `<p class="error">${esc(R.logError)}</p>`;
    const recs = (log && log.records) || [];
    const feedOn = !!(odds && odds.status === 'active');
    // Baseline = the user's "My platform": every diff is "that app minus yours".
    const me = myPlatform();
    const sum = C.platformSummary(recs, feedOn ? odds.comparisons : [], CFG.platforms, me.id);
    // One value per cell; a dash when there's nothing yet. Feed status notes
    // (baseline / paid plan / not in feed / coming soon) sit under the app name.
    const dash = `<span class="muted">${esc(R.dash)}</span>`;
    const gapCell = l => (l.n ? `<span class="${sign(l.avgGap)}">${esc(pct(l.avgGap, 1))}</span>` : dash);
    const diffCell = f => {
      if (!f.n) return dash;
      const d = Math.round(f.avgDiff * 10) / 10;
      // app costs MORE than the user's app = you win less = red
      // Plain words, no cents: "pays less" / "pays a bit more" / "same"
      return `<span class="${d > 0 ? 'neg' : d < 0 ? 'pos' : ''}">${esc(d > 0 ? R.diffMore(d) : d < 0 ? R.diffLess(Math.abs(d)) : R.diffSame)}</span>`;
    };
    const feedNote = (p, f) => {
      if (p.id === me.id) return R.feedBaseline;
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
        <span>${esc(R.colDiff(me.name))} ${tip('colDiff')}</span>
        <span>${esc(R.colTotal)} ${tip('colTotal')}</span>
      </div>
      ${CFG.platforms.map((p, i) => [p, sum.rows[i]]).sort((a, b) => (b[0].id === me.id) - (a[0].id === me.id)).map(([p, row]) => block(p, row)).join('')}
      ${sum.other.n ? block(Object.assign({}, CFG.otherPlatform, { oddsApi: null }), { logged: sum.other, feed: { n: 0, avgDiff: null }, total: sum.other.n }) : ''}
    </div>`;
    if (log) html += `<p class="muted small">${esc(R.platLag(recs.length))}</p>`;
    return html;
  }

  /** Record tab: prediction record + per-platform price comparison (all 10 apps). */
  // ---------------------------------------------------------------- Fade Trent
  /**
   * "Fade Trent" tab: @BookitWithTrent's X picks from data/trent-picks.json,
   * graded on real final scores (HANDOFF §28). Math in js/trent.js. All text
   * from the file goes through esc(); links through safeUrl().
   */
  async function renderTrent() {
    const X = STR.trent;
    const el = $('#tab-trent');
    el.innerHTML = `<h2>${esc(X.title)}</h2><p class="muted">${esc(STR.loading)}</p>`;
    let doc;
    try { doc = await fetchData('data/trent-picks.json'); } catch (e) { el.innerHTML = `<h2>${esc(X.title)}</h2><p class="error">${esc(X.loadError)}</p>`; return; }
    const TR = window.Trent;
    let ov = null; try { ov = await fetchData('data/trent-overrides.json'); } catch (e) { /* none yet */ }
    const picks = TR.applyOverrides(Array.isArray(doc.picks) ? doc.picks : [], ov);   // dev answers (§58)
    // Dev-only (?dev=1): open clarification questions. Read-only, never shown to normal users.
    const devQs = /[?&]dev=1\b/.test(location.search) ? TR.openQuestions(picks) : [];
    const devHtml = devQs.length ? `<div class="card dev-qs"><b>Dev: open questions (${devQs.length})</b>${devQs.map(q => `<div class="small"><code>${esc(q.id)}</code> ${esc(q.pick)}<br>${esc(q.question)}${q.issue ? ` · #${esc(String(q.issue))}` : ''}</div>`).join('')}<div class="small muted">Answer: node scripts/trent-picks.mjs clarify &lt;id&gt; --set key=value --answer "…" --commit</div></div>` : '';
    const s = TR.summary(picks), a = s.all;
    const rec = x => `${x.w}-${x.l}-${x.p}`;
    const u = n => `<span class="${sign(n)}">${n > 0 ? '+' : ''}${esc(String(n))}u</span>`;
    const kpi = (k, v) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
    const day = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
    const link = (href, txt) => { const h = safeUrl(href); return h ? `<a href="${esc(h)}" target="_blank" rel="noopener">${esc(txt)}</a>` : ''; };
    const card = p => {
      const r = p.unclear ? 'unclear' : p.result, f = TR.fadeResult(p);
      return `<div class="card trent-pick ${p.unclear ? 'unclear' : ''}">
        <div class="tp-top"><div><div class="tp-pick">${esc(p.pick)} ${vizOn() && window.Viz.parseProp({ text: p.pick, league: (p.league || '').toLowerCase() }) ? legChartBtn({ text: p.pick, league: (p.league || '').toLowerCase() }, p.game) : ''}</div>
          <div class="pick-sub">${esc(p.league)} · ${esc(p.game)} · ${esc(day(p.posted_at))}</div></div>
          <span class="badge ${r === 'win' ? 'won' : r === 'loss' ? 'lost' : 'push'}">${esc(X.result[r] || r)}</span></div>
        <div class="small">${[p.units ? X.unitsShown(p.units) : '', p.odds ? X.odds(p.odds) : ''].filter(Boolean).map(esc).join(' ')}${f ? ` <span class="fade-${esc(f)}">· ${esc(X.fadeWould(f))}</span>` : ''}</div>
        ${p.final_score ? `<div class="small muted">${esc(X.final(p.final_score))} ${link(p.graded_from, X.source)}</div>` : ''}
        ${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}
        ${/* Big tappable button to the exact tweet (x.com links open the X app on phones). */
          safeUrl(p.url) ? `<a class="btn x-btn" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">${esc(X.post)}</a>` : ''}
      </div>`;
    };
    const leagues = Object.entries(s.byLeague).filter(([, v]) => v.w + v.l + v.p);
    el.innerHTML = `<h2>${esc(X.title)} ${tip('fadeTrent')}</h2>${devHtml}
      <p class="muted small">${esc(X.intro(doc.account || 'BookitWithTrent'))}</p>
      <div class="kpis">${kpi(X.record, rec(a))}${kpi(X.winPct, a.winPct === null ? X.none : esc(a.winPct + '%'))}${kpi(X.units, u(a.units))}${kpi(X.fade, rec({ w: a.fw, l: a.fl, p: a.fp }))}</div>
      <p class="muted small">${esc(X.unitsNote(a.unitsN, a.assumed))} ${a.fadeN ? esc(X.fadeUnitsNote((a.fadeUnits > 0 ? '+' : '') + a.fadeUnits + 'u', a.fadeN)) : ''}</p>
      <h3>${esc(X.bySport)}</h3>
      <div class="table-wrap"><table><tr><th>${esc(X.colSport)}</th><th>${esc(X.colRecord)}</th><th class="num">${esc(X.colPct)}</th><th class="num">${esc(X.colUnits)}</th><th>${esc(X.colFade)}</th></tr>
        ${leagues.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${rec(v)}</td><td class="num">${v.winPct === null ? X.none : esc(v.winPct + '%')}</td><td class="num">${u(v.units)}</td><td>${rec({ w: v.fw, l: v.fl, p: v.fp })}</td></tr>`).join('')}</table></div>
      <h3>${esc(X.picksTitle)}</h3>
      <p class="muted small">${esc(X.pending(a.pending))} · ${esc(X.unclear(a.unclear))}${doc.read_from && doc.read_through ? ' · ' + esc(X.read(day(doc.read_from), day(doc.read_through))) : ''}</p>
      ${picks.slice().sort((x, y) => String(y.posted_at).localeCompare(String(x.posted_at))).map(card).join('')}`;
  }

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
    let learnDoc = null;
    try { learnDoc = await fetchData('data/learning.json'); } catch (e) { /* optional: learning loop not run yet */ }
    let hist = null;
    try { hist = await fetchData('data/pick-history.json'); } catch (e) { /* optional: Picks-page history (HANDOFF §40) */ }
    let html = `<h2>${esc(R.title)}</h2>`;
    if (!preds) html += `<p class="error">${esc(R.loadError)}</p>`;
    else {
      const list = preds.predictions || [];
      const cal = calibration(list);
      const kpi = (k, v) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
      // Units for game winners: 1u flat at the saved Polymarket price (HANDOFF §41).
      const prices = await Promise.all(list.map(p => (p.result === 'win' ? predPrice(p).then(x => x && x.price).catch(() => null) : Promise.resolve(null))));
      let units = 0, noPrice = 0;
      list.forEach((p, i) => {
        if (p.result === 'loss') units -= 1;
        else if (p.result === 'win') { const c = prices[i]; if (c > 0 && c < 100) units += 100 / c - 1; else noPrice++; }
      });
      html += `<div class="updated">${esc(R.updated(fmtTime(preds.updated_at)))}</div>
        <h3>${esc(R.gameTitle)}</h3>
        ${statBoxes(cal.wins, cal.graded - cal.wins, list.filter(p => p.result === 'pending').length, list.length, units)}
        <p class="muted small">${esc(R.gameUnitsNote)}${noPrice ? ' ' + esc(R.noPriceNote(noPrice)) : ''}</p>
        ${list.length ? `<div class="table-wrap"><table><tr><th>${esc(R.date)}</th><th>${esc(R.pick)}</th><th class="num">${esc(R.chance)}</th><th>${esc(R.result)}</th></tr>
          ${list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(p => `<tr class="tap-row" data-pred="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(R.slip.open(p.pick))}"><td>${esc(p.date)}</td><td>${esc(p.pick)}<div class="muted small">${esc(p.game)}</div></td><td class="num">${esc(p.win_prob)}%</td><td><span class="badge ${p.result === 'win' ? 'won' : p.result === 'loss' ? 'lost' : 'open'}">${esc(R.resultWords[p.result] || p.result)}</span></td></tr>`).join('')}</table></div>` : ''}
        <h4>${esc(R.calTitle)} ${tip('calibration')}</h4>
        ${cal.buckets.length ? `<div class="table-wrap"><table><tr><th>${esc(R.calSaid)}</th><th class="num">${esc(R.calPicks)}</th><th class="num">${esc(R.calAvg)}</th><th class="num">${esc(R.calActual)}</th><th class="num">${esc(R.calOff)}</th></tr>
          ${cal.buckets.map(b => { const avg = b.probSum / b.n / 100, act = b.wins / b.n; return `<tr><td>${b.lo}–${b.lo + 5}%</td><td class="num">${b.n}</td><td class="num">${pct(avg)}</td><td class="num">${pct(act)}</td><td class="num ${sign(act - avg)}">${esc(R.pts(((act - avg) * 100).toFixed(1)))}</td></tr>`; }).join('')}</table></div>`
          : `<div class="section-empty">${esc(R.calEmpty)}</div>`}`;
    }
    html += pickHistoryHtml(hist);
    html += learningCardHtml(learnDoc);
    html += renderPlatformCompare(log, odds);
    el.innerHTML = html;
    // Tap a Picks-page row -> full slip with every leg (HANDOFF §40).
    const hById = {};
    ((hist && hist.picks) || []).forEach(h => (hById[h.id] = h));
    el.querySelectorAll('tr[data-hist]').forEach(tr => {
      const go = () => { const h = hById[tr.dataset.hist]; if (h) openHistSlip(h); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    // Tap (or Enter on) a "Recent picks" row -> open that pick's slip (HANDOFF §39).
    const byId = {};
    ((preds && preds.predictions) || []).forEach(p => (byId[p.id] = p));
    el.querySelectorAll('tr[data-pred]').forEach(tr => {
      const go = () => { const p = byId[tr.dataset.pred]; if (p) openPredSlip(p); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /**
   * Shared stat boxes for both Record sections (HANDOFF §41), same order:
   * Picks That Won (%), Won-Lost, Not Finished, Total Picks, Units Won/Lost.
   * Units only, never dollars.
   */
  function statBoxes(w, l, open, total, units) {
    const R = STR.record, u = Math.round(units * 100) / 100;
    const kpi = (k, v, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
    return `<div class="kpis kpis-5">${kpi(R.accuracy, w + l ? pct(w / (w + l)) : STR.none)}${kpi(R.graded, `${w}-${l}`)}${kpi(R.pending, open)}${kpi(R.total, total)}${kpi(R.unitsBox, `<span class="${sign(u)}">${esc((u > 0 ? '+' : '') + u + 'u')}</span>`, 'kpi-wide')}</div>`;
  }

  /**
   * Saved Polymarket game-winner price (cents, for math only) for one prediction.
   * id "2026-10-19-col-phi" + sport "NHL" -> data/markets/events/nhl-col-phi-2026-10-19.json,
   * market id starting "aec-". Returns {ev, ml, side, price} or null.
   */
  async function predPrice(p) {
    const slug = `${String(p.sport || '').toLowerCase()}-${String(p.id).slice(11)}-${p.date}`;
    const ev = await fetchData(`data/markets/events/${slug}.json`);
    const ab = String(p.pick || '').toLowerCase();
    const ml = ev && (ev.markets || []).find(m => /^aec-/.test(m.id) && (m.yes_team === ab || m.no_team === ab));
    if (!ml) return null;
    const side = ml.yes_team === ab ? 'yes' : 'no';
    return { ev, ml, side, price: side === 'yes' ? ml.yes_ask : ml.no_cost };
  }

  /**
   * Record tab: slip pop-up for one game-winner prediction (HANDOFF §39).
   * Shows matchup, side, our chance, the Polymarket price as American odds
   * (never cents), the Vegas line when we have one, "$10 → $X" using the
   * user's own unit (computed here in the browser, never saved to the repo),
   * the result badge, and a Polymarket link.
   * The price comes from the saved market file data/markets/events/<slug>.json
   * (the game-winner market, ids start with "aec-"). That's the last price we
   * saved, not necessarily the price when the pick was made, so we say so.
   */
  async function openPredSlip(p) {
    const X = STR.record.slip;
    // id "2026-10-19-col-phi" + sport "NHL" -> slug "nhl-col-phi-2026-10-19"
    const slug = `${String(p.sport || '').toLowerCase()}-${String(p.id).slice(11)}-${p.date}`;
    let ev = null;
    try { ev = await fetchData(`data/markets/events/${slug}.json`); } catch (e) { /* no saved market: just skip price lines */ }
    const pickAbbr = String(p.pick || '').toLowerCase();
    const ml = ev && (ev.markets || []).find(m => /^aec-/.test(m.id) && (m.yes_team === pickAbbr || m.no_team === pickAbbr));
    const side = ml ? (ml.yes_team === pickAbbr ? 'yes' : 'no') : null;
    const price = ml ? (side === 'yes' ? ml.yes_ask : ml.no_cost) : null;   // cents, used only for math
    const am = typeof price === 'number' ? C.formatPrice(price, 'american') : null;
    try { if (window.Vegas) await window.Vegas.load(); } catch (e) { /* optional */ }
    const vg = ml && window.Vegas ? window.Vegas.lookup(ml.id, side) : null;
    const stake = exStake();
    const pay = typeof price === 'number' ? C.payout(price, stake) : null;
    const team = ev && (ev.teams || []).find(t => String(t.abbr).toLowerCase() === pickAbbr);
    const link = safeUrl((ev && (ev.polymarket_url || ev.url)) || '');
    const fair = C.formatPrice(Number(p.win_prob), 'american');
    const rWord = STR.record.resultWords[p.result] || p.result;
    const badgeCls = p.result === 'win' ? 'won' : p.result === 'loss' ? 'lost' : 'open';
    const row = (k, v) => (v ? `<div class="slip-row"><span class="muted">${esc(k)}</span><b>${v}</b></div>` : '');
    openSheet(`<div class="tp-top"><div><div class="tp-pick">${esc(X.picked(team ? team.full || team.name : p.pick))}</div>
        <div class="pick-sub">${esc(p.sport)} · ${esc(p.game)} · ${esc(p.date)}</div></div>
        <span class="badge ${badgeCls}">${esc(rWord)}</span></div>
      ${row(X.chance, esc(p.win_prob + '%') + (fair !== '—' ? ` <span class="muted small">(${esc(X.fair(fair))})</span>` : ''))}
      ${row(X.price, am ? esc(am) : '')}
      ${row(X.vegas, vg ? esc(`${vg.p}${vg.book ? ` (${vg.book})` : ''}`) : '')}
      ${pay ? `<div class="slip-pay">${esc(X.pays(stake, pay.pays))}</div><p class="muted small">${esc(X.priceNote)}</p>` : `<p class="muted small">${esc(X.noPrice)}</p>`}
      ${p.projected_score ? row(X.score, esc(p.projected_score)) : ''}
      ${(p.player_projections || []).length ? `<div class="small muted">${esc(X.players)}: ${esc(p.player_projections.join(' · '))}</div>` : ''}
      ${p.reasoning ? `<p class="small">${esc(p.reasoning)}</p>` : ''}
      ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(X.poly)}</a>` : ''}`);
  }

  /* ---------- Picks-page picks on the Record tab (HANDOFF §40) ----------
   * data/pick-history.json = every pick we put on the Picks screen (singles,
   * props, combos, longshots, non-sports), each with legs[]. A leg's
   * `publish` is the price (cents, 0-100) of the side we picked when we
   * posted it; we only use it for math and show American odds, never cents.
   */
  /** Leg text without the "— tap ..." / "— YES" helper bits. */
  const legName = d => String(d || '').split(' — ')[0].replace(/\s*\(tap[^)]*\)/i, '').trim();
  /** Pick name: the single leg, or "3-leg combo: A + B + C". */
  function histName(h) {
    const legs = h.legs || [];
    if (legs.length <= 1) return legName(legs[0] && legs[0].desc);
    return STR.record.hist.combo(legs.length, legs.map(l => legName(l.desc)).join(' + '));
  }
  /** Payout multiple if every leg wins = product of 100/price. null if a price is missing. */
  function histMultiple(h) {
    let m = 1;
    for (const l of h.legs || []) { if (!(l.publish > 0 && l.publish < 100)) return null; m *= 100 / l.publish; }
    return m;
  }
  /** Units won/lost for one graded pick: win = stake × (multiple − 1), loss = −stake. */
  function histUnits(h) {
    const st = Number(h.stake_units) || 0, m = histMultiple(h);
    if (h.result === 'win' && m) return st * (m - 1);
    if (h.result === 'loss') return -st;
    return 0;
  }
  const resBadge = r => `<span class="badge ${r === 'win' ? 'won' : r === 'loss' ? 'lost' : 'open'}">${esc(STR.record.resultWords[r || 'pending'] || r)}</span>`;

  /** "Our Picks-page picks" section: W-L summary (units only) + recent rows. */
  function pickHistoryHtml(doc) {
    // Split by LEG COUNT, not the category label (HANDOFF §42): 1 leg = single, 2+ legs = combo.
    const picks = (doc && doc.picks) || [];
    const singles = picks.filter(h => (h.legs || []).length <= 1), combos = picks.filter(h => (h.legs || []).length > 1);
    const H = STR.record.hist;
    return histSectionHtml(H.singlesTitle, H.singlesIntro, singles) + histSectionHtml(H.combosTitle, H.combosIntro, combos);
  }

  /** One Record section (Single Bets or Combos): 5 stat boxes + tappable rows. */
  function histSectionHtml(title, intro, picks) {
    const H = STR.record.hist;
    if (!picks.length) return `<h3>${esc(title)}</h3><div class="section-empty">${esc(H.none)}</div>`;
    const w = picks.filter(h => h.result === 'win').length, l = picks.filter(h => h.result === 'loss').length;
    const u = Math.round(picks.reduce((a, h) => a + histUnits(h), 0) * 100) / 100;
    const rows = picks.slice().sort((a, b) => String(b.slate_date).localeCompare(String(a.slate_date))).slice(0, 40);
    return `<h3>${esc(title)}</h3><p class="muted small">${esc(intro)}</p>
      ${statBoxes(w, l, picks.length - w - l, picks.length, u)}
      <div class="table-wrap"><table><tr><th>${esc(STR.record.date)}</th><th>${esc(STR.record.pick)}</th><th class="num">${esc(STR.record.chance)}</th><th>${esc(STR.record.result)}</th></tr>
      ${rows.map(h => `<tr class="tap-row" data-hist="${esc(h.id)}" tabindex="0" role="button" aria-label="${esc(STR.record.slip.open(histName(h)))}"><td>${esc(h.slate_date)}</td><td>${esc(histName(h))}<div class="muted small">${esc(h.sport)} · ${esc(H.cat[h.category] || h.category)}</div></td><td class="num">${esc(Math.round(h.hit_prob) + '%')}</td><td>${resBadge(h.result)}</td></tr>`).join('')}</table></div>
      <p class="muted small">${esc(H.unitsNote)}</p>`;
  }

  /** Slip pop-up for one Picks-page pick: every leg with its result + odds. */
  /** Record leg -> Viz leg with snapshot points: price when posted + closing price (§53). */
  function histVizLeg(h, l) {
    const pts = [];
    if (l.publish > 0 && h.published_at) pts.push({ t: h.published_at, chance: l.publish });
    if (l.close > 0 && l.close_at) pts.push({ t: l.close_at, chance: l.close });
    return { ...vizLeg({ desc: l.desc, marketId: l.market_id, side: l.side, eventSlug: l.slug, league: (h.sport || '').toLowerCase() }), extraPoints: pts };
  }
  function openHistSlip(h) {
    const H = STR.record.hist, X = STR.record.slip, stake = exStake(), m = histMultiple(h);
    const legs = (h.legs || []).map(l => {
      const am = l.publish > 0 && l.publish < 100 ? C.formatPrice(l.publish, 'american') : '';
      return `<div class="slip-row"><span>${esc(legName(l.desc))}${am ? ` <span class="muted small">${esc(am)}</span>` : ''}</span><span>${legChartBtn(histVizLeg(h, l))}${resBadge(l.result)}</span></div>${ocDiv(l.market_id, l.side, l.publish, l.desc, null)}`;
    }).join('');
    const total = m ? C.formatPrice(100 / m, 'american') : '';
    const u = histUnits(h);
    setTimeout(() => { const b = document.querySelector('.sheet [data-share-hist]'); if (b) b.onclick = e => { e.stopPropagation(); window.Share.menu(shareInfoHist(h), b); }; }, 0);
    openSheet(`<button type="button" class="share-btn sheet-share" data-share-hist="1" aria-haspopup="menu">⤴ Share</button><div class="tp-top"><div><div class="tp-pick">${esc(histName(h))}</div>
        <div class="pick-sub">${esc(h.sport)} · ${esc(H.cat[h.category] || h.category)} · ${esc(h.slate_date)}</div></div>${resBadge(h.result)}</div>
      ${row2(X.chance, esc(Math.round(h.hit_prob) + '%'))}
      ${total && (h.legs || []).length > 1 ? row2(H.allOdds, esc(total)) : ''}
      ${h.result === 'win' || h.result === 'loss' ? row2(H.unitsRes, `<span class="${sign(u)}">${esc((u > 0 ? '+' : '') + (Math.round(u * 100) / 100) + 'u')}</span>`) : ''}
      <h4>${esc(H.legs((h.legs || []).length))}</h4>${legs}
      ${(h.legs || []).length ? `<div class="chart-row">${chartBtnFor({ title: histName(h), sub: h.sport || '', legs: h.legs.map(l => histVizLeg(h, l)) }, '📊 Charts for this slip')}</div>` : ''}
      ${m ? `<div class="slip-pay">${esc(X.pays(stake, Math.round(stake * m * 100) / 100))}</div><p class="muted small">${esc(H.priceNote)}</p>` : ''}`);
  }
  const row2 = (k, v) => `<div class="slip-row"><span class="muted">${esc(k)}</span><b>${v}</b></div>`;

  /**
   * Bottom sheet pop-up (slides up on phones, centered card on desktop).
   * Closes with the X button, a tap on the dark backdrop, or Esc. Only one
   * open at a time. `inner` must already be escaped HTML.
   */
  function openSheet(inner) {
    closeSheet();
    const wrap = document.createElement('div');
    wrap.className = 'sheet-back';
    wrap.innerHTML = `<div class="sheet card trent-pick" role="dialog" aria-modal="true">
      <button class="sheet-x" type="button" aria-label="${esc(STR.record.slip.close)}">×</button>${inner}</div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) closeSheet(); });
    wrap.querySelector('.sheet-x').addEventListener('click', closeSheet);
    document.addEventListener('keydown', sheetEsc);
    document.body.appendChild(wrap);
    wrap.querySelector('.sheet-x').focus();
  }
  function sheetEsc(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() {
    document.querySelectorAll('.sheet-back').forEach(n => n.remove());
    document.removeEventListener('keydown', sheetEsc);
  }

  /**
   * "How we're learning" card (Record tab, no new tab). Reads data/learning.json
   * from scripts/learn.mjs (HANDOFF §36): sample sizes, calibration, CLV,
   * best/worst categories. Shows only what the file has; never fills in numbers.
   */
  function learningCardHtml(L) {
    const X = STR.record.learn;
    if (!L || !L.sample) return `<div class="card learn-card"><h3>${esc(X.title)} ${tip('learning')}</h3><div class="section-empty">${esc(X.none)}</div></div>`;
    const s = L.sample, min = L.min_samples || 30;
    const kpi = (k, v) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
    const calRows = [...((L.calibration && L.calibration.picks) || []).map(b => ['pick', b]), ...((L.calibration && L.calibration.predictions) || []).map(b => ['game', b])];
    const adj = b => (b.status === 'applied' ? `${b.adjustment_pts > 0 ? '+' : ''}${b.adjustment_pts}` : X.collecting);
    const clv = L.clv && L.clv.n ? X.clv(L.clv.avg_pts, L.clv.beat_close_pct, L.clv.n) : X.clvNone;
    const cats = L.categories || [], byKey = k => cats.find(c => c.key === k);
    const catLine = k => { const c = byKey(k); return c ? `<li>${esc(c.key)}: ${esc(X.catStat(c.w, c.l, c.roi, c.n))}${c.n < min ? ` <span class="muted small">(${esc(X.tooFew)})</span>` : ''}</li>` : ''; };
    return `<div class="card learn-card"><h3>${esc(X.title)} ${tip('learning')}</h3>
      <p class="muted small">${esc(X.intro(min))}</p>
      <div class="kpis">${kpi(X.logged, s.picks_logged)}${kpi(X.gradedPicks, s.picks_graded)}${kpi(X.gradedGames, s.predictions_graded)}${kpi(X.shrink, L.market_shrink && L.market_shrink.status === 'applied' ? esc(String(L.market_shrink.weight)) : esc(X.collecting))}</div>
      <div class="small"><b>${esc(X.clvTitle)}</b> ${esc(clv)}</div>
      <h4>${esc(X.calTitle)}</h4>
      ${calRows.length ? `<div class="table-wrap"><table><tr><th>${esc(X.colWhat)}</th><th class="num">${esc(X.colSaid)}</th><th class="num">${esc(X.colN)}</th><th class="num">${esc(X.colActual)}</th><th class="num">${esc(X.colAdj)}</th></tr>
        ${calRows.map(([w, b]) => `<tr><td>${esc(X.what[w])}</td><td class="num">${b.lo}–${b.hi}</td><td class="num">${b.n}</td><td class="num">${b.actual}</td><td class="num">${esc(adj(b))}</td></tr>`).join('')}</table></div>`
        : `<div class="section-empty">${esc(X.calEmpty)}</div>`}
      <h4>${esc(X.catsTitle)}</h4>
      ${(L.best || []).length ? `<div class="small">${esc(X.best)}</div><ul class="small">${L.best.map(catLine).join('')}</ul><div class="small">${esc(X.worst)}</div><ul class="small">${(L.worst || []).map(catLine).join('')}</ul>`
        : `<div class="section-empty">${esc(X.catsEmpty)}</div>`}
      <p class="muted small">${esc(X.noisy)}${L.updated_at ? ' · ' + esc(STR.record.updated(fmtTime(L.updated_at))) : ''}</p></div>`;
  }

  /**
   * "Live Bets record" (shown in the Live Bets view under #live-bets-root, NOT on the Record tab): every live alert, logged for good and graded on real
   * results (data/live-record.json, written by scripts/grade-live-alerts.mjs,
   * HANDOFF §35). Flat 1 unit per alert. American odds only; no cents/dollars.
   * Data text is untrusted: esc() everything, safeUrl() links.
   */
  function liveRecordHtml(rec) {
    const X = STR.record.live;
    let h = `<h3>${esc(X.title)} ${tip('liveRecord')}</h3>`;
    if (!rec || !Array.isArray(rec.entries)) return h + `<div class="section-empty">${esc(X.none)}</div>`;
    const T = rec.totals || {}, rate = v => (v == null ? '–' : `${v}%`), u = v => `${v > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}u`;
    const row = (label, t) => (t ? `<tr><td>${esc(label)}</td><td class="num">${t.w}-${t.l}-${t.p}</td><td class="num">${esc(rate(t.hit_rate))}</td><td class="num">${esc(rate(t.expected_rate))}</td><td class="num ${sign(t.units)}">${esc(u(t.units))}</td><td class="num ${t.roi == null ? '' : sign(t.roi)}">${esc(rate(t.roi))}</td><td class="num">${t.graded}</td></tr>` : '');
    const all = T.all || { n: 0, pending: 0 };
    h += `<p class="muted small">${esc(X.intro)}</p>
      <div class="table-wrap"><table class="live-rec"><tr><th></th><th class="num">${esc(X.wlp)}</th><th class="num">${esc(X.hit)}</th><th class="num">${esc(X.expected)}</th><th class="num">${esc(X.units)}</th><th class="num">${esc(X.roi)}</th><th class="num">${esc(X.sample)}</th></tr>
      ${row(X.all, T.all)}${row(X.big, T.big)}${row(X.slight, T.slight)}${row(X.untiered, T.untiered)}</table></div>
      <p class="muted small">${esc(X.counts(all.n, all.pending))} ${esc(X.noisy)}</p>`;
    const list = rec.entries.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
    if (!list.length) return h + `<div class="section-empty">${esc(X.empty)}</div>`;
    const badge = r => `<span class="badge ${r === 'win' ? 'won' : r === 'loss' ? 'lost' : r === 'pending' ? 'open' : 'push'}">${esc(X.result[r] || r)}</span>`;
    return h + `<div class="live-rec-list">${list.map(e => `<div class="card live-rec-item">
        <div class="lr-top"><div><b>${esc(e.side || '')}</b><div class="muted small">${esc(e.market || '')} · ${esc(e.game || '')}</div></div>${badge(e.result)}</div>
        <div class="small">${esc(X.odds(e.odds_at_alert || '–', e.opening_odds || '–'))} · <span class="lr-tier lr-${esc(e.tier)}">${esc(X.tiers[e.tier] || e.tier)}</span></div>
        <div class="small muted">${esc(e.time_ct || '')}${safeUrl(e.link) ? ` · <a href="${esc(safeUrl(e.link))}" target="_blank" rel="noopener">${esc(X.link)}</a>` : ''}</div></div>`).join('')}</div>`;
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
    document.querySelectorAll('.tabbar button').forEach(b => (b.onclick = () => go(b.dataset.go === 'picks' ? savedView() : b.dataset.go === 'bets' ? savedBetsView() : b.dataset.go)));   // Picks reopens the remembered view
    window.addEventListener('hashchange', () => { if (S.getProfile()) go(location.hash.slice(1)); });
    if (!S.getProfile()) showOnboarding(); else startApp();
  }

  window.BetDash = { shareInfo: id => shareAll[id] && shareInfoPick(shareAll[id]), computeCalc, calibration, bankrollStats, recordByCategory, openTarget, getCalc: () => calc };
  boot();
})();
