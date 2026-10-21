/**
 * js/viz.js — two pop-up charts for a tapped bet (HANDOFF §48, Oct 20, 2026).
 *
 *  1. PRICE OVER TIME ("stock chart"): the chance for a side over time, from
 *     data/live/<slug>-history.json (written by `live-watch.mjs publish` /
 *     live-tick). Polymarket US has no free public price-history endpoint
 *     (checked Oct 20: /v1/markets/.../prices-history etc. all 404), so the
 *     line only covers times our live tick ran. Dashed marks = period changes
 *     with the ESPN score. Touch / drag to read a point.
 *  2. PROP BET HISTORY (Outlier-style bars): the player's last games from
 *     ESPN's free public endpoints, fetched in the browser (CORS is open):
 *       search   site.web.api.espn.com/apis/search/v2?query=<name>&type=player
 *       gamelog  site.web.api.espn.com/apis/common/v3/sports/<sport>/<league>/athletes/<id>/gamelog
 *     Green bar = hit the prop (at least N), red = missed, dashed line at N.
 *     Toggles: L5 / L10 / H2H (vs today's opponent) / Season.
 *
 * Plain words, no cents, no stakes. All text goes in via textContent.
 * Usage: Viz.open({ title, sub, legs: [{ text, question, player, league,
 *   eventSlug, marketId, marketSlug, side: 0|1 }] })
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Viz = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ESPN_PATH = { nba: 'basketball/nba', wnba: 'basketball/wnba', nhl: 'hockey/nhl', nfl: 'football/nfl', mlb: 'baseball/mlb' };
  const ALIAS = { was: 'wsh', mon: 'mtl', uta: 'utah', pho: 'phx', gsw: 'gs', nyk: 'ny', nop: 'no', sas: 'sa', jac: 'jax', cws: 'chw', az: 'ari', njd: 'nj', lak: 'la', tbl: 'tb', sjs: 'sj', con: 'conn' };
  const espnAbbr = a => { a = String(a || '').toLowerCase(); return ALIAS[a] || a; };

  // ------------------------------------------------------------ parsing (pure)
  // Stat words -> how to read them from ESPN gamelog `names` (sum of names; "a-b" takes a).
  const STATS = [
    [/combined points, rebounds and assists|pts\s*\+\s*reb\s*\+\s*ast|\bpra\b/i, 'pra', ['points', 'totalRebounds', 'assists'], 'points + rebounds + assists'],
    [/three|3-?pointers?|threes|\b3pm\b/i, 'threes', ['threePointFieldGoalsMade-threePointFieldGoalsAttempted'], 'threes made'],
    [/rebounds?|\breb\b/i, 'reb', ['totalRebounds'], 'rebounds'],
    [/assists?|\bast\b/i, 'ast', ['assists'], 'assists'],
    [/steals?|\bstl\b/i, 'stl', ['steals'], 'steals'],
    [/blocks?|\bblk\b/i, 'blk', ['blocks'], 'blocks'],
    [/passing yards/i, 'passyd', ['passingYards'], 'passing yards'],
    [/rushing yards/i, 'rushyd', ['rushingYards'], 'rushing yards'],
    [/receiving yards/i, 'recyd', ['receivingYards'], 'receiving yards'],
    [/receptions?|catch/i, 'rec', ['receptions'], 'catches'],
    [/passing touchdowns?|\bptd\b/i, 'ptd', ['passingTouchdowns'], 'passing TDs'],
    [/interceptions?|\bint\b/i, 'int', ['interceptions'], 'interceptions thrown'],
    [/home runs?|\bhr\b/i, 'hr', ['homeRuns'], 'home runs'],
    [/\brbis?\b/i, 'rbi', ['RBIs'], 'RBIs'],
    [/strikeouts?|\bks?\b/i, 'k', ['strikeouts'], 'strikeouts'],
    [/\bhits?\b/i, 'hits', ['hits'], 'hits'],
    [/goals?/i, 'goals', ['goals'], 'goals'],
    [/points?|\bpts\b/i, 'pts', ['points'], 'points'],
  ];
  const statOf = words => { for (const [re, key, names, label] of STATS) if (re.test(words)) return { key, names, label }; return null; };

  /**
   * Read a player prop from any text we have:
   *  - Polymarket question: "Will Jayson Tatum record at least 15 points in BOS Celtics vs. DET Pistons?"
   *  - pick leg desc: "Cutter Gauthier 1+ points — YES"
   *  - market slug: "astatc-nba-bos-det-2026-10-20-pts-jaytat-gte15"
   * Returns { player, league, n, stat:{key,names,label}, away, home } or null.
   * n = "at least n" (the prop line is n - 0.5).
   */
  function parseProp({ question, text, player, league, marketSlug, eventSlug } = {}) {
    let name = player || null, n = null, words = '';
    const q = /^Will (.+?) (?:record|have|score|get|throw|catch|make) at least (\d+(?:\.\d+)?) (.+?)(?: in .*)?\??$/i.exec(question || '');
    const t = /^(.+?) (\d+(?:\.\d+)?)\+ (.+?)(?:\s+[—-].*)?$/.exec(text || '');
    if (q) { name = name || q[1]; n = +q[2]; words = q[3]; }
    else if (t) { name = name || t[1]; n = +t[2]; words = t[3]; }
    const s = /^astatc-([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}-([a-z0-9]+)-[a-z]+-gte(\d+)$/.exec(marketSlug || '');
    if (s) { if (n == null) n = +s[5]; if (!words) words = s[4]; league = league || s[1]; }
    const ev = /^([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}$/.exec(eventSlug || '') || (s && [0, s[1], s[2], s[3]]);
    league = String(league || (ev && ev[1]) || '').toLowerCase();
    const stat = statOf(words);
    if (!name || n == null || !stat) return null;
    if (!ESPN_PATH[league]) league = '';   // unknown: found from the ESPN search (§53)
    return { player: name.trim(), league, n, stat, away: ev ? ev[2] : null, home: ev ? ev[3] : null };
  }

  /** Pure: ESPN gamelog JSON -> [{ id, date, opp, value }] newest first, preseason dropped. */
  function gamesFromLog(log, stat) {
    if (!log || !Array.isArray(log.names)) return [];
    const idx = stat.names.map(nm => log.names.indexOf(nm));
    if (idx.some(i => i < 0)) return [];
    const out = [];
    for (const st of log.seasonTypes || []) {
      if (/preseason/i.test(st.displayName || '')) continue;
      for (const c of st.categories || []) for (const e of c.events || []) {
        const meta = (log.events || {})[e.eventId] || {};
        const v = idx.reduce((sum, i) => sum + (parseFloat(String(e.stats[i]).split('-')[0]) || 0), 0);
        out.push({ id: e.eventId, date: meta.gameDate || '', opp: (meta.opponent && meta.opponent.abbreviation) || '', team: (meta.team && meta.team.abbreviation) || '', home: meta.atVs ? meta.atVs !== '@' : null, season: st.displayName || '', value: v });
      }
    }
    const seen = new Set();
    return out.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Pure: hit rate + average for a list of games at "at least n". */
  function summary(games, n) {
    const hits = games.filter(g => g.value >= n).length;
    const avg = games.length ? games.reduce((s, g) => s + g.value, 0) / games.length : 0;
    return { hits, total: games.length, avg: Math.round(avg * 10) / 10 };
  }


  /** Pure: start of the league's current season (ESPN's default gamelog can still be last season early on). */
  function seasonStart(league, now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth(), L = String(league || '').toLowerCase();
    const at = (yy, mm) => new Date(Date.UTC(yy, mm, 1)).toISOString().slice(0, 10);
    const from = mm => (m >= mm ? at(y, mm) : at(y - 1, mm));
    if (/mlb|baseball/.test(L)) return from(1);          // Feb (spring)
    if (/wnba/.test(L)) return from(3);                  // Apr
    if (/nba|nhl|basketball|hockey/.test(L)) return from(8); // Sep
    return from(7);                                       // NFL / football: Aug
  }
  /** Tag games before the current season's start as last season (g.last). */
  function tagSeason(all, league, now) { const s = seasonStart(league, now); (all || []).forEach(g => { if (g.date && String(g.date).slice(0, 10) < s) g.last = true; }); return all; }

  /** Pure: which games a toggle shows. */
  // Current season only by default (Reed); last season only behind the "Last season" chip.
  function pickGames(all, mode, oppAbbr) {
    if (mode === 'Last') return all.filter(g => g.last);
    const cur = all.filter(g => !g.last);
    if (mode === 'L5') return cur.slice(0, 5);
    if (mode === 'L10') return cur.slice(0, 10);
    if (mode === 'H2H') return cur.filter(g => oppAbbr && espnAbbr(g.opp) === espnAbbr(oppAbbr)).slice(0, 10);
    return cur;
  }

  /** Probability points -> American odds. */
  const american = p => !(p > 0 && p < 100) ? '' : p > 50 ? '-' + Math.round(100 * p / (100 - p)) : '+' + Math.round(100 * (100 - p) / p);

  /** Pure: history file -> [{t, chance}] for one market + side, and marks. */
  function seriesFor(hist, { marketId, marketSlug }, side = 0) {
    if (!hist || !hist.m) return { points: [], marks: [] };
    const id = marketId != null && hist.m[marketId] ? marketId : (hist.ids || {})[marketSlug];
    const raw = (id != null && hist.m[id]) || [];
    const t0 = Date.parse(hist.t0);
    const points = raw.map(([min, mid]) => ({ t: t0 + min * 60e3, chance: side ? 100 - mid : mid }));
    const marks = (hist.marks || []).map(([min, label]) => ({ t: t0 + min * 60e3, label }));
    return { points, marks };
  }

  // ------------------------------------------------------------ DOM
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const clock = t => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  /** Pure: the short "we tried" line every empty visual shows (DESIGN.md: never blank). */
  const noteText = (source, text, t = Date.now()) => `${source ? `Checked ${source} · ` : ''}${text} · ${clock(t)} CT`;
  /** A minimal empty/loading/error state element. */
  const note = (source, text, cls = 'viz-none') => el('div', cls, noteText(source, text));
  /** Pure-ish: visual containers with nothing in them (test hook; also used by tests/no-blank.smoke.js). */
  const VISUALS = '.viz-chart, .viz-bars-wrap, .viz-sec, .dd-sec, .dd-chart, .dd-live, .dd-share';
  const blankVisuals = root => [...root.querySelectorAll(VISUALS)].filter(n => !n.hidden && !n.closest('[hidden]') && !(n.textContent || '').trim() && !n.querySelector('svg, canvas, img'));
  const cache = {};
  const getJSON = url => (cache[url] = cache[url] || fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { if (j == null) delete cache[url]; return j; }));   // failures aren't cached, so retries refetch

  // ------------------------------------------------------------ zoomable chart (§55)
  const MIN_SPAN = 60e3;
  /** Pure: visible window {a, b} for data [tMin, tMax] and view state {span, end, live}. */
  function viewWindow(tMin, tMax, v) {
    const full = Math.max(MIN_SPAN, tMax - tMin); // max zoom-out = All, like Polymarket
    // v.from (Polymarket "Game" window): start at game start; the span grows with live data.
    const want = v.span || (v.from != null ? (v.live ? tMax : Math.min(tMax, v.end || tMax)) - v.from : full);
    const span = Math.min(full, Math.max(MIN_SPAN, want));
    let end = v.live ? tMax : Math.min(tMax, Math.max(tMin + span, v.end || tMax));
    return { a: end - span, b: end, span };
  }
  /** Pure: sorted, deduped (one point per timestamp, last source wins) copy of a series. */
  function prepSeries(points) {
    const s = (points || []).filter(p => p && isFinite(p.t) && isFinite(p.chance)).slice().sort((x, y) => x.t - y.t), out = [];
    for (const p of s) { if (out.length && out[out.length - 1].t === p.t) out[out.length - 1] = p; else out.push(p); }
    return out;
  }
  /** Pure: index of the point nearest time t in a sorted series (binary search). */
  function nearestIdx(pts, t) {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m + 1; else hi = m; }
    return lo > 0 && Math.abs(pts[lo - 1].t - t) <= Math.abs(pts[lo].t - t) ? lo - 1 : lo;
  }
  /**
   * Pure: default view, copied from Polymarket US (defaultSportsChartWindow): before the game
   * "All"; live -> "Game" (game start to now); finished -> game start to game end.
   */
  function defaultView(game) {
    const st = game && game.status, from = game && game.start;
    if ((st === 'live' || st === 'finished') && isFinite(from)) return st === 'live' ? { span: null, end: null, from, live: true } : { span: null, from, end: isFinite(game.end) ? game.end : null, live: !isFinite(game.end) };
    return { span: null, end: null, live: true };
  }
  /** Pure: game {status, start, end} from a Polymarket US event payload (+ fallback start). */
  function gameInfo(ev, fallbackStart, now = Date.now()) {
    const e = (ev && ev.event) || ev || {};
    const start = Date.parse(e.startTime || e.startDate || fallbackStart || '');
    const endT = Date.parse(e.endTime || e.finishedTime || e.closedTime || '');
    const done = !!(e.ended || e.closed || e.finished || /final|finished|ended|closed/i.test(String(e.gameStatus || e.status || e.period || '')));
    if (!isFinite(start)) return null;
    if (done) return { status: 'finished', start, end: isFinite(endT) ? endT : null };
    return { status: e.live || now >= start ? 'live' : 'pregame', start, end: null };
  }
  /** User's standard bet (whole dollars) from Settings, else $10. */
  function myUnit() {
    try { const u = Math.round(Number(JSON.parse(globalThis.localStorage.getItem('betdash_profile') || '{}').unit)); return u > 0 ? u : 10; } catch (e) { return 10; }
  }
  /** Pure: y range (chance points) that fits the visible points with a little padding. */
  function fitY(vals) {
    if (!vals.length) return { lo: 40, hi: 60 };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(0.5, (hi - lo) * 0.12);
    if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
    return { lo: Math.max(0.5, lo - pad), hi: Math.min(99.5, hi + pad) };
  }
  /** Pure: "4:20 AM – 4:37 AM CT" (weekday added when the window is long or crosses days). */
  function rangeLabel(a, b) {
    const day = t => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short' });
    const withDay = b - a > 12 * 3600e3 || day(a) !== day(b);
    return `${withDay ? day(a) + ' ' : ''}${clock(a)} – ${withDay ? day(b) + ' ' : ''}${clock(b)} CT`;
  }


  // ------------------------------------------------------------ two-line game charts (Polymarket look, Oct 20)
  /** Small fallback team colors (primary, by league:abbr) for when the Polymarket event has none. */
  const TEAM_COLORS = {
    nba: { atl: '#e03a3e', bos: '#009941', bkn: '#ffffff', cha: '#1d9bb2', chi: '#ce1141', cle: '#a3243b', dal: '#0064b1', den: '#fec524', det: '#006bcc', gs: '#ffc72c', hou: '#ce1141', ind: '#fdbb30', lac: '#c8102e', lal: '#fdb927', mem: '#5d76a9', mia: '#98002e', mil: '#00a651', min: '#78be20', no: '#c8a45c', ny: '#f58426', okc: '#007ac1', orl: '#0077c0', phi: '#006bb6', phx: '#e56020', por: '#e03a3e', sac: '#5a2d81', sa: '#c4ced4', tor: '#ce1141', utah: '#7c4dff', wsh: '#e31837' },
    nhl: { ana: '#fc4c02', bos: '#fcb514', buf: '#2d6dd2', cgy: '#d2001c', car: '#ce1126', chi: '#cf0a2c', col: '#a6192e', cbj: '#2f6bd8', dal: '#00a862', det: '#ce1126', edm: '#ff4c00', fla: '#c8102e', la: '#a2aaad', min: '#1f9a5a', mtl: '#af1e2d', nsh: '#ffb81c', nj: '#ce1126', nyi: '#f47d30', nyr: '#2f6bd8', ott: '#da1a32', phi: '#f74902', pit: '#fcb514', sj: '#00a3b4', sea: '#99d9d9', stl: '#2f6bd8', tb: '#2f6bd8', tor: '#2f6bd8', utah: '#71afe5', van: '#2f6bd8', vgk: '#b4975a', wpg: '#5b8fd8', wsh: '#c8102e' },
    nfl: { ari: '#97233f', atl: '#a71930', bal: '#7a5cc6', buf: '#00338d', car: '#0085ca', chi: '#c83803', cin: '#fb4f14', cle: '#ff3c00', dal: '#4a7fd8', den: '#fb4f14', det: '#0076b6', gb: '#ffb612', hou: '#a71930', ind: '#2f6bd8', jax: '#d7a22a', kc: '#e31837', lv: '#a5acaf', lac: '#0080c6', lar: '#ffa300', mia: '#008e97', min: '#7a4fc0', ne: '#c60c30', no: '#d3bc8d', nyg: '#2f6bd8', nyj: '#18a058', phi: '#1a8a8f', pit: '#ffb612', sf: '#aa0000', sea: '#69be28', tb: '#d50a0a', ten: '#4b92db', wsh: '#ffb612' },
    mlb: { ari: '#a71930', atl: '#ce1141', bal: '#df4601', bos: '#bd3039', chc: '#2f6bd8', chw: '#c4ced4', cin: '#c6011f', cle: '#e50022', col: '#8a6fc8', det: '#fa4616', hou: '#eb6e1f', kc: '#2f7fd8', laa: '#ba0021', lad: '#2f7fd8', mia: '#00a3e0', mil: '#ffc52f', min: '#d31145', nym: '#ff5910', nyy: '#8fa3c8', oak: '#00a35a', phi: '#e81828', pit: '#fdb827', sd: '#ffc425', sf: '#fd5a1e', sea: '#00a3a3', stl: '#c41e3a', tb: '#8fbce6', tex: '#2f6bd8', tor: '#2f7fd8', wsh: '#ab0003' },
  };
  const PAIR_FALLBACK = ['#3fb950', '#4c8dff'];   // green / blue, like Polymarket
  /** Pure: a hex color made legible on the dark background (too-dark colors are lifted toward white). */
  function legible(hex, fb) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return fb;
    let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.32) { const k = (0.32 - lum) / (1 - lum) + 0.15; [r, g, b] = [r, g, b].map(v => Math.round(v + (255 - v) * k)); }
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  /** Pure: color for a team (Polymarket colorPrimary first, else our map, else fallback). */
  const teamColor = (league, abbr, primary, fb) => legible(primary || ((TEAM_COLORS[String(league || '').toLowerCase()] || {})[espnAbbr(abbr)]), fb);
  /** Pure: the two sides of a game market from a Polymarket US event: { pair, sides: [{name, short, color}] (long side first) }. Props -> pair false. */
  function pairSides(ev, m) {
    const e = (ev && ev.event) || ev || {};
    const mk = ((e.markets) || []).find(x => m && ((m.slug && x.slug === m.slug) || (m.id != null && String(x.id) === String(m.id))));
    if (!mk) return null;
    if (mk.marketType === 'props' || /_player_/.test(mk.sportsMarketType || '')) return { pair: false };
    const ss = (mk.marketSides || []).slice().sort((a, b) => (b.long ? 1 : 0) - (a.long ? 1 : 0));
    if (ss.length !== 2) return { pair: false };
    const win = /winner|moneyline/.test(mk.sportsMarketType || '') || mk.marketType === 'moneyline';
    const sides = ss.map((sd, i) => { const t = sd.team || {};
      const name = win ? (t.safeName || sd.description) : (sd.description || (i ? 'No' : 'Yes'));
      return { name, short: String(t.abbreviation || name).toUpperCase(), color: win || mk.marketType === 'spreads' ? teamColor(t.league, t.abbreviation, t.colorPrimary, PAIR_FALLBACK[i]) : PAIR_FALLBACK[i] }; });
    // Tennis participants often share the provider's default blue. Keep every pair distinguishable.
    const distance = (a,b) => [1,3,5].reduce((sum,i)=>sum+(parseInt(a.slice(i,i+2),16)-parseInt(b.slice(i,i+2),16))**2,0);
    if (distance(sides[0].color,sides[1].color) < 120**2) sides[1].color = PAIR_FALLBACK.slice().sort((a,b)=>distance(sides[0].color,b)-distance(sides[0].color,a))[0];
    return { pair: true, sides };
  }
  /** Pure: score header {away, home, as, hs, live, period} from a Polymarket US event (teams are away, home). */
  function scoreHeader(ev) {
    const e = (ev && ev.event) || ev || {}, t = e.teams || [];
    if (t.length < 2) return null;
    const sc = /^(\d+)\s*-\s*(\d+)$/.exec(String(e.score || ''));
    return { away: String(t[0].abbreviation || '').toUpperCase(), home: String(t[1].abbreviation || '').toUpperCase(),
      as: sc ? +sc[1] : null, hs: sc ? +sc[2] : null, live: !!e.live && !e.ended, ended: !!e.ended, period: String(e.period || '') };
  }
  /** Pure: step-after points string (flat until the next price, then straight up/down — how Polymarket draws). */
  function stepPoints(pts, x, y) {
    const out = [];
    pts.forEach((p, i) => { if (i) out.push(`${x(p.t).toFixed(1)},${y(pts[i - 1].chance).toFixed(1)}`); out.push(`${x(p.t).toFixed(1)},${y(p.chance).toFixed(1)}`); });
    return out.join(' ');
  }
  /** Pure: 100 - x for each point (only used when the other side has no own price data). */
  const complement = pts => pts.map(p => ({ t: p.t, chance: 100 - p.chance }));
  /** Pure: value of a sorted series at time t (last point at or before t; step-after). */
  function valueAt(pts, t) { let v = null; for (const p of pts) { if (p.t <= t) v = p.chance; else break; } return v; }

  /**
   * Draw (or refresh) the price line in box. Stock-app style (§55): pinch / mouse wheel to
   * zoom, drag to pan, tap or long-press to read a point, double-tap or Reset to snap back.
   * The y-axis fits what's in view. While "live", new points keep the right edge at now;
   * panning away shows "Back to live". The view state lives on the box, so the 1.5 s live
   * refreshes don't undo a zoom. Default view: fully zoomed out = all history, matching Polymarket US's default "All" window.
   */
  // Shape-preserving display curves: every segment stays between its real endpoints.
  function curvePath(pts,x,y) {
    if(!pts.length)return '';
    let d='M'+x(pts[0].t).toFixed(2)+','+y(pts[0].chance).toFixed(2);
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],dx=(x(b.t)-x(a.t))/3;
      d+=' C'+(x(a.t)+dx).toFixed(2)+','+y(a.chance).toFixed(2)+' '+(x(b.t)-dx).toFixed(2)+','+y(b.chance).toFixed(2)+' '+x(b.t).toFixed(2)+','+y(b.chance).toFixed(2);
    }
    return d;
  }
  function drawChart(box, points, marks, game, pair) {
    box._pts = points = prepSeries(points);
    box._pair = pair && pair.sides && pair.b ? { sides: pair.sides, b: prepSeries(pair.b), head: pair.head || null } : null;
    if (box._pair) box._pair.R = 10; box._marks = (marks || []).slice().sort((a, b) => a.t - b.t);
    const gk = game ? game.status + ':' + game.start + ':' + game.end : '';
    if (box._ui && gk !== box._gk && !box._ui.touched) box._ui.v = defaultView(game);   // game went live / finished
    box._gk = gk; box._game = game || null;
    if (points.length < 2) {
      box._ui = null;
      box.replaceChildren(points.length ? el('div', 'viz-none', `Only one price so far: ${american(points[0].chance)} (${Math.round(points[0].chance)}% chance). The line grows while this is open.`)
        : box._err ? note('', "Couldn't reach Polymarket · retrying") : box._loading ? el('div', 'viz-none', 'Loading prices…') : note('Polymarket', 'no price history yet'));
      return;
    }
    if (!box._ui) buildChart(box);
    renderChart(box);
  }
  const W = 340, H = 180, L = 46, R = 8, T = 10, B = 22;
  function buildChart(box) {
    const range = el('div', 'viz-range'), ctl = el('div', 'viz-ctl');
    const live = el('button', 'viz-mini viz-golive', '● Live'), reset = el('button', 'viz-mini viz-reset', '↺');
    live.setAttribute('aria-label', 'Back to live'); reset.setAttribute('aria-label', 'Reset zoom'); reset.title = 'Reset';
    live.type = reset.type = 'button';
    ctl.append(range, live, reset);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': 'Price over time. Pinch or scroll to zoom, drag to move.' });
    const read = el('div', 'viz-read'), head = el('div', 'viz-head'), quotes = el('div','viz-quotes');
    box.classList.add('viz-surface'); box.replaceChildren(head, quotes, ctl, svg, read);
    const ui = box._ui = { svg, read, head, quotes, range, live, reset, v: defaultView(box._game), sel: null, touched: false };
    const def = () => defaultView(box._game);   // Polymarket default: All / Game; zoom-out still reaches All
    reset.onclick = () => { ui.touched = false; ui.v = def(); ui.sel = null; renderChart(box); };
    live.onclick = () => { ui.v.live = true; ui.sel = null; renderChart(box); };
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { ui.sel = null; renderChart(box); } });
    const xOf = ev => { const r = svg.getBoundingClientRect(); return (ev.clientX - r.left) * W / r.width; };
    const tAt = px => { const w = ui.win; return w.a + (w.b - w.a) * Math.min(1, Math.max(0, (px - lOf(box)) / (W - lOf(box) - rOf(box)))); };
    const zoom = (factor, px) => {
      const p = box._pts, tMin = p[0].t, tMax = p[p.length - 1].t, w = ui.win, pivot = tAt(px);
      const span = Math.min(Math.max(MIN_SPAN, tMax - tMin), Math.max(MIN_SPAN, w.span * factor));
      const frac = (pivot - w.a) / (w.b - w.a || 1);
      const end = Math.min(tMax, Math.max(tMin + span, pivot + (1 - frac) * span));
      ui.v = { span, end, live: ui.v.live && end >= tMax - 1 }; ui.touched = true;
      renderChart(box);
    };
    svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.25 : 0.8, xOf(e)); }, { passive: false });
    const ptrs = new Map(); let drag = null, pinch = null, lastTap = 0, pressTimer = null;
    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, xOf(e));
      if (ptrs.size === 2) { const [x1, x2] = [...ptrs.values()]; pinch = { d: Math.abs(x1 - x2) || 1, span: ui.win.span }; drag = null; clearTimeout(pressTimer); return; }
      drag = { x: xOf(e), end: ui.win.b, moved: false };
      pressTimer = setTimeout(() => { if (drag && !drag.moved) { ui.sel = tAt(drag.x); renderChart(box); } }, 350);   // long-press reads
    });
    svg.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && !drag) { ui.sel = tAt(xOf(e)); renderChart(box); } return; }
      ptrs.set(e.pointerId, xOf(e));
      if (pinch && ptrs.size === 2) {
        const [x1, x2] = [...ptrs.values()], d = Math.abs(x1 - x2) || 1;
        const target = pinch.span * pinch.d / d;
        zoom(target / ui.win.span, (x1 + x2) / 2); return;
      }
      if (!drag) return;
      const dx = xOf(e) - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (!drag.moved) return;
      if (ui.sel != null && e.pointerType !== 'mouse') { ui.sel = tAt(xOf(e)); renderChart(box); return; }   // after long-press: scrub
      const p = box._pts, tMin = p[0].t, tMax = p[p.length - 1].t, w = ui.win;
      const dt = -dx * (w.b - w.a) / (W - lOf(box) - rOf(box));
      const end = Math.min(tMax, Math.max(tMin + w.span, drag.end + dt));
      ui.v = { span: w.span, end, live: end >= tMax - 1 }; ui.touched = true;
      renderChart(box);
    });
    const up = e => {
      ptrs.delete(e.pointerId); clearTimeout(pressTimer);
      if (ptrs.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') {
        const now = Date.now();
        if (now - lastTap < 300) { ui.touched = false; ui.v = def(); ui.sel = null; } else ui.sel = tAt(drag.x);   // double-tap resets, tap reads
        lastTap = now; renderChart(box);
      }
      drag = null;
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  }
  const lOf = box => (box._pair ? 10 : L);
  const rOf = box => (box._pair ? box._pair.R : R);
  function renderChart(box) {
    if (!box._ui) return;
    if (box._raf) return;
    const run = () => { box._raf = 0; paint(box); };
    if (typeof requestAnimationFrame === 'function') box._raf = requestAnimationFrame(run); else run();
  }
  function paint(box) {
    const ui = box._ui, pts = box._pts, marks = box._marks, svg = ui.svg, pr = box._pair, R = rOf(box), L = lOf(box);   // no y-axis strip in two-line mode
    const tMin = pts[0].t, tMax = pts[pts.length - 1].t;
    const win = ui.win = viewWindow(tMin, tMax, ui.v);
    // Visible points + one on each side so the line reaches the edges.
    const visOf = s => {
      let i0 = s.findIndex(p => p.t >= win.a); if (i0 < 0) i0 = s.length - 1;
      let i1 = s.length - 1; while (i1 > 0 && s[i1].t > win.b) i1--;
      return { vis: s.slice(Math.max(0, i0 - 1), Math.min(s.length, i1 + 2)), inView: s.slice(i0, i1 + 1) };
    };
    const A = visOf(pts), Bv = pr ? visOf(pr.b) : null, vis = A.vis;
    const { lo, hi } = fitY(A.inView.map(p => p.chance).concat(Bv ? Bv.inView.map(p => p.chance) : []));
    const x = t => L + (W - L - R) * (t - win.a) / Math.max(1, win.b - win.a), y = c => T + (H - T - B) * (hi - c) / (hi - lo);
    svg.replaceChildren();
    const defs = sv('defs', {}), clip = sv('clipPath', { id: 'vzclip' + (box._cid || (box._cid = Math.random().toString(36).slice(2, 7))) });
    clip.append(sv('rect', { x: L, y: 0, width: W - L - R, height: H - B })); defs.append(clip); svg.append(defs);
    if (!pr) for (const c of [hi - (hi - lo) * 0.08, (hi + lo) / 2, lo + (hi - lo) * 0.08]) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(c), y2: y(c), class: 'viz-grid' }));
      const tx = sv('text', { x: L - 4, y: y(c) + 4, class: 'viz-ylab', 'text-anchor': 'end' }); tx.textContent = american(c); svg.append(tx);
    }
    const g = sv('g', { 'clip-path': `url(#vzclip${box._cid})` });
    for (const m of marks) if (m.t >= win.a && m.t <= win.b) {
      g.append(sv('line', { x1: x(m.t), x2: x(m.t), y1: T, y2: H - B, class: 'viz-mark' }));
      const tx = sv('text', { x: x(m.t) + 2, y: T + 9, class: 'viz-mlab' }); tx.textContent = String(m.label).split(' · ')[0]; g.append(tx);
    }
    const drawSeries=(v,color,i)=>{
      if(!v.length)return;
      const d=curvePath(v,x,y),id='vzfill'+box._cid+i;
      const grad=sv('linearGradient',{id,x1:'0',y1:'0',x2:'0',y2:'1'});
      grad.append(sv('stop',{offset:'0%','stop-color':color,'stop-opacity':'.16'}),sv('stop',{offset:'100%','stop-color':color,'stop-opacity':'0'}));defs.append(grad);
      g.append(sv('path',{d:d+' L'+x(v[v.length-1].t).toFixed(2)+','+(H-B)+' L'+x(v[0].t).toFixed(2)+','+(H-B)+' Z',fill:'url(#'+id+')',class:'viz-area'}));
      g.append(sv('path',{d,stroke:color,class:'viz-glow'}),sv('path',{d,stroke:color,class:'viz-line viz-pairline'}));
    };
    if(pr){drawSeries(vis,pr.sides[0].color,0);drawSeries(Bv.vis,pr.sides[1].color,1);}
    else drawSeries(vis,vis[vis.length-1].chance>=vis[0].chance?'#5ce3c0':'#ff778c',0);
    svg.append(g);
    // Time ticks adapt to the zoom: 3 labels (start, middle, end of view).
    const span = win.b - win.a, fmt = t => span > 36 * 3600e3 ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric' })
      : span < 10 * 60e3 ? new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : clock(t);
    [[win.a, 'start'], [(win.a + win.b) / 2, 'middle'], [win.b, 'end']].forEach(([t, an]) => { const tx = sv('text', { x: x(t), y: H - 6, class: 'viz-xlab', 'text-anchor': an }); tx.textContent = fmt(t); svg.append(tx); });
    // Read-out: selected point (tap / long-press / mouse hover), else the latest.
    const p = ui.sel != null ? pts[nearestIdx(pts, ui.sel)] : pts[pts.length - 1];
    const mk = marks.filter(m => m.t <= p.t).pop(), u = myUnit();
    if (pr) {
      // Polymarket look: a dot at each line's end (or the tapped time) with the side's name + big whole %.
      const tq = ui.sel != null ? p.t : win.b, vals = [valueAt(pts, tq), valueAt(pr.b, tq)];
      if (ui.sel != null) svg.append(sv('line', { x1: x(p.t), x2: x(p.t), y1: T, y2: H - B, class: 'viz-cross' }));
      const ly = vals.map(v => (v == null ? null : y(v)));
      if (ly[0] != null && ly[1] != null && Math.abs(ly[0] - ly[1]) < 30) { const m = (ly[0] + ly[1]) / 2, s = ly[0] <= ly[1] ? -1 : 1; ly[0] = m + s * 15; ly[1] = m - s * 15; }
      ui.quotes.hidden=false;
      ui.quotes.replaceChildren(...pr.sides.map((sd,i)=>{
        const card=el('div','viz-quote'),label=el('div','viz-quote-name',sd.name),value=el('div','viz-quote-value',vals[i]==null?'—':Math.round(vals[i])+'%');
        card.style.setProperty('--series',sd.color);card.append(label,value);return card;
      }));
      vals.forEach((v, i) => {
        if (v == null) return; const sd = pr.sides[i], cx = Math.min(x(tq), W - R);
        svg.append(sv('circle', { r: 3.5, class: 'viz-pairdot', cx, cy: y(v), fill: sd.color }));
        svg.append(sv('circle',{r:7.5,cx,cy:y(v),fill:sd.color,opacity:'.12'}));
      });
      ui.read.textContent = `${clock(tq)} CT · ` + pr.sides.map((sd, i) => vals[i] == null ? null : `${sd.name} ${Math.round(vals[i])}% (${american(vals[i])})`).filter(Boolean).join(' · ') + (mk && ui.sel != null ? ' · ' + String(mk.label).split(' · ')[0] : '');   // period only: its saved score is from the period's start and would contradict the header
    } else {
      ui.quotes.hidden=true;
      if (p.t >= win.a - 1 && p.t <= win.b + 1) {
        if (ui.sel != null) svg.append(sv('line', { x1: x(p.t), x2: x(p.t), y1: T, y2: H - B, class: 'viz-cross' }));
        svg.append(sv('circle', { r: 4, class: 'viz-dot', cx: x(p.t), cy: y(p.chance) }));
      }
      ui.read.textContent = `${clock(p.t)} CT · ${american(p.chance)} · ${Math.round(p.chance)}% chance · $${u} → $${Math.round(u * 100 / p.chance)}${mk ? ' · ' + mk.label : ''}`;
    }
    paintHead(ui.head, pr && pr.head, pr && pr.sides);
    ui.range.textContent = rangeLabel(win.a, win.b);
    const zoomed = !!ui.v.span && ui.v.span < tMax - tMin;
    ui.live.hidden = ui.v.live && ui.sel == null; ui.reset.hidden = !(zoomed || !ui.v.live);
  }
  /** Score header above a game chart: "BOS 58   Live · End Q2   45 DET" (Polymarket US event score). */
  function paintHead(head, h, sides) {
    if (!head) return;
    if (!h) { head.hidden = true; head.replaceChildren(); return; }
    const k = JSON.stringify(h); if (head.dataset.k === k && !head.hidden) return; head.dataset.k = k; head.hidden = false;
    const team = (ab, sc, right) => { const d = el('div', 'viz-hteam' + (right ? ' viz-hr' : '')); const a = el('span', 'viz-habbr', ab), s = el('span', 'viz-hscore', sc == null ? '' : String(sc)); d.append(...(right ? [s, a] : [a, s])); return d; };
    const mid = el('div', 'viz-hmid');
    mid.append(el('div', h.live ? 'viz-hlive' : 'viz-hstat', h.live ? 'Live' : h.ended ? 'Final' : 'Not started'));
    if (h.period && !h.ended) mid.append(el('div', 'viz-hper', h.period));
    head.replaceChildren(team(h.away, h.as, false), mid, team(h.home, h.hs, true));
  }

  /** Pure: Polymarket US /v1/price-history rows -> [{t, chance}] for a side (Yes = longPrice, No = shortPrice). */
  function pmHistory(j, side = 0) {
    return ((j && j.history) || []).map(r => ({ t: r.timestamp * 1000, chance: 100 * Number(side ? r.shortPrice : r.longPrice) }))
      .filter(p => p.t && p.chance > 0 && p.chance < 100);   // same points Polymarket's chart plots (only 0/100, which have no odds, dropped)
  }
  const PM = 'https://gateway.polymarket.us';
  /**
   * Price chart section for one leg (§53). Points, best first:
   *  1. Polymarket US public price history (/v1/price-history, free, CORS open): full history (INTERVAL_ALL,
   *     3-hour steps) + last day at 1-minute steps (Polymarket's Game window) + last hour at 1-minute steps. Buy prices (what you'd pay).
   *  2. else our live-tick history (data/live/<slug>-history.json) + saved snapshot points
   *     (leg.extraPoints: pick price / closing price).
   *  3. + live points from the pop-up's poller (BBO every ~1.5 s while open).
   * Hidden when there's nothing to draw and nothing to poll.
   */
  function priceSection(leg) {
    const sec = el('section', 'viz-sec');
    sec.append(el('h4', 'viz-h', '📈 Price over time'));
    const ocEl = el('div', 'oc oc-viz'); ocEl.hidden = true;   // Our chance (§56), set once a price is known
    const box = el('div', 'viz-chart'); box.append(el('div', 'viz-none', 'Loading…')); sec.append(box); sec.ocEl = ocEl;
    let game = gameInfo(null, leg.start_time || leg.startTime), cur = {}, api = [], tick = { points: [], marks: [] }, extra = [], live = [], gen = 0;
    // Game markets (moneyline / spread / total): the OTHER side's own prices too, for Polymarket's two-line look.
    let api2 = [], live2 = [], meta = null, head = null;
    const side = leg.side === 1 ? 1 : 0;
    const draw = () => {
      const basePts = api.length ? api : tick.points.concat(extra);
      const pts = basePts.concat(live).sort((x, y) => x.t - y.t);
      if (!pts.length && !leg.eventSlug && !cur.slug) { box._loading = false; box.replaceChildren(note('Polymarket', 'no market linked to chart')); return; }
      sec.hidden = false;
      if (globalThis.OurChance && pts.length && (cur.slug || leg.marketSlug) && ocEl.dataset.slug !== (cur.slug || leg.marketSlug)) {
        ocEl.dataset.slug = cur.slug || leg.marketSlug; ocEl.removeAttribute('data-oc-done'); ocEl.hidden = false;
        ocEl.setAttribute('data-oc', JSON.stringify({ marketId: ocEl.dataset.slug, side: side ? 'no' : 'yes', market: pts[pts.length - 1].chance, text: leg.text, question: leg.question, player: leg.player || null }));
        globalThis.OurChance.hydrate(ocEl.parentNode || sec);
      }
      let pair = null;
      const hd = sec.querySelector('.viz-h'); if (hd) hd.hidden = !!(meta && meta.pair);   // Polymarket-style game chart: no heading
      if (meta && meta.pair && pts.length) {
        // Each side's own Polymarket price (history shortPrice/longPrice, live short/longQuote). Only when the other
        // side has no data of its own (our live-tick file / saved points) do we fall back to 100 - x.
        const other = (api.length && api2.length ? api2 : complement(basePts)).concat(live2.length ? live2 : complement(live)).sort((x, y) => x.t - y.t);
        const [a, b] = side ? [other, pts] : [pts, other];   // long side (away team / Over) first
        pair = { sides: meta.sides, b, head };
        drawChart(box, a, tick.marks, game, pair); return;
      }
      drawChart(box, pts, tick.marks, game);
    };
    const loadApi = async slug => {
      const g = gen;
      const [all, d, h] = await Promise.all([
        getJSON(`${PM}/v1/price-history?symbol=${encodeURIComponent(slug)}&fixedInterval=INTERVAL_ALL&fidelity=180&_=${Math.floor(Date.now() / 300000)}`),
        getJSON(`${PM}/v1/price-history?symbol=${encodeURIComponent(slug)}&fixedInterval=INTERVAL_1D&fidelity=1&_=${Math.floor(Date.now() / 30000)}`),
        getJSON(`${PM}/v1/price-history?symbol=${encodeURIComponent(slug)}&fixedInterval=INTERVAL_1H&fidelity=1&_=${Math.floor(Date.now() / 30000)}`)]);
      if (g !== gen) return;
      box._loading = false; box._err = !all && !d && !h;   // every request failed: say so, retry in 15 s
      if (box._err) setTimeout(() => { if (g === gen && !api.length) loadApi(slug); }, 15000);
      const hr = pmHistory(h, side), cut = hr.length ? hr[0].t : Infinity;
      const dy = pmHistory(d, side).filter(p => p.t < cut), dcut = dy.length ? dy[0].t : cut;
      api = pmHistory(all, side).filter(p => p.t < dcut).concat(dy, hr);   // All (3 h steps) + day (5 min) + hour (1 min)
      const hr2 = pmHistory(h, 1 - side), c2 = hr2.length ? hr2[0].t : Infinity, dy2 = pmHistory(d, 1 - side).filter(p => p.t < c2), d2 = dy2.length ? dy2[0].t : c2;
      api2 = pmHistory(all, 1 - side).filter(p => p.t < d2).concat(dy2, hr2);   // other side, same windows
      draw();
    };
    sec.slug = () => cur.slug || null;
    sec.showMarket = (marketId, marketSlug) => {
      if (marketId === cur.id && marketSlug === cur.slug && gen) return;
      gen++; cur = { id: marketId, slug: marketSlug }; api = []; live = []; api2 = []; live2 = []; meta = null; box._ui = null; box._loading = !!(marketSlug || leg.eventSlug); box._err = false;   // new market: fresh view
      const own = (marketSlug && marketSlug === leg.marketSlug) || (marketId != null && marketId === leg.marketId);
      extra = own ? (leg.extraPoints || []).filter(x => x && x.chance > 0 && x.chance < 100).map(x => ({ t: Date.parse(x.t), chance: +x.chance })).filter(x => x.t) : [];
      tick = { points: [], marks: [] };
      if (leg.eventSlug) {
        const g = gen;
        getJSON(`data/live/${leg.eventSlug}-history.json?ts=${Math.floor(Date.now() / 60000)}`).then(h => {
          if (g !== gen) return;
          if (!cur.slug && h && h.ids && cur.id != null) cur.slug = Object.keys(h.ids).find(k => String(h.ids[k]) === String(cur.id)) || null;
          tick = seriesFor(h, { marketId: cur.id, marketSlug: cur.slug }, side);
          if (cur.slug && !api.length) loadApi(cur.slug); else { if (!cur.slug) box._loading = false; draw(); }
        });
      }
      if (marketSlug) loadApi(marketSlug); else draw();
    };
    /** Event payload (poll): learn the slug for Live Bets cards that only know the id. */
    sec.fromEvent = ev => {
      const gi = gameInfo(ev, leg.start_time || leg.startTime);
      const ps = pairSides(ev, cur), hd = scoreHeader(ev);
      const chg = JSON.stringify([ps, hd]) !== JSON.stringify([meta, head]); if (ps) meta = ps; head = hd;
      if (gi && (!game || gi.status !== game.status || gi.end !== game.end)) { game = gi; draw(); } else if (chg) draw();
      if (cur.slug) return;
      const m = ((ev && ev.markets) || []).find(x => cur.id != null && String(x.id) === String(cur.id));
      if (m && m.slug) { cur.slug = m.slug; loadApi(m.slug); }
    };
    /** BBO payload (poll): add a live point. */
    sec.fromBbo = md => {
      if (!md || md.marketSlug !== cur.slug) return;
      // Same field as Polymarket's chart history: longQuote (Yes) / shortQuote (No); else BBO ask / 1 - bid.
      const q = Number((side ? md.shortQuote : md.longQuote) && (side ? md.shortQuote : md.longQuote).value);
      const b = Number(md.bestBid && md.bestBid.value), a = Number(md.bestAsk && md.bestAsk.value);
      const c = q > 0 && q < 1 ? q * 100 : side ? (b > 0 ? 100 - b * 100 : null) : (a > 0 ? a * 100 : null);
      if (!(c > 0 && c < 100)) return;
      const add = (arr, v) => { const last = arr[arr.length - 1];
        if (last && Date.now() - last.t < 60000 && Math.abs(last.chance - v) < 0.05) { last.t = Date.now(); } else arr.push({ t: Date.now(), chance: v });
        if (arr.length > 2000) arr.shift(); };
      add(live, c);
      const q2 = Number((side ? md.longQuote : md.shortQuote) && (side ? md.longQuote : md.shortQuote).value);   // other side's own quote
      if (q2 > 0 && q2 < 1) add(live2, q2 * 100);
      draw();
      return true;
    };
    sec.showMarket(leg.marketId, leg.marketSlug);
    return sec;
  }

  /**
   * Pure: the lines Polymarket US lists for the same player + stat in this
   * event (sibling markets), e.g. Tatum 15+ / 20+ / 25+ / 30+ points.
   * Returns [{ n, id, slug, yesBuy, noBuy }] sorted by n (buy prices in chance points or null).
   */
  function siblingLines(ev, p) {
    const out = new Map(), who = p.player.toLowerCase();
    for (const m of (ev && ev.markets) || []) {
      if (!/_player_/.test(m.sportsMarketType || '') || m.closed || m.active === false) continue;
      const q = parseProp({ question: m.question, league: p.league });
      if (!q || q.player.toLowerCase() !== who || q.stat.key !== p.stat.key || out.has(q.n)) continue;
      const b = Number(m.bestBidQuote && m.bestBidQuote.value), a = Number(m.bestAskQuote && m.bestAskQuote.value);
      out.set(q.n, { n: q.n, id: String(m.id), slug: m.slug, yesBuy: a > 0 ? a * 100 : null, noBuy: b > 0 ? 100 - b * 100 : null });
    }
    return [...out.values()].sort((x, y) => x.n - y.n);
  }

  /** Bars section for one prop bet. */
  function propSection(p, leg = {}, chart = null) {
    const sec = el('section', 'viz-sec');
    const sub = el('div', 'viz-sub', `Line: ${p.n}+ ${p.stat.label}`);
    const chips = el('div', 'viz-chips'), price = el('div', 'viz-price');
    sec.append(el('h4', 'viz-h', `📊 Prop bet history: ${p.player}`), sub, chips, price);
    // Line chips: ONLY lines Polymarket US lists for this player + stat in this game.
    let lines = [], n = p.n, redraw = () => {};
    const no = leg.side === 1;
    const drawChips = () => {
      chips.replaceChildren();
      const list = lines.length ? lines : [{ n: p.n }];
      for (const L of list) {
        const b = el('button', 'viz-chip' + (L.n === n ? ' on' : ''), `${L.n}+`); b.type = 'button';
        b.onclick = () => { n = L.n; drawChips(); redraw(); }; chips.append(b);
      }
      const cur = lines.find(L => L.n === n);
      sub.textContent = `Line: ${no ? 'under ' + n : n + '+'} ${p.stat.label}`;
      const c = cur && (no ? cur.noBuy : cur.yesBuy);
      price.replaceChildren(el('span', 'viz-price-main', c > 0 && c < 100 ? `${no ? 'Under ' + n : n + '+'}: ${american(c)} · $10 pays $${Math.floor(1000 / c)}` : 'No price right now'),
        el('span', 'viz-onpm', ' on Polymarket'));
      if (chart && cur) chart.showMarket(cur.id, cur.slug);
    };
    drawChips();
    let first = true;
    sec.setEvent = ev => {   // first call + every live poll (§53): refresh chips + prices
      lines = siblingLines(ev, p);
      if (first && lines.length && !lines.some(L => L.n === p.n)) n = lines.reduce((a, L) => Math.abs(L.n - p.n) < Math.abs(a.n - p.n) ? L : a).n;
      first = false; drawChips(); redraw();
    };
    const tabs = el('div', 'viz-tabs'), body = el('div', 'viz-bars-wrap'); body.append(el('div', 'viz-none', 'Loading games…'));
    sec.append(tabs, body);
    const base = 'https://site.web.api.espn.com/apis';
    const load = () => (async () => {
      const sr = await getJSON(`${base}/search/v2?query=${encodeURIComponent(p.player)}&limit=10&type=player&_=${Date.now() % 1e6}`);
      const hit = ((sr && sr.results) || []).flatMap(r => r.contents || []).find(c => (p.league ? c.defaultLeagueSlug === p.league : !!ESPN_PATH[c.defaultLeagueSlug]) && /a:(\d+)/.test(c.uid || ''));
      if (hit && !p.league) p.league = hit.defaultLeagueSlug;
      if (!sr) { body.replaceChildren(note('', "Couldn't reach ESPN · retrying")); setTimeout(load, 15000); return; }
      if (!hit) { body.replaceChildren(note('ESPN', `no games found for ${p.player}`)); return; }
      const id = /a:(\d+)/.exec(hit.uid)[1], url = `${base}/common/v3/sports/${ESPN_PATH[p.league]}/athletes/${id}/gamelog`;
      const log = await getJSON(url);
      let all = gamesFromLog(log, p.stat);
      const season = log && (log.filters || []).find(f => f.name === 'season');
      const prevLog = season && season.value ? await getJSON(`${url}?season=${season.value - 1}`) : null;
      all = all.concat(gamesFromLog(prevLog, p.stat).map(g => Object.assign(g, { last: true })));   // tagged, never mixed into current-season views
      const seen = new Set(); all = all.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.date.localeCompare(a.date));
      tagSeason(all, p.league);
      if (!log) { body.replaceChildren(note('', "Couldn't reach ESPN · retrying")); setTimeout(load, 15000); return; }
      if (!all.length) { body.replaceChildren(note('ESPN', `no ${p.stat.label} games yet to chart`)); return; }
      const myTeam = espnAbbr(all[0].team), opp = [p.away, p.home].map(espnAbbr).find(a => a && a !== myTeam) || null;
      let mode = 'L10';
      const draw = () => {
        tabs.replaceChildren();
        for (const m of ['L5', 'L10', 'H2H', 'Season', 'Last']) {
          const b = el('button', 'viz-tab' + (m === mode ? ' on' : ''), m === 'H2H' && opp ? `vs ${opp.toUpperCase()}` : m === 'Last' ? 'Last season' : m); b.type = 'button';
          b.onclick = () => { mode = m; draw(); }; tabs.append(b);
        }
        const gs = pickGames(all, mode, opp).slice().reverse();   // oldest on the left
        body.replaceChildren();
        if (!gs.length) { body.append(note('ESPN', mode === 'H2H' ? 'no games vs this team this season' : mode === 'Last' ? 'no games last season' : 'not enough games yet to chart')); return; }
        const s = summary(gs, n);
        const seasons = [...new Set(gs.map(g => String(g.season).replace(/ Regular Season/, '')))].join(', ');
        body.append(el('div', 'viz-hit', `Hit in ${s.hits} of ${s.total} games · Average ${s.avg} ${p.stat.label}`), el('div', 'viz-season', seasons));
        const max = Math.max(n * 1.4, ...gs.map(g => g.value), 1);
        const bars = el('div', 'viz-bars');
        const line = el('div', 'viz-line-dash'); line.style.bottom = `calc(${(100 * n / max).toFixed(1)}% )`;
        const lab = el('span', 'viz-line-lab', `${n}+`); line.append(lab); bars.append(line);
        for (const g of gs) {
          const col = el('div', 'viz-col');
          const bar = el('div', 'viz-bar ' + (g.value >= n ? 'viz-hitbar' : 'viz-miss'));
          bar.style.height = `${Math.max(2, 100 * g.value / max).toFixed(1)}%`;
          bar.append(el('span', 'viz-val', String(g.value)));
          const d = g.date ? new Date(g.date) : null;
          col.append(bar);
          bars.append(col);
          col.title = `${g.opp} ${d ? d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}`;
        }
        const labs = el('div', 'viz-xlabs');
        for (const g of gs) { const d = g.date ? new Date(g.date) : null; const c = el('div', 'viz-xl'); c.append(el('div', null, g.opp), el('div', 'viz-xd', d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : '')); labs.append(c); }
        body.append(bars, labs);
      };
      redraw = draw;
      draw();
    })().catch(() => { body.replaceChildren(note('', "Couldn't reach ESPN · retrying")); setTimeout(load, 15000); });
    load();
    return sec;
  }

  /** Our chance (§56): a player's games for a parsed prop (ESPN search + gamelog, + last season if short), cached. */
  const gamesCache = new Map();
  function loadGames(p) {
    const k = p.player + '|' + p.league + '|' + p.stat.key;
    if (gamesCache.has(k)) return gamesCache.get(k);
    const base = 'https://site.web.api.espn.com/apis';
    const job = (async () => {
      const sr = await getJSON(`${base}/search/v2?query=${encodeURIComponent(p.player)}&limit=10&type=player`);
      const hit = ((sr && sr.results) || []).flatMap(r => r.contents || []).find(c => (p.league ? c.defaultLeagueSlug === p.league : !!ESPN_PATH[c.defaultLeagueSlug]) && /a:(\d+)/.test(c.uid || ''));
      if (!hit) return null;
      const league = p.league || hit.defaultLeagueSlug, id = /a:(\d+)/.exec(hit.uid)[1], url = `${base}/common/v3/sports/${ESPN_PATH[league]}/athletes/${id}/gamelog`;
      const log = await getJSON(url);
      let all = gamesFromLog(log, p.stat);
      const season = log && (log.filters || []).find(f => f.name === 'season');
      const prevLog = season && season.value ? await getJSON(`${url}?season=${season.value - 1}`) : null;
      all = all.concat(gamesFromLog(prevLog, p.stat).map(g => Object.assign(g, { last: true })));   // tagged, never mixed into current-season views
      const seen = new Set(); all = all.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.date.localeCompare(a.date));
      tagSeason(all, league);
      return { games: all, team: all[0] ? all[0].team : null, id, league, log, prevLog };
    })().catch(() => null);
    gamesCache.set(k, job); return job;
  }

  // LIVE (§53): while the pop-up is open and the tab is visible, poll Polymarket US's
  // public BBO for each chart's market as fast as allowed (~1 s since Oct 20; public limit is
  // 20 requests/s per IP), plus the event every ~8 s for line-chip prices. On a 429
  // the delay doubles (max 30 s) and eases back after successes. Browser only, free.
  // (Their WebSocket needs an API key, so it can't be used from the page.)
  const LIVE_MIN_MS = 1000, LIVE_MAX_MS = 30000, EVENT_EVERY_MS = 8000;
  let liveStop = null;
  function close() {
    if (liveStop) { liveStop(); liveStop = null; }
    document.querySelectorAll('.viz-back').forEach(n => n.remove()); document.removeEventListener('keydown', esc);
  }
  function startLive(subs, charts, statusEl) {
    const slugs = [...new Set(subs.map(x => x.slug))];
    let timer = null, dead = false, delay = LIVE_MIN_MS, lastEv = 0, okAt = 0, running = false;
    const controller = new AbortController();
    const get = async url => {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (r.status === 429) { const e = new Error('429'); e.rate = true; throw e; }
      return r.ok ? r.json() : null;
    };
    const tick = async () => {
      timer = null;
      if (dead || running) return;
      if (document.visibilityState !== 'visible') return;          // resumes on visibilitychange
      running = true;
      const started = Date.now();
      let limited = false;
      const attempt = async fn => { try { await fn(); } catch (e) { if (e.rate) limited = true; } };
      const jobs = [];
        if (Date.now() - lastEv >= EVENT_EVERY_MS) {
          lastEv = Date.now();
          jobs.push(...slugs.map(sl => attempt(async () => { const j = await get(`${PM}/v1/events/slug/${sl}`); const ev = j && (j.event || j);
            if (ev && !dead) subs.filter(x => x.slug === sl).forEach(x => { try { x.fn(ev); } catch (e) { /* one bad leg */ } }); })));
        }
        const want = [...new Set(charts.map(c => c.slug()).filter(Boolean))];
        jobs.push(...want.map(ms => attempt(async () => { const j = await get(`${PM}/v1/markets/${encodeURIComponent(ms)}/bbo`);
          if (j && j.marketData && !dead) charts.forEach(c => { if(c.fromBbo(j.marketData))okAt = Date.now(); }); })));
      await Promise.all(jobs);
      running = false;
      delay = limited ? Math.min(LIVE_MAX_MS, delay * 2) : Math.max(LIVE_MIN_MS, Math.round(delay * 0.8));
      if (dead) return;
      statusEl.textContent = limited ? `Polymarket asked us to slow down. Next check in ${Math.round(delay / 1000)}s.`
        : okAt && Date.now() - okAt < 15000 ? `🟢 Live from Polymarket · ${new Date(okAt).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',second:'2-digit'})} CT · checks every ${(delay / 1000).toFixed(1)}s`
        : 'Live prices not reachable right now. Showing saved prices.';
      timer = setTimeout(tick, Math.max(0, delay - (Date.now() - started)));
    };
    const vis = () => { if (document.visibilityState === 'visible' && !timer && !dead) tick(); };
    tick();
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; controller.abort(); if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', vis); };
  }
  function esc(e) { if (e.key === 'Escape') close(); }

  /** Open the pop-up. Up to MAX_LEGS legs get charts. */
  const MAX_LEGS = 10;
  function open(spec) {
    close();
    const back = el('div', 'sheet-back viz-back');
    const sheet = el('div', 'sheet card viz-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    const x = el('button', 'sheet-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    const legs = (spec.legs || []).slice(0, MAX_LEGS);
    const subs = [], charts = [], liveEl = el('div', 'viz-live');
    // One prop bet: a short plain title ("Jayson Tatum 25+ points" / "Jayson Tatum under 25 points").
    const p1 = legs.length === 1 && parseProp(legs[0]);
    const title = p1 ? (legs[0].side === 1 ? `${p1.player} under ${p1.n} ${p1.stat.label}` : `${p1.player} ${p1.n}+ ${p1.stat.label}`) : spec.title;
    sheet.append(x, el('div', 'viz-title', title || 'Bet'));
    if (spec.sub) sheet.append(el('div', 'viz-subtitle', String(spec.sub).replace(/Player prop/g, 'Prop bet')));
    for (const leg of legs) {
      const wrap = el('div', 'viz-leg');
      if (legs.length > 1) wrap.append(el('div', 'viz-legname', leg.text || leg.question || ''));
      const p = parseProp(leg), chart = priceSection(leg);
      let ps = null;
      if (chart.ocEl) wrap.append(chart.ocEl);   // Analytics + Dig deeper first, no scrolling (§57)
      if (p) { ps = propSection(p, leg, chart); wrap.append(ps); }
      wrap.append(chart);
      charts.push(chart);
      if (leg.eventSlug) subs.push({ slug: leg.eventSlug, fn: ev => { if (ps) ps.setEvent(ev); chart.fromEvent(ev); } });
      sheet.append(wrap);
    }
    if ((spec.legs || []).length > MAX_LEGS) sheet.append(el('div', 'viz-none', `Showing the first ${MAX_LEGS} picks.`));
    if (subs.length || charts.some(c => c.slug())) { sheet.insertBefore(liveEl, sheet.children[spec.sub ? 3 : 2] || null); liveStop = startLive(subs, charts, liveEl); }
    back.append(sheet);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', esc);
    document.body.append(back);
    x.focus();
  }

  /** A standalone live price chart for one bet (same history + ~1 s polling as the pop-up). Returns { el, stop }. */
  function liveChart(leg) {
    const chart = priceSection(leg), st = el('div', 'viz-live'), wrap = el('div', 'viz-sheet dd-live');
    wrap.append(st, chart);
    const stop = startLive(leg.eventSlug ? [{ slug: leg.eventSlug, fn: ev => chart.fromEvent(ev) }] : [], [chart], st);
    return { el: wrap, stop };
  }

  /** HTML for a "📊 Chart" button that opens this spec (any renderer can drop it in). */
  const escA = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const chartBtn = (spec, label = '📊 Chart') => `<button type="button" class="chart-btn" data-viz="${escA(JSON.stringify(spec))}">${escA(label)}</button>`;
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-viz]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    try { open(JSON.parse(b.dataset.viz)); } catch (err) { /* bad spec */ }
  }, true);

  /** Event slug from a Polymarket US event URL. */
  const slugFromUrl = u => { const m = /\/([a-z]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})(?:[/?#]|$)/.exec(u || ''); return m ? m[1] : null; };

  return { startLive, TEAM_COLORS, legible, teamColor, pairSides, scoreHeader, curvePath, stepPoints, complement, valueAt, note, noteText, blankVisuals, VISUALS, liveChart, seasonStart, tagSeason, loadGames, ESPN_PATH, espnAbbr, open, close, chartBtn, pmHistory, viewWindow, prepSeries, nearestIdx, defaultView, gameInfo, fitY, rangeLabel, parseProp, siblingLines, gamesFromLog, summary, pickGames, seriesFor, american, slugFromUrl, statOf };
});
