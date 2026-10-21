/**
 * js/live-bets.js — the "Live Bets 🔴" view on the Picks tab.
 *
 * OWNER: Richie (HANDOFF §32 "Live Bets: Richie's area", data in §33). Reed's
 * bot does not edit this file, css/live-bets.css, scripts/live-* or data/live/.
 *
 * CONTRACT with the main page (js/app.js renderPicks):
 *   - app.js creates an empty <div id="live-bets-root" class="live-bets-root">
 *     inside the Live Bets view of the Picks tab and calls
 *     window.LiveBets.render(rootElement). We draw ONLY inside that element.
 *   - render() is called again every time the view opens, with a new root.
 *     The auto-refresh stops as soon as root leaves the page (!root.isConnected).
 *
 * DATA: data/live/<slug>.json, written by `node scripts/live-watch.mjs publish`.
 * Each edge has class: 'edge' (real), 'unverified' (ESPN context missing),
 * or a reason it moved ('score', 'news'). 'injury' edges are dropped and no
 * injury text is ever shown. Real/unverified edges show
 * in two groups, Game lines and Player props, each sorted big to small and
 * capped at CAP cards with "Show more" so neither type swamps the list. The
 * rest go in a collapsed "Moved for a reason" section.
 * Odds are American; "$10 pays $X" is whole dollars, worked out here. No cents, no stakes.
 *
 * SAFETY: all data text goes in via textContent; links must be https:.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;   // tests
  else {
    root.LiveBets = api;
    // Page load: seed the first-visit "last seen" before app.js's badge reads it.
    try { if (root.localStorage) api.seedSeen(root.localStorage); } catch (e) { /* storage blocked */ }
  }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const SLUG = 'nfl-was-sf-2026-10-19';           // fallback game if data/live/index.json is missing
  const STALE_MIN = 20;                           // live feed older than this = "Feed is stale" (Oct 20)
  const REFRESH_MS = 60 * 1000;                   // about once a minute
  const CAP = 5;                                  // cards per group before "Show more"
  // Shown in "Moved for a reason". 'injury' edges are DROPPED entirely: injury
  // data only decides whether an edge is real and is never shown (Oct 19 rule).
  const REASON_CLASSES = ['score', 'news'];
  const HIDDEN_CLASSES = ['injury'];
  // ODDS LIMIT (Oct 19, 2026): never show a side priced past +500 / -500 right
  // now (chance under 16.7% or over 83.3%). publish already drops these; this
  // is a safety net so an old data file can't show one.
  const ODDS_LIMIT = 500;
  const inLimit = p => p == null || (p >= 10000 / (ODDS_LIMIT + 100) && p <= 100 * ODDS_LIMIT / (ODDS_LIMIT + 100));

  /** What a $10 bet returns (stake + winnings) at chance p (0-100), in whole
   *  dollars rounded down (no cents): 40 -> "25", 30 -> "33". */
  const pays10 = p => (p > 0 && p < 100 ? String(Math.floor(1000 / p)) : null);
  /** Only allow https: links from data. */
  const safeUrl = u => { try { return new URL(u).protocol === 'https:' ? u : null; } catch (e) { return null; } };
  /** Short Central-time clock, e.g. "7:42 PM CT". */
  const clock = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT';
  };
  /** Open edges first (biggest first), then gone ones. */
  const sortEdges = edges => (edges || []).slice().sort((a, b) =>
    (a.status === 'gone') - (b.status === 'gone') || b.edge - a.edge);
  /** Which group an edge belongs to (older files have no `group`). */
  const groupOf = e => e.group || (e.market === 'Player prop' ? 'prop' : 'game');

  /**
   * Split edges for display (pure, tested):
   *   game / prop: real + unverified edges, sorted, first `cap` in shown, rest in more.
   *   reasons: score / news moves, sorted (injury edges dropped).
   */
  function groupEdges(edges, cap = CAP) {
    const main = [], reasons = [];
    for (const e of edges || []) {
      if (HIDDEN_CLASSES.includes(e.class)) continue;                 // injury: drop, never show
      if (!inLimit(e.now_chance)) continue;                          // past +500 / -500: drop
      (REASON_CLASSES.includes(e.class) ? reasons : main).push(e);
    }
    const split = g => { const all = sortEdges(main.filter(e => groupOf(e) === g)); return { shown: all.slice(0, cap), more: all.slice(cap), total: all.length }; };
    return { game: split('game'), prop: split('prop'), reasons: sortEdges(reasons) };
  }

  function edgeTitle(edge) {
    if (groupOf(edge) !== 'prop') return edge.side;
    return String(edge.side || '').replace(/\s+in\s+.+?\s+vs\.?\s+.+$/i, '')
      .replace(/\brecord at least\s+(\d+(?:\.\d+)?)/i, '$1+')
      .replace(/\btotal\s+(?=rebounds|points|assists)/i, '');
  }

  /** Active, eligible edges for the four navigation filters; no feed math changes. */
  function edgeSelection(edges, filter = 'all', since = null) {
    const grouped = groupEdges(edges, Number.MAX_SAFE_INTEGER);
    const main = [...grouped.game.shown, ...grouped.prop.shown];
    const active = main.filter(e => e.status !== 'gone');
    const isNew = e => !!since && !!e.first_seen && e.first_seen > since;
    const counts = { all: active.length, big: active.filter(e => e.tier === 'big').length,
      slight: active.filter(e => e.tier === 'slight').length, new: active.filter(isNew).length };
    return { counts, edges: active.filter(e => filter === 'all' || (filter === 'new' ? isNew(e) : e.tier === filter)),
      past: main.filter(e => e.status === 'gone'), reasons: grouped.reasons };
  }
  const designText = () => liveText().design;

  /** Header lines from the ESPN context: score line + status line. */
  function scoreboard(d) {
    const c = d.game_context || {};
    if (!c.available) {
      return { score: d.game || 'Live game', status: d.status === 'pregame' ? `Pregame · kickoff ${clock(d.start_time)} · game info unavailable` : 'Game info unavailable (ESPN), edges not checked' };
    }
    const a = c.away || {}, h = c.home || {};
    const score = a.score == null ? `${a.abbr} @ ${h.abbr}` : `${a.abbr} ${a.score} – ${h.abbr} ${h.score}`;
    let status;
    if (c.game_state === 'pre') status = `Pregame · kickoff ${clock(d.start_time)}`;
    else if (c.game_state === 'post') status = 'Final';
    else if (c.espn_status === 'STATUS_HALFTIME') status = 'Halftime';
    else status = `${c.period > 4 ? 'OT' : 'Q' + c.period} ${c.clock || ''}`.trim() + (c.possession ? ` · ${c.possession} ball` : '');
    return { score, status };
  }
  /**
   * "Updated X min ago" + stale flag (pure, tested). Stale = updated more than
   * STALE_MIN minutes ago while the game is live or should have started
   * (Oct 20 fix: the MNF feed sat at "pregame" all game and nothing showed it).
   */
  function freshness(d, now = Date.now()) {
    const u = Date.parse(d.updated);
    if (isNaN(u)) return { text: 'Updated time unknown', stale: d.status !== 'final' };
    const min = Math.max(0, Math.floor((now - u) / 60000));
    const ago = min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} hr ${min % 60} min ago`;
    const shouldBeLive = d.status === 'live' || (d.status === 'pregame' && Date.parse(d.start_time) <= now);
    return { text: `Updated ${ago} (${clock(d.updated)})`, stale: d.status !== 'final' && shouldBeLive && min > STALE_MIN, min };
  }
  /** Pick the game to show from index.json games: live, then soonest pregame, then latest. */
  function pickGame(games) {
    const g = (games || []).filter(x => x && x.slug);
    const live = g.find(x => x.status === 'live');
    if (live) return live.slug;
    const pre = g.filter(x => x.status === 'pregame').sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0];
    if (pre) return pre.slug;
    return g.sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))[0]?.slug || SLUG;
  }
  /** Combine game feeds without losing each card's source or chart target. */
  function combineGames(feeds, failed = 0) {
    const active = feeds.filter(d => d.status !== 'final');
    return {
      all_games: true, game_count: active.length, failed,
      updated: active.map(d => d.updated).filter(Boolean).sort()[0],
      status: active.some(d => d.status === 'live') ? 'live' : 'pregame',
      stale: active.some(d => freshness(d).stale),
      edges: active.flatMap(d => (d.edges || []).map(e => ({...e, event_slug:d.slug, event_game:d.game, event_url:d.url, event_status:scoreboard(d).status}))),
      alerts: active.flatMap(d => (d.alerts || []).map(a => ({...a, event_slug:d.slug, event_game:d.game, text:d.game + ' | ' + a.text}))).sort((a,b) => String(b.at).localeCompare(String(a.at)))
    };
  }
  const liveText = () => root.STR.liveBets;
  /** Back-compat helper (tests): status line only. */
  const statusText = d => scoreboard(d).status;

  // ---------------------------------------------------------- alerts box
  // Running feed from the data file (`alerts`, newest first). Entries newer than
  // the viewer's previous refresh are highlighted. "Last seen" is remembered per
  // game in localStorage under our own key, so it survives reopening the tab.
  const SEEN_KEY = 'liveBets.alertsSeen.' + SLUG;
  const ALERT_LABEL = { new_edge: 'New edge', gone: 'Edge gone', news: 'Likely news', removed: 'Removed' };
  /** Pure: which alerts are new since `lastSeen` (ISO or null = none highlighted). */
  const markNew = (alerts, lastSeen) => (alerts || []).map(a => !!lastSeen && a.at > lastSeen);
  const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch (e) { return null; } };
  const writeSeen = v => { try { if (v) localStorage.setItem(SEEN_KEY, v); } catch (e) { /* private mode */ } };

  /**
   * FIRST-VISIT RULE (Richie, option C, Oct 19 2026): if the viewer has never
   * seen alerts (key unset), mark everything older than 30 minutes as seen by
   * storing (now - 30 min) as an ISO time, the same format as alert `at`
   * (toISOString). Reed's badge in app.js and our NEW highlighting both read
   * this key, so a first-time visitor only sees the last 30 minutes as new.
   * Runs once at PAGE LOAD (see the bottom of this file): index.html loads this
   * script synchronously before app.js, so the key is set before the badge
   * first reads it, even if the Live Bets tab is never opened.
   * Pure (storage passed in) so tests can run it. Returns the stored value.
   */
  const FIRST_VISIT_WINDOW_MS = 30 * 60 * 1000;
  function seedSeen(storage, now = Date.now()) {
    try {
      const cur = storage.getItem(SEEN_KEY);
      if (cur) return cur;
      const v = new Date(now - FIRST_VISIT_WINDOW_MS).toISOString();
      storage.setItem(SEEN_KEY, v);
      return v;
    } catch (e) { return null; }   // private mode / no storage: leave it
  }

  /** Tiny DOM helper: element with class and text (text via textContent). */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const TIER_LABEL = { big: 'Big edge', slight: 'Slight edge' };
  const CLASS_LABEL = { score: 'Explained by score', news: 'Big move, likely news' };

  /**
   * Which apps have this bet (Oct 20 2026, Reed's bot, Reed's OK). Polymarket
   * always (all prices here come from Polymarket US). Kalshi from e.kalshi set
   * by scripts/live-kalshi.mjs: true = ✓, false = dim dash, null/missing = no badge.
   */
  function platBadges(e) {
    const out = [{ cls: 'lb-plat-on', text: 'Polymarket ✓', why: 'This bet and its price come from Polymarket US.' }];
    if (e.kalshi === true) out.push({ cls: 'lb-plat-on', text: 'Kalshi ✓', why: 'Kalshi has this same bet too. Its price can be different.' });
    else if (e.kalshi === false) out.push({ cls: 'lb-plat-off', text: 'Kalshi —', why: 'We checked Kalshi. It does not have this bet right now.' });
    return out;
  }
  function platRow(e) {
    const row = el('div', 'lb-plat'), note = el('div', 'lb-plat-why');
    note.hidden = true;
    for (const b of platBadges(e)) {
      const btn = el('button', `lb-plat-b ${b.cls}`, b.text); btn.type = 'button';
      btn.addEventListener('click', ev => { ev.stopPropagation(); const same = !note.hidden && note.textContent === b.why; note.textContent = b.why; note.hidden = same; });
      row.append(btn);
    }
    const wrap = el('div'); wrap.append(row, note); return wrap;
  }

  /** One edge card. */
  function edgeRow(e, link, ui) {
    const P = designText();
    link = safeUrl(e.event_url) || link;
    const eventSlug = e.event_slug || curSlug, eventGame = e.event_game || curGame;
    const gone = e.status === 'gone', why = REASON_CLASSES.includes(e.class);
    const cls = why ? `lb-why lb-${e.class}` : `lb-${e.tier === 'big' ? 'big' : 'slight'}`;
    const li = el('li', `lb-edge ${cls}${gone ? ' lb-gone' : ''}`);
    const top = el('div', 'lb-top');
    const label = gone ? P.gone : why ? CLASS_LABEL[e.class] : P.tiers[e.tier] || P.edge;
    top.append(el('span', 'lb-tier', label), el('span', 'lb-pts', P.cheaper(Math.round(e.edge))));
    li.append(top, el('div', 'lb-side', edgeTitle(e)));
    li.append(el('div', 'lb-matchup', eventGame));
    if (e.class === 'unverified') li.append(el('div', 'lb-unverified', P.unverified));
    li.append(el('div', 'lb-odds', e.now_odds));
    if (root.BetProgress) {
      const progress = el('div', 'bp-host'); progress.dataset.bp = JSON.stringify(root.BetProgress.spec({...e,event_slug:eventSlug,event:eventGame})); li.append(progress);
    }
    if (root.OurChance && e.market_id && !gone) {
      const oc = el('div', 'oc oc-sm'); oc.setAttribute('data-oc', JSON.stringify({ marketId: e.market_id, side: Number(String(e.key).split(':')[1]) ? 'no' : 'yes', market: e.now_chance, text: e.side, question: e.question }));
      li.append(oc);
    }
    const details = el('details', 'lb-card-details');
    const detailKey = (eventSlug || '') + ':' + e.key;
    details.open = !!(ui && ui.details.has(detailKey));
    details.addEventListener('toggle', () => { if (ui) details.open ? ui.details.add(detailKey) : ui.details.delete(detailKey); });
    details.append(el('summary', null, P.details), el('div', 'lb-market', e.market), platRow(e));
    if (edgeTitle(e) !== e.side) details.append(el('div', 'lb-meta', e.side));
    const pay = pays10(e.now_chance);
    if (pay) details.append(el('div', 'lb-meta', P.payout(pay)));
    details.append(el('div', 'lb-meta', P.opened(e.open_odds, clock(e.first_seen))));
    if (e.event_status) details.append(el('div', 'lb-meta', e.event_status));
    if (why && e.reason) details.append(el('div', 'lb-reason', e.reason));
    if (e.context) details.append(el('div', 'lb-context', e.context));
    li.append(details);
    const actions = el('div', 'lb-card-actions');
    if (link && !gone && !why) {
      const a = el('a', 'lb-link', P.market); a.href = link; a.target = '_blank'; a.rel = 'noopener'; actions.append(a);
    }
    if (root.Viz && eventSlug) {
      const openChart = () => root.Viz.open({ title: e.side, sub: `${e.market} · ${eventGame}`, legs: [{ text: e.side, question: e.question,
        eventSlug, marketId: e.market_id, side: Number(String(e.key).split(':')[1]) || 0 }] });
      const chart = el('button', 'lb-chart', P.chart); chart.type = 'button'; chart.onclick = openChart; actions.append(chart);
      li.classList.add('lb-tap');
      li.addEventListener('click', ev => { if (!ev.target.closest('a, button, details, summary, .oc')) openChart(); });
    }
    li.append(actions);
    return li;
  }

  /** The Alerts box (top of the view). */
  function alertsBox(d, ui) {
    const P = designText(), box = el('details', 'lb-alerts lb-activity');
    const list = (d.alerts || []).filter(a => inLimit(a.now_chance));
    box.open = !!ui.activity;
    box.addEventListener('toggle', () => { ui.activity = box.open; });
    box.append(el('summary', null, P.activity(list.length)));
    if (!list.length) { box.append(el('div', 'lb-none', liveText().noAlerts)); return box; }
    const isNew = markNew(list, ui.visitBase);
    const ul = el('ul', 'lb-alert-list');
    (ui.alertMore ? list : list.slice(0, 5)).forEach((a, i) => {
      const li = el('li', `lb-alert lb-a-${a.type}${isNew[i] ? ' lb-new' : ''}`);
      const top = el('div', 'lb-alert-top');
      const kind = (P.alertTypes[a.type] || P.update) + (a.type === 'new_edge' && P.tiers[a.tier] ? ' · ' + P.tiers[a.tier] : '');
      top.append(el('span', 'lb-alert-kind', kind), el('span', 'lb-alert-time', clock(a.at)));
      li.append(top, el('div', 'lb-alert-text', a.side || a.text));
      if (a.event_game) li.append(el('div', 'lb-meta', a.event_game));
      if (a.now_odds) li.append(el('div', 'lb-alert-odds', P.atAlert(a.now_odds)));
      const detail = el('details', 'lb-alert-details'); detail.append(el('summary', null, P.details), el('div', 'lb-meta', a.text)); li.append(detail);
      const link = safeUrl(a.url);
      if (link) { const l = el('a', 'lb-alert-link', P.market); l.href = link; l.target = '_blank'; l.rel = 'noopener'; li.append(l); }
      ul.append(li);
    });
    box.append(ul);
    if (list.length > 5) {
      const more = el('button', 'lb-more', ui.alertMore ? P.less : P.more(list.length - 5)); more.type = 'button';
      more.onclick = () => { ui.alertMore = !ui.alertMore; ui.redraw(); }; box.append(more);
    }
    return box;
  }

  /** One group (Game lines / Player props) with its own "Show more". */
  function groupBox(title, g, link, ui, key) {
    const box = el('section', 'lb-group');
    box.append(el('h3', 'lb-group-title', `${title} (${g.total})`));
    if (!g.total) { box.append(el('div', 'lb-none', designText().noMatching)); return box; }
    const ul = el('ul', 'lb-list');
    g.shown.forEach(e => ul.append(edgeRow(e, link, ui)));
    if (ui[key]) g.more.forEach(e => ul.append(edgeRow(e, link, ui)));
    box.append(ul);
    if (g.more.length) {
      const b = el('button', 'lb-more', ui[key] ? designText().less : designText().more(g.more.length));
      b.type = 'button';
      b.onclick = () => { ui[key] = !ui[key]; ui.redraw(); };
      box.append(b);
    }
    return box;
  }

  /** Draw the whole view from data `d` into `box`. `ui` keeps open/closed state across refreshes. */
  let curSlug = null, curGame = '';                // for the tap-to-chart pop-up
  function draw(box, d, ui) {
    curSlug = d.slug || null; curGame = d.game || '';
    box.replaceChildren();
    const P = designText();
    const selection = edgeSelection(d.edges, ui.filter, ui.visitBase);
    const head = el('div', 'lb-head');
    if (d.all_games) {
      head.append(el('div','lb-game',liveText().all),el('div','lb-status',liveText().games(d.game_count)),el('div','lb-updated',freshness(d).text));
      if (d.failed) head.append(el('div','lb-stale',liveText().failed(d.failed)));
    } else {
      const sb = scoreboard(d);
      head.append(el('div','lb-game',d.game || 'Live game'),el('div','lb-score',sb.score),el('div','lb-status',sb.status),el('div','lb-updated',freshness(d).text));
    }
    box.append(head);
    if (d.stale || freshness(d).stale) box.append(el('div','lb-stale',liveText().stale));
    const controls = el('div', 'lb-controls');
    const games = (ui.games || []).filter(x => x.status !== 'final' || x.slug === ui.slug);
    if (games.length) {
      const label = el('label', 'lb-game-label', P.game);
      const select = el('select', 'lb-game-select');
      [{slug:'all',game:liveText().all},...games].forEach(x => {
        const option = el('option', null, x.game || x.slug); option.value = x.slug; option.selected = x.slug === ui.slug; select.append(option);
      });
      select.onchange = () => { ui.slug = select.value; ui.game = ui.prop = false; ui.load(); };
      label.append(select); controls.append(label);
    }
    const filters = el('div', 'lb-edge-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', P.filterLabel);
    ['all', 'big', 'slight', 'new'].forEach(key => {
      const button = el('button', 'lb-filter' + (ui.filter === key ? ' lb-on' : ''));
      button.append(el('span', 'lb-filter-label', P.filters[key]), el('b', 'lb-filter-count', selection.counts[key]));
      button.type = 'button'; button.setAttribute('aria-label', P.filters[key] + ' ' + selection.counts[key]); button.setAttribute('aria-pressed', String(ui.filter === key));
      button.onclick = () => { ui.filter = key; ui.game = ui.prop = false; ui.redraw(); box.querySelector('.lb-filter.lb-on').focus(); }; filters.append(button);
    });
    controls.append(filters); box.append(controls);
    const notice = el('div', 'lb-notice');
    notice.append(el('span', null, selection.counts.new ? P.newCount(selection.counts.new) : P.caughtUp));
    if (selection.counts.new) {
      const review = el('button', 'lb-review', P.review); review.type = 'button';
      review.onclick = () => { ui.filter = 'new'; ui.game = ui.prop = false; ui.redraw(); box.querySelector('.lb-filter.lb-on').focus(); }; notice.append(review);
    }
    box.append(notice);
    const g = groupEdges(selection.edges), link = safeUrl(d.url);
    if (!g.game.total && !g.prop.total) {
      box.append(el('div', 'lb-none', selection.counts.all ? P.noMatching : liveText().empty));
    } else {
      const groups = el('div', 'lb-groups');
      if (g.game.total) groups.append(groupBox(P.gameLines, g.game, link, ui, 'game'));
      if (g.prop.total) groups.append(groupBox(P.propBets, g.prop, link, ui, 'prop'));
      if (!g.game.total || !g.prop.total) groups.classList.add('lb-single-group');
      box.append(groups);
    }
    box.append(alertsBox(d, ui));
    if (selection.past.length || selection.reasons.length) {
      const det = el('details', 'lb-reasons');
      det.open = !!ui.reasons;
      det.addEventListener('toggle', () => { ui.reasons = det.open; });
      det.append(el('summary', null, P.priceHistory(selection.past.length + selection.reasons.length)));
      const ul = el('ul', 'lb-list');
      [...selection.past, ...selection.reasons].forEach(e => ul.append(edgeRow(e, link, ui)));
      det.append(ul);
      box.append(det);
    }
    const about = el('details', 'lb-about'); about.append(el('summary', null, P.about), el('div', 'lb-foot', P.explanation)); box.append(about);
    const newest = [d.updated, ...(d.alerts || []).map(a => a.at), ...(d.edges || []).map(e => e.first_seen)].filter(Boolean).sort().pop();
    if (newest && (!readSeen() || newest > readSeen())) writeSeen(newest);
  }

  /** Entry point (called by app.js). Fetch now, then about every 60s. */
  function render(rootEl) {
    rootEl.replaceChildren(el('div', 'live-bets-empty', 'Loading live bets…'));
    let timer = null, last = null;
    const ui = { slug: 'all', filter: 'all', visitBase: readSeen(), details: new Set(), game: false, prop: false, reasons: false, redraw: () => { if (last) draw(rootEl, last, ui); } };
    // Which game: data/live/index.json (written by live-tick.mjs), else SLUG.
    let request = 0;
    const load = ui.load = async () => {
      if (!rootEl.isConnected && timer) { clearInterval(timer); return; }
      const current = ++request;
      try {
        const ix = await fetch('data/live/index.json?ts=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
        const games = (ix && ix.games) || [];
        const selected = ui.slug;
        const targets = selected === 'all' ? games.filter(g => g.status !== 'final') : [{slug:selected || SLUG}];
        if (!ix && selected === 'all') throw new Error('index unavailable');
        const results = await Promise.allSettled(targets.map(async g => {
          const r = await fetch('data/live/' + g.slug + '.json?ts=' + Date.now());
          if (!r.ok) throw new Error(r.status);
          return r.json();
        }));
        if (current !== request || !rootEl.isConnected) return;
        const feeds = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        if (targets.length && !feeds.length) throw new Error('feeds unavailable');
        ui.games = games;
        const d = selected === 'all' ? combineGames(feeds,results.length-feeds.length) : feeds[0];
        last=d; draw(rootEl,d,ui);
      } catch (e) {
        if (current !== request) return;
        rootEl.replaceChildren(el('div','live-bets-empty',liveText().unavailable));
      }
    };
    load();
    timer = setInterval(load, REFRESH_MS);
  }

  return { edgeTitle, edgeSelection, combineGames, render, platBadges, pays10, safeUrl, sortEdges, groupEdges, scoreboard, statusText, markNew, inLimit, seedSeen, freshness, pickGame, STALE_MIN, SEEN_KEY, SLUG, CAP, ODDS_LIMIT };
});
