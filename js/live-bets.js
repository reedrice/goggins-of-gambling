/**
 * js/live-bets.js — the "Live Bets 🔴" view on the Picks tab.
 *
 * OWNER: Richie (HANDOFF §32 "Live Bets: Richie's area"). Reed's bot does not
 * edit this file, css/live-bets.css, scripts/live-* or data/live/.
 *
 * CONTRACT with the main page (js/app.js renderPicks):
 *   - When the user picks "Live Bets 🔴" (or opens #live), app.js creates an
 *     empty <div id="live-bets-root" class="live-bets-root"> and calls
 *     window.LiveBets.render(rootElement). Render everything inside root.
 *   - It is called again every time the view is opened; root is brand new each
 *     time. If you add timers (auto-refresh), stop them when root leaves the
 *     page (e.g. check root.isConnected before each refresh).
 *   - Site rules still apply: American odds only (no cents), "$10 pays $X"
 *     worked out in the browser, no dollar amounts or secrets in committed data,
 *     escape any data text before putting it in HTML, phone-friendly at 390px.
 *
 * TODAY: a placeholder only.
 */
(function (root) {
  'use strict';
  /** Draw the Live Bets view into `el`. */
  function render(el) {
    const msg = (root.STR && root.STR.live && root.STR.live.soon) || 'Live bets coming soon';
    el.innerHTML = '<div class="live-bets-empty"><div class="live-bets-dot" aria-hidden="true">🔴</div><p></p></div>';
    el.querySelector('p').textContent = msg;
  }
  root.LiveBets = { render };
})(typeof self !== 'undefined' ? self : this);
