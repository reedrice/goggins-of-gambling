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
      alerts: active.flatMap(d => (d.alerts || []).map(a => ({...a, text:d.game + ' | ' + a.text}))).sort((a,b) => String(b.at).localeCompare(String(a.at)))
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
  function edgeRow(e, link) {
    link = safeUrl(e.event_url) || link;
    const eventSlug = e.event_slug || curSlug, eventGame = e.event_game || curGame;
    const gone = e.status === 'gone', why = REASON_CLASSES.includes(e.class);
    const cls = why ? `lb-why lb-${e.class}` : `lb-${e.tier === 'big' ? 'big' : 'slight'}`;
    const li = el('li', `lb-edge ${cls}${gone ? ' lb-gone' : ''}`);
    const top = el('div', 'lb-top');
    const label = gone ? 'Gone' : why ? CLASS_LABEL[e.class] : TIER_LABEL[e.tier] + (e.class === 'unverified' ? ' · unverified' : '');
    top.append(el('span', 'lb-tier', label), el('span', 'lb-pts', `${Math.round(e.edge)} pts cheaper`));
    li.append(top, el('div', 'lb-side', e.side), el('div', 'lb-market', e.market), platRow(e));
    if (e.event_game) li.append(el('div', 'lb-meta', e.event_game + ' | ' + e.event_status));
    const pay = pays10(e.now_chance);
    li.append(el('div', 'lb-odds', `${e.now_odds}${pay ? ` · $10 pays $${pay}` : ''}`),
      el('div', 'lb-meta', `Opened ${e.open_odds} · first seen ${clock(e.first_seen)}`));
    if (root.OurChance && e.market_id && !gone) {   // Our chance (§56), filled client-side
      const oc = el('div', 'oc oc-sm'); oc.setAttribute('data-oc', JSON.stringify({ marketId: e.market_id, side: Number(String(e.key).split(':')[1]) ? 'no' : 'yes', market: e.now_chance, text: e.side, question: e.question }));
      li.append(oc);
    }
    if (why && e.reason) li.append(el('div', 'lb-reason', e.reason));
    if (e.context) li.append(el('div', 'lb-context', e.context));
    if (link && !gone && !why) {
      const a = el('a', 'lb-link', 'Open on Polymarket ↗');
      a.href = link; a.target = '_blank'; a.rel = 'noopener';
      li.append(a);
    }
    // Tap a card -> price chart + prop bet bars pop-up (js/viz.js, HANDOFF §48).
    if (root.Viz && eventSlug) {
      li.classList.add('lb-tap');
      li.addEventListener('click', ev => {
        if (ev.target.closest('a')) return;
        root.Viz.open({ title: e.side, sub: `${e.market} · ${eventGame}`, legs: [{ text: e.side, question: e.question,
          eventSlug, marketId: e.market_id, side: Number(String(e.key).split(':')[1]) || 0 }] });
      });
    }
    return li;
  }

  /** The Alerts box (top of the view). */
  function alertsBox(d, ui) {
    const box = el('section', 'lb-alerts');
    const list = (d.alerts || []).filter(a => inLimit(a.now_chance));   // odds limit
    box.append(el('h3', 'lb-group-title', `Alerts${list.length ? ` (${list.length})` : ''}`));
    if (!list.length) { box.append(el('div', 'lb-none', d.all_games ? liveText().noAlerts : 'No alerts yet. They\'ll show up here once the game starts.')); return box; }
    // Highlight what's new since the previous refresh, then remember the newest.
    if (ui.seenBase === undefined) ui.seenBase = readSeen();
    const isNew = markNew(list, ui.seenBase);
    ui.seenBase = list[0].at; writeSeen(list[0].at);
    const ul = el('ul', 'lb-alert-list');
    list.forEach((a, i) => {
      const li = el('li', `lb-alert lb-a-${a.type}${a.tier ? ' lb-a-' + a.tier : ''}${isNew[i] ? ' lb-new' : ''}`);
      const top = el('div', 'lb-alert-top');
      top.append(el('span', 'lb-alert-kind', (isNew[i] ? 'NEW · ' : '') + (ALERT_LABEL[a.type] || 'Alert')), el('span', 'lb-alert-time', clock(a.at)));
      li.append(top, el('div', 'lb-alert-text', a.text));
      const pay = a.type === 'gone' || a.type === 'removed' ? null : pays10(a.now_chance);
      if (a.now_odds && pay) li.append(el('div', 'lb-alert-odds', `${a.now_odds} · $10 pays $${pay}`));
      const link = safeUrl(a.url);
      if (link) { const l = el('a', 'lb-alert-link', 'Open ↗'); l.href = link; l.target = '_blank'; l.rel = 'noopener'; li.append(l); }
      ul.append(li);
    });
    box.append(ul);
    return box;
  }

  /** One group (Game lines / Player props) with its own "Show more". */
  function groupBox(title, g, link, ui, key) {
    const box = el('section', 'lb-group');
    box.append(el('h3', 'lb-group-title', `${title} (${g.total})`));
    if (!g.total) { box.append(el('div', 'lb-none', 'No edges right now.')); return box; }
    const ul = el('ul', 'lb-list');
    g.shown.forEach(e => ul.append(edgeRow(e, link)));
    if (ui[key]) g.more.forEach(e => ul.append(edgeRow(e, link)));
    box.append(ul);
    if (g.more.length) {
      const b = el('button', 'lb-more', ui[key] ? 'Show less' : `Show ${g.more.length} more`);
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
    box.append(alertsBox(d, ui));                 // Alerts feed sits at the very top
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
    const games = (ui.games || []).filter(x => x.status !== 'final' || x.slug === ui.slug);
    if (games.length) {
      const bar = el('div','lb-games');
      [{slug:'all',game:liveText().all},...games].forEach(x => {
        const b = el('button','lb-game-btn' + (x.slug === ui.slug ? ' lb-on' : ''),x.game || x.slug);
        b.type='button'; b.setAttribute('aria-pressed',String(x.slug === ui.slug));
        b.onclick=()=>{ui.slug=x.slug;ui.game=false;ui.prop=false;ui.load();};bar.append(b);
      });
      box.append(bar);
    }
    const g = groupEdges(d.edges), link = safeUrl(d.url);
    if (!g.game.total && !g.prop.total) {
      const empty = el('div', 'live-bets-empty');
      empty.append(el('div', 'live-bets-dot', '🔴'), el('p', null, 'No edges yet'),
        el('div', 'lb-sub', d.all_games ? liveText().empty : d.status === 'pregame'
          ? 'The game hasn\'t started. Bets show up here when a live price gets 4+ points cheaper than its pregame price for no clear reason.'
          : 'No live price is 4+ points cheaper than its pregame price without a clear reason right now.'));
      box.append(empty);
    } else {
      const groups = el('div', 'lb-groups');
      groups.append(groupBox('Game lines', g.game, link, ui, 'game'), groupBox('Player props', g.prop, link, ui, 'prop'));
      box.append(groups);
    }
    if (g.reasons.length) {
      const det = el('details', 'lb-reasons');
      det.open = !!ui.reasons;
      det.addEventListener('toggle', () => { ui.reasons = det.open; });
      det.append(el('summary', null, `Moved for a reason (${g.reasons.length})`));
      const ul = el('ul', 'lb-list');
      g.reasons.forEach(e => ul.append(edgeRow(e, link)));
      det.append(ul);
      box.append(det);
    }
    box.append(el('div', 'lb-foot', 'Edges are measured against the pregame Polymarket price. Big edge = 10-24 points cheaper, slight = 4-9, with no score reason found. Score and clock are from ESPN.'));
  }

  /** Entry point (called by app.js). Fetch now, then about every 60s. */
  function render(rootEl) {
    rootEl.replaceChildren(el('div', 'live-bets-empty', 'Loading live bets…'));
    let timer = null, last = null;
    const ui = { slug: 'all', game: false, prop: false, reasons: false, redraw: () => { if (!last) return; const b = ui.seenBase; ui.seenBase = ui.prevBase; draw(rootEl, last, ui); ui.seenBase = b; } };
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
        last=d; ui.prevBase=ui.seenBase; draw(rootEl,d,ui);
      } catch (e) {
        if (current !== request) return;
        rootEl.replaceChildren(el('div','live-bets-empty',liveText().unavailable));
      }
    };
    load();
    timer = setInterval(load, REFRESH_MS);
  }

  return { combineGames, render, platBadges, pays10, safeUrl, sortEdges, groupEdges, scoreboard, statusText, markNew, inLimit, seedSeen, freshness, pickGame, STALE_MIN, SEEN_KEY, SLUG, CAP, ODDS_LIMIT };
});
