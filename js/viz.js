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
        out.push({ id: e.eventId, date: meta.gameDate || '', opp: (meta.opponent && meta.opponent.abbreviation) || '', team: (meta.team && meta.team.abbreviation) || '', season: st.displayName || '', value: v });
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

  /** Pure: which games a toggle shows. */
  function pickGames(all, mode, oppAbbr) {
    if (mode === 'L5') return all.slice(0, 5);
    if (mode === 'L10') return all.slice(0, 10);
    if (mode === 'H2H') return all.filter(g => oppAbbr && espnAbbr(g.opp) === espnAbbr(oppAbbr)).slice(0, 10);
    // "2025-26 Postseason" and "2025-26 Regular Season" are the same season.
    const yr = g => String(g.season).split(' ')[0];
    const season = all[0] && yr(all[0]);
    return all.filter(g => yr(g) === season);
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
  const cache = {};
  const getJSON = url => (cache[url] = cache[url] || fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));

  /** Draw the price line into box. */
  function drawChart(box, points, marks) {
    box.replaceChildren();
    if (points.length < 2) {
      box.append(el('div', 'viz-none', points.length ? `Only one price so far: ${american(points[0].chance)} (${Math.round(points[0].chance)}% chance). The line grows while the game is tracked.` : 'No price history yet. The line starts when our live tracker checks this game.'));
      return;
    }
    const W = 340, H = 170, L = 44, R = 8, T = 10, B = 22;
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    let lo = Math.min(...points.map(p => p.chance)), hi = Math.max(...points.map(p => p.chance));
    if (hi - lo < 6) { const m = (hi + lo) / 2; lo = m - 3; hi = m + 3; }
    lo = Math.max(1, lo - 2); hi = Math.min(99, hi + 2);
    const x = t => L + (W - L - R) * (t - t0) / Math.max(1, t1 - t0), y = c => T + (H - T - B) * (hi - c) / (hi - lo);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'img', 'aria-label': 'Price over time' });
    for (const c of [hi, (hi + lo) / 2, lo]) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: y(c), y2: y(c), class: 'viz-grid' }));
      const tx = sv('text', { x: L - 4, y: y(c) + 4, class: 'viz-ylab', 'text-anchor': 'end' }); tx.textContent = american(c); svg.append(tx);
    }
    for (const m of marks) if (m.t >= t0 && m.t <= t1) {
      svg.append(sv('line', { x1: x(m.t), x2: x(m.t), y1: T, y2: H - B, class: 'viz-mark' }));
      const tx = sv('text', { x: x(m.t) + 2, y: T + 9, class: 'viz-mlab' }); tx.textContent = String(m.label).split(' · ')[0]; svg.append(tx);
    }
    const up = points[points.length - 1].chance >= points[0].chance;
    svg.append(sv('polyline', { points: points.map(p => `${x(p.t).toFixed(1)},${y(p.chance).toFixed(1)}`).join(' '), class: 'viz-line ' + (up ? 'viz-up' : 'viz-down') }));
    const day = t => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short' });
    for (const [t, a] of [[t0, 'start'], [t1, 'end']]) { const tx = sv('text', { x: x(t), y: H - 6, class: 'viz-xlab', 'text-anchor': a }); tx.textContent = (t1 - t0 > 12 * 3600e3 ? day(t) + ' ' : '') + clock(t); svg.append(tx); }
    const dot = sv('circle', { r: 4, class: 'viz-dot', cx: x(t1), cy: y(points[points.length - 1].chance) }); svg.append(dot);
    const read = el('div', 'viz-read');
    const show = p => {
      dot.setAttribute('cx', x(p.t)); dot.setAttribute('cy', y(p.chance));
      const mk = marks.filter(m => m.t <= p.t).pop();
      read.textContent = `${clock(p.t)} CT · ${american(p.chance)} · ${Math.round(p.chance)}% chance · $10 pays $${Math.floor(1000 / p.chance)}${mk ? ' · ' + mk.label : ''}`;
    };
    const near = ev => {
      const r = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * W / r.width;
      let best = points[0]; for (const p of points) if (Math.abs(x(p.t) - cx) < Math.abs(x(best.t) - cx)) best = p; show(best);
    };
    svg.addEventListener('pointermove', near); svg.addEventListener('pointerdown', near);
    svg.addEventListener('touchmove', e => { near(e); e.preventDefault(); }, { passive: false });
    show(points[points.length - 1]);
    box.append(svg, read);
  }

  /** Pure: Polymarket US /v1/price-history rows -> [{t, chance}] for a side (Yes = longPrice, No = shortPrice). */
  function pmHistory(j, side = 0) {
    return ((j && j.history) || []).map(r => ({ t: r.timestamp * 1000, chance: 100 * Number(side ? r.shortPrice : r.longPrice) }))
      .filter(p => p.t && p.chance > 2 && p.chance < 98);   // drop empty-book extremes (99% spikes)
  }
  const PM = 'https://gateway.polymarket.us';
  /**
   * Price chart section for one leg (§53). Points, best first:
   *  1. Polymarket US public price history (/v1/price-history, free, CORS open): last day at
   *     5-minute steps + last hour at 1-minute steps. Buy prices (what you'd pay).
   *  2. else our live-tick history (data/live/<slug>-history.json) + saved snapshot points
   *     (leg.extraPoints: pick price / closing price).
   *  3. + live points from the pop-up's poller (BBO every ~1.5 s while open).
   * Hidden when there's nothing to draw and nothing to poll.
   */
  function priceSection(leg) {
    const sec = el('section', 'viz-sec');
    sec.append(el('h4', 'viz-h', '📈 Price over time'));
    const box = el('div', 'viz-chart'); box.append(el('div', 'viz-none', 'Loading…')); sec.append(box);
    let cur = {}, api = [], tick = { points: [], marks: [] }, extra = [], live = [], gen = 0;
    const side = leg.side === 1 ? 1 : 0;
    const draw = () => {
      const basePts = api.length ? api : tick.points.concat(extra);
      const pts = basePts.concat(live).sort((x, y) => x.t - y.t);
      if (!pts.length && !leg.eventSlug && !cur.slug) { sec.hidden = true; return; }
      sec.hidden = false;
      drawChart(box, pts, tick.marks);
    };
    const loadApi = async slug => {
      const g = gen;
      const [d, h] = await Promise.all([
        getJSON(`${PM}/v1/price-history?symbol=${encodeURIComponent(slug)}&fixedInterval=INTERVAL_1D&fidelity=5&_=${Math.floor(Date.now() / 30000)}`),
        getJSON(`${PM}/v1/price-history?symbol=${encodeURIComponent(slug)}&fixedInterval=INTERVAL_1H&fidelity=1&_=${Math.floor(Date.now() / 30000)}`)]);
      if (g !== gen) return;
      const hr = pmHistory(h, side), cut = hr.length ? hr[0].t : Infinity;
      api = pmHistory(d, side).filter(p => p.t < cut).concat(hr);
      draw();
    };
    sec.slug = () => cur.slug || null;
    sec.showMarket = (marketId, marketSlug) => {
      if (marketId === cur.id && marketSlug === cur.slug && gen) return;
      gen++; cur = { id: marketId, slug: marketSlug }; api = []; live = [];
      const own = (marketSlug && marketSlug === leg.marketSlug) || (marketId != null && marketId === leg.marketId);
      extra = own ? (leg.extraPoints || []).filter(x => x && x.chance > 0 && x.chance < 100).map(x => ({ t: Date.parse(x.t), chance: +x.chance })).filter(x => x.t) : [];
      tick = { points: [], marks: [] };
      if (leg.eventSlug) {
        const g = gen;
        getJSON(`data/live/${leg.eventSlug}-history.json?ts=${Math.floor(Date.now() / 60000)}`).then(h => {
          if (g !== gen) return;
          if (!cur.slug && h && h.ids && cur.id != null) cur.slug = Object.keys(h.ids).find(k => String(h.ids[k]) === String(cur.id)) || null;
          tick = seriesFor(h, { marketId: cur.id, marketSlug: cur.slug }, side);
          if (cur.slug && !api.length) loadApi(cur.slug); else draw();
        });
      }
      if (marketSlug) loadApi(marketSlug); else draw();
    };
    /** Event payload (poll): learn the slug for Live Bets cards that only know the id. */
    sec.fromEvent = ev => {
      if (cur.slug) return;
      const m = ((ev && ev.markets) || []).find(x => cur.id != null && String(x.id) === String(cur.id));
      if (m && m.slug) { cur.slug = m.slug; loadApi(m.slug); }
    };
    /** BBO payload (poll): add a live point. */
    sec.fromBbo = md => {
      if (!md || md.marketSlug !== cur.slug) return;
      const b = Number(md.bestBid && md.bestBid.value), a = Number(md.bestAsk && md.bestAsk.value);
      const c = side ? (b > 0 ? 100 - b * 100 : null) : (a > 0 ? a * 100 : null);
      if (!(c > 0 && c < 100)) return;
      const last = live[live.length - 1];
      if (last && Date.now() - last.t < 60000 && Math.abs(last.chance - c) < 0.05) { last.t = Date.now(); } else live.push({ t: Date.now(), chance: c });
      if (live.length > 2000) live.shift();
      draw();
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
    (async () => {
      const sr = await getJSON(`${base}/search/v2?query=${encodeURIComponent(p.player)}&limit=10&type=player`);
      const hit = ((sr && sr.results) || []).flatMap(r => r.contents || []).find(c => (p.league ? c.defaultLeagueSlug === p.league : !!ESPN_PATH[c.defaultLeagueSlug]) && /a:(\d+)/.test(c.uid || ''));
      if (hit && !p.league) p.league = hit.defaultLeagueSlug;
      if (!hit) { body.replaceChildren(el('div', 'viz-none', `Couldn't find ${p.player}'s games on ESPN.`)); return; }
      const id = /a:(\d+)/.exec(hit.uid)[1], url = `${base}/common/v3/sports/${ESPN_PATH[p.league]}/athletes/${id}/gamelog`;
      const log = await getJSON(url);
      let all = gamesFromLog(log, p.stat);
      const season = log && (log.filters || []).find(f => f.name === 'season');
      if (all.length < 10 && season && season.value) all = all.concat(gamesFromLog(await getJSON(`${url}?season=${season.value - 1}`), p.stat));
      const seen = new Set(); all = all.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.date.localeCompare(a.date));
      if (!all.length) { body.replaceChildren(el('div', 'viz-none', `No ${p.stat.label} games found for ${p.player} yet.`)); return; }
      const myTeam = espnAbbr(all[0].team), opp = [p.away, p.home].map(espnAbbr).find(a => a && a !== myTeam) || null;
      let mode = 'L10';
      const draw = () => {
        tabs.replaceChildren();
        for (const m of ['L5', 'L10', 'H2H', 'Season']) {
          const b = el('button', 'viz-tab' + (m === mode ? ' on' : ''), m === 'H2H' && opp ? `vs ${opp.toUpperCase()}` : m); b.type = 'button';
          b.onclick = () => { mode = m; draw(); }; tabs.append(b);
        }
        const gs = pickGames(all, mode, opp).slice().reverse();   // oldest on the left
        body.replaceChildren();
        if (!gs.length) { body.append(el('div', 'viz-none', mode === 'H2H' ? 'No recent games against this team.' : 'No games here yet.')); return; }
        const s = summary(gs, n);
        body.append(el('div', 'viz-hit', `Hit in ${s.hits} of ${s.total} games · Average ${s.avg} ${p.stat.label}`));
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
    })().catch(() => body.replaceChildren(el('div', 'viz-none', 'Couldn\'t load games right now. Try again later.')));
    return sec;
  }

  // LIVE (§53): while the pop-up is open and the tab is visible, poll Polymarket US's
  // public BBO for each chart's market as fast as allowed (~1.5 s; public limit is
  // 20 requests/s per IP), plus the event every ~8 s for line-chip prices. On a 429
  // the delay doubles (max 30 s) and eases back after successes. Browser only, free.
  // (Their WebSocket needs an API key, so it can't be used from the page.)
  const LIVE_MIN_MS = 1500, LIVE_MAX_MS = 30000, EVENT_EVERY_MS = 8000;
  let liveStop = null;
  function close() {
    if (liveStop) { liveStop(); liveStop = null; }
    document.querySelectorAll('.viz-back').forEach(n => n.remove()); document.removeEventListener('keydown', esc);
  }
  function startLive(subs, charts, statusEl) {
    const slugs = [...new Set(subs.map(x => x.slug))];
    let timer = null, dead = false, delay = LIVE_MIN_MS, lastEv = 0, okAt = 0;
    const get = async url => {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.status === 429) { const e = new Error('429'); e.rate = true; throw e; }
      return r.ok ? r.json() : null;
    };
    const tick = async () => {
      timer = null;
      if (dead) return;
      if (document.visibilityState !== 'visible') return;          // resumes on visibilitychange
      let limited = false;
      try {
        if (Date.now() - lastEv >= EVENT_EVERY_MS) {
          lastEv = Date.now();
          await Promise.all(slugs.map(async sl => { const j = await get(`${PM}/v1/events/slug/${sl}`); const ev = j && (j.event || j);
            if (ev && !dead) subs.filter(x => x.slug === sl).forEach(x => { try { x.fn(ev); } catch (e) { /* one bad leg */ } }); }));
        }
        const want = [...new Set(charts.map(c => c.slug()).filter(Boolean))];
        await Promise.all(want.map(async ms => { const j = await get(`${PM}/v1/markets/${encodeURIComponent(ms)}/bbo`);
          if (j && j.marketData && !dead) { okAt = Date.now(); charts.forEach(c => c.fromBbo(j.marketData)); } }));
        delay = Math.max(LIVE_MIN_MS, Math.round(delay * 0.8));
      } catch (e) { if (e.rate) { limited = true; delay = Math.min(LIVE_MAX_MS, delay * 2); } }
      if (dead) return;
      statusEl.textContent = limited ? `Polymarket asked us to slow down. Next check in ${Math.round(delay / 1000)}s.`
        : okAt && Date.now() - okAt < 15000 ? `🟢 Live from Polymarket · ${clock(okAt)} CT · checks every ${(delay / 1000).toFixed(1)}s`
        : 'Live prices not reachable right now. Showing saved prices.';
      timer = setTimeout(tick, delay);
    };
    const vis = () => { if (document.visibilityState === 'visible' && !timer && !dead) tick(); };
    tick();
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', vis); };
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
      if (p) { ps = propSection(p, leg, chart); wrap.append(ps); }
      wrap.append(chart);
      charts.push(chart);
      if (leg.eventSlug) subs.push({ slug: leg.eventSlug, fn: ev => { if (ps) ps.setEvent(ev); chart.fromEvent(ev); } });
      sheet.append(wrap);
    }
    if ((spec.legs || []).length > MAX_LEGS) sheet.append(el('div', 'viz-none', `Showing the first ${MAX_LEGS} picks.`));
    sheet.append(el('div', 'viz-foot', 'Price line: Polymarket US buy price over time, live while this is open. Bars: past games from ESPN. Past games don\'t promise the next one.'));
    if (subs.length || charts.some(c => c.slug())) { sheet.insertBefore(liveEl, sheet.children[spec.sub ? 3 : 2] || null); liveStop = startLive(subs, charts, liveEl); }
    back.append(sheet);
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', esc);
    document.body.append(back);
    x.focus();
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

  return { open, close, chartBtn, pmHistory, parseProp, siblingLines, gamesFromLog, summary, pickGames, seriesFor, american, slugFromUrl, statOf };
});
