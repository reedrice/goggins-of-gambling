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
 * Edges = sides whose live Polymarket US buy price is cheaper than the pregame
 * open (big = 10+ points, slight = 4-9). The file has chances (0-100) and
 * American odds only; "$10 pays $X" is worked out here. Never cents, never stakes.
 *
 * SAFETY: all data text goes in via textContent; links must be https:.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;   // tests
  else root.LiveBets = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const SLUG = 'nfl-was-sf-2026-10-19';           // tonight's game (WAS @ SF)
  const REFRESH_MS = 60 * 1000;                   // about once a minute

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
  /** Header line for the game status. */
  const statusText = d => d.status === 'final' ? 'Game over'
    : d.status === 'live' ? 'Game is live'
    : `Pregame · kickoff ${clock(d.start_time)}`;

  /** Tiny DOM helper: element with class and text (text via textContent). */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** One edge row. */
  function edgeRow(e, link) {
    const li = el('li', `lb-edge lb-${e.tier === 'big' ? 'big' : 'slight'}${e.status === 'gone' ? ' lb-gone' : ''}`);
    const top = el('div', 'lb-top');
    top.append(el('span', 'lb-tier', e.status === 'gone' ? 'Gone' : e.tier === 'big' ? 'Big edge' : 'Slight edge'),
      el('span', 'lb-pts', `${Math.round(e.edge)} pts cheaper`));
    li.append(top, el('div', 'lb-side', e.side), el('div', 'lb-market', e.market));
    const pay = pays10(e.now_chance);
    li.append(el('div', 'lb-odds', `${e.now_odds}${pay ? ` · $10 pays $${pay}` : ''}`),
      el('div', 'lb-meta', `Opened ${e.open_odds} · first seen ${clock(e.first_seen)}`));
    if (link && e.status !== 'gone') {
      const a = el('a', 'lb-link', 'Open on Polymarket ↗');
      a.href = link; a.target = '_blank'; a.rel = 'noopener';
      li.append(a);
    }
    return li;
  }

  /** Draw the whole view from data `d` into `box`. */
  function draw(box, d) {
    box.replaceChildren();
    const head = el('div', 'lb-head');
    head.append(el('div', 'lb-game', d.game || 'Live game'), el('div', 'lb-status', statusText(d)),
      el('div', 'lb-updated', `Updated ${clock(d.updated)} · checks every minute`));
    box.append(head);
    const edges = sortEdges(d.edges), link = safeUrl(d.url);
    if (!edges.length) {
      const empty = el('div', 'live-bets-empty');
      empty.append(el('div', 'live-bets-dot', '🔴'), el('p', null, 'No edges yet'),
        el('div', 'lb-sub', d.status === 'pregame'
          ? 'The game hasn\'t started. Bets show up here when a live price gets 4+ points cheaper than its pregame price.'
          : 'No live price is 4+ points cheaper than its pregame price right now.'));
      box.append(empty);
      return;
    }
    const ul = el('ul', 'lb-list');
    edges.forEach(e => ul.append(edgeRow(e, link)));
    box.append(ul, el('div', 'lb-foot', 'Big edge = 10+ points cheaper than the pregame price. Slight = 4 to 9.'));
  }

  /** Entry point (called by app.js). Fetch now, then about every 60s. */
  function render(rootEl) {
    rootEl.replaceChildren(el('div', 'live-bets-empty', 'Loading live bets…'));
    let timer = null;
    const load = () => {
      if (!rootEl.isConnected && timer) { clearInterval(timer); return; }   // view closed
      fetch(`data/live/${SLUG}.json?ts=${Date.now()}`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => draw(rootEl, d))
        .catch(() => { if (!rootEl.querySelector('.lb-head')) {
          rootEl.replaceChildren(el('div', 'live-bets-empty', 'Live bets aren\'t available yet. Try again in a minute.')); } });
    };
    load();
    timer = setInterval(load, REFRESH_MS);
  }

  return { render, pays10, safeUrl, sortEdges, statusText, SLUG };
});
