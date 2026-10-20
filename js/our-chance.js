/**
 * js/our-chance.js — "Our chance" (HANDOFF §56). One number per bet that does NOT rely
 * only on the market price. Browser: window.OurChance; Node: module.exports (scripts/tests).
 * Information only, never advice.
 *
 * THE BLEND (plain words)
 *   1. History (stats estimate, 0-1):
 *      Props (ESPN gamelog): hit rate at the exact line for Season, L10, L5, vs this opponent
 *      and at home/away. Small samples are shrunk toward a prior with a beta prior:
 *        rate = (hits + k * prior) / (games + k)
 *      Season shrinks toward 50% (k=4); L10 / L5 / vs-opp / home-away shrink toward the
 *      season rate (k=8). Plus "average vs the line": P(value >= n) from a normal with the
 *      season mean and spread. These are blended in log-odds with weights
 *      L10 .30, Season .25, Avg .20, L5 .10, vs-opp .08, home/away .07 (missing ones dropped).
 *      Games (ESPN team schedules): rating win chance from average point margins
 *      (shrunk toward 0 by n/(n+5)) + home edge, normal with a per-sport spread; log5 of
 *      shrunk win %; recent form (L10 win %, shrunk to season); head-to-head (k=6).
 *      Weights rating .5, log5 .2, form .2, h2h .1. Spreads and totals use the same normal
 *      model on the expected margin / expected total (points for and against).
 *   2. Vegas, no-vig: both sides -> p_yes / (p_yes + p_no); one side only -> implied / 1.045.
 *   3. Market: the Polymarket price (chance).
 *   Final: weighted log-odds average. Weights: Vegas .45, Market .30, History .25 * q
 *   (q = data quality = min(1, games / 15)); without Vegas: Market .55, History .45 * q.
 *   Missing parts are dropped and the rest renormalized. Clamped to 3-97 %.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OurChance = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const logit = p => { p = clamp(p, 1e-4, 1 - 1e-4); return Math.log(p / (1 - p)); };
  const expit = z => 1 / (1 + Math.exp(-z));
  /** Standard normal CDF (Abramowitz-Stegun 7.1.26). */
  function phi(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  /** Beta-prior shrink: (hits + k*prior) / (n + k). */
  const shrink = (hits, n, prior, k) => (hits + k * prior) / (n + k);
  /** Weighted log-odds average of [{p, w}] (p in 0-1; null / w<=0 dropped). */
  function logAvg(parts) {
    const ok = parts.filter(x => x && x.p != null && isFinite(x.p) && x.w > 0);
    const W = ok.reduce((s, x) => s + x.w, 0);
    return W ? expit(ok.reduce((s, x) => s + x.w * logit(x.p), 0) / W) : null;
  }
  /** American odds text/number -> implied probability 0-1. */
  function implied(am) {
    const a = Number(String(am == null ? '' : am).replace(/[^\d.+-]/g, ''));
    if (!isFinite(a) || Math.abs(a) < 100) return null;
    return a > 0 ? 100 / (a + 100) : -a / (-a + 100);
  }
  /** No-vig probability for "this" side from American odds (other side optional). */
  function noVig(thisAm, otherAm) {
    const a = implied(thisAm), b = implied(otherAm);
    if (a == null) return null;
    return b != null ? a / (a + b) : clamp(a / 1.045, 0.01, 0.99);
  }

  // ------------------------------------------------------------ props (pure)
  /**
   * games: [{value, opp, home?:bool}] newest first, n = "at least n", opp/home optional.
   * Returns {p, games, parts:{season,l10,l5,opp,ha,avg}, hits10, n10, avg} or null.
   */
  function propStats(games, n, { opp = null, home = null } = {}) {
    if (!games || !games.length) return null;
    const hit = g => g.value >= n, cnt = gs => gs.filter(hit).length;
    const S = games, sH = cnt(S), pS = shrink(sH, S.length, 0.5, 4);
    const g10 = S.slice(0, 10), g5 = S.slice(0, 5);
    const vo = opp ? S.filter(g => String(g.opp).toLowerCase() === String(opp).toLowerCase()) : [];
    const ha = home == null ? [] : S.filter(g => g.home === home);
    const mean = S.reduce((s, g) => s + g.value, 0) / S.length;
    const sd = Math.max(0.75, Math.sqrt(S.reduce((s, g) => s + (g.value - mean) ** 2, 0) / Math.max(1, S.length - 1)));
    const parts = {
      season: pS, l10: shrink(cnt(g10), g10.length, pS, 8), l5: shrink(cnt(g5), g5.length, pS, 8),
      opp: vo.length ? shrink(cnt(vo), vo.length, pS, 8) : null, ha: ha.length ? shrink(cnt(ha), ha.length, pS, 8) : null,
      avg: clamp(1 - phi((n - 0.5 - mean) / sd), 0.02, 0.98)
    };
    const p = logAvg([{ p: parts.l10, w: .30 }, { p: parts.season, w: .25 }, { p: parts.avg, w: .20 }, { p: parts.l5, w: .10 }, { p: parts.opp, w: .08 }, { p: parts.ha, w: .07 }]);
    return { p, games: S.length, parts, hits10: cnt(g10), n10: g10.length, avg: Math.round(mean * 10) / 10 };
  }

  // ------------------------------------------------------------ games (pure)
  const SPORT = { nfl: { sd: 13.5, hfa: 1.5, tsd: 13 }, nba: { sd: 12, hfa: 2.5, tsd: 18 }, wnba: { sd: 11, hfa: 2.5, tsd: 16 }, nhl: { sd: 2.3, hfa: 0.25, tsd: 2.3 }, mlb: { sd: 4.2, hfa: 0.25, tsd: 4.4 } };
  /** team games [{pf, pa, home:bool, opp}] newest first -> summary. */
  function teamSummary(gs) {
    const n = gs.length, w = gs.filter(g => g.pf > g.pa).length;
    const pf = n ? gs.reduce((s, g) => s + g.pf, 0) / n : 0, pa = n ? gs.reduce((s, g) => s + g.pa, 0) / n : 0;
    const l10 = gs.slice(0, 10), w10 = l10.filter(g => g.pf > g.pa).length;
    return { n, w, l: n - w, pf, pa, margin: n ? (pf - pa) * n / (n + 5) : 0, win: shrink(w, n, 0.5, 6), w10, n10: l10.length,
      homeW: gs.filter(g => g.home && g.pf > g.pa).length, homeN: gs.filter(g => g.home).length,
      awayW: gs.filter(g => !g.home && g.pf > g.pa).length, awayN: gs.filter(g => !g.home).length };
  }
  /**
   * Stats chance that the AWAY team wins / covers / that the total goes over.
   * kind: 'ml' | 'spread' (line = away line, e.g. -1.5) | 'total' (line = total).
   * a/h: team game lists (newest first) for away/home; abbrs for head-to-head.
   */
  function gameStats(kind, league, A, Hm, { line = 0, awayAbbr = '', homeAbbr = '' } = {}) {
    if (!A || !Hm || A.length < 2 || Hm.length < 2) return null;
    const cfg = SPORT[league] || SPORT.nba, a = teamSummary(A), h = teamSummary(Hm);
    const expMargin = a.margin - h.margin - cfg.hfa;   // away minus home
    if (kind === 'total') {
      const exp = (a.pf + h.pa) / 2 + (h.pf + a.pa) / 2;
      return { p: clamp(1 - phi((line - exp) / cfg.tsd), 0.02, 0.98), games: Math.min(a.n, h.n), a, h, exp: Math.round(exp * 10) / 10 };
    }
    if (kind === 'spread') return { p: clamp(phi((expMargin + line) / cfg.sd), 0.02, 0.98), games: Math.min(a.n, h.n), a, h, exp: Math.round(expMargin * 10) / 10 };
    const rating = phi(expMargin / cfg.sd);
    const log5 = (a.win * (1 - h.win)) / (a.win * (1 - h.win) + h.win * (1 - a.win));
    const form = shrink(a.w10, a.n10, a.win, 6) , formH = shrink(h.w10, h.n10, h.win, 6);
    const formP = (form * (1 - formH)) / (form * (1 - formH) + formH * (1 - form));
    const hh = A.filter(g => String(g.opp).toLowerCase() === String(homeAbbr).toLowerCase());
    const h2h = hh.length ? shrink(hh.filter(g => g.pf > g.pa).length, hh.length, 0.5, 6) : null;
    const p = logAvg([{ p: rating, w: .5 }, { p: log5, w: .2 }, { p: formP, w: .2 }, { p: h2h, w: .1 }]);
    return { p, games: Math.min(a.n, h.n), a, h, h2h: hh.length ? `${hh.filter(g => g.pf > g.pa).length}-${hh.length - hh.filter(g => g.pf > g.pa).length}` : null, exp: Math.round(expMargin * 10) / 10 };
  }

  // ------------------------------------------------------------ blend (pure)
  /**
   * @param {{stats?:{p,games}, vegas?:number, market?:number}} c (probabilities 0-1)
   * @returns {{pct:number, parts:{stats,vegas,market}, weights}|null}
   */
  function blend({ stats = null, vegas = null, market = null } = {}) {
    const q = stats && stats.p != null ? clamp((stats.games || 0) / 15, 0, 1) : 0;
    const hasV = vegas != null && isFinite(vegas);
    const w = hasV ? { vegas: .45, market: .30, stats: .25 * q } : { vegas: 0, market: .55, stats: .45 * q };
    const p = logAvg([{ p: stats && stats.p, w: w.stats }, { p: hasV ? vegas : null, w: w.vegas }, { p: market, w: market != null ? w.market : 0 }]);
    if (p == null) return null;
    return { pct: Math.round(clamp(p * 100, 3, 97)), parts: { stats: stats ? stats.p : null, vegas: hasV ? vegas : null, market }, weights: w };
  }
  /** "History 7 of 10 · Vegas 58% · Market 49%" */
  function breakdown(r, hist) {
    if (!r) return '';
    const pc = x => Math.round(x * 100) + '%', out = [];
    if (hist) out.push('History ' + hist); else if (r.parts.stats != null) out.push('History ' + pc(r.parts.stats));
    if (r.parts.vegas != null) out.push('Vegas ' + pc(r.parts.vegas));
    if (r.parts.market != null) out.push('Market ' + pc(r.parts.market));
    return out.join(' · ');
  }

  /** Pure: what a Polymarket US market slug is. yes = away (ML/spread), over (total), "at least n" (props). */
  function parseSlug(slug) {
    const s = String(slug || '');
    let m = /^aec-([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})$/.exec(s);
    if (m) return { kind: 'ml', league: m[1], away: m[2], home: m[3], date: m[4] };
    m = /^asc-([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})-(pos|neg)-(\d+)pt(\d+)$/.exec(s);
    if (m) return { kind: 'spread', league: m[1], away: m[2], home: m[3], date: m[4], line: (m[5] === 'neg' ? -1 : 1) * Number(m[6] + '.' + m[7]) };
    m = /^tsc-([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})-(?:total-)?(\d+)pt(\d+)$/.exec(s);
    if (m) return { kind: 'total', league: m[1], away: m[2], home: m[3], date: m[4], line: Number(m[5] + '.' + m[6]) };
    m = /^astatc-([a-z]+)-([a-z0-9]+)-([a-z0-9]+)-(\d{4}-\d{2}-\d{2})-([a-z0-9]+)-([a-z]+)-gte(\d+)$/.exec(s);
    if (m) return { kind: 'prop', league: m[1], away: m[2], home: m[3], date: m[4], stat: m[5], who: m[6], n: +m[7] };
    return null;
  }

  // ------------------------------------------------------------ browser side (free, client-only)
  const ESPN = { nba: 'basketball/nba', wnba: 'basketball/wnba', nhl: 'hockey/nhl', nfl: 'football/nfl', mlb: 'baseball/mlb' };
  const ALIAS = { was: 'wsh', mon: 'mtl', uta: 'utah', pho: 'phx', gsw: 'gs', nyk: 'ny', nop: 'no', sas: 'sa', jac: 'jax', cws: 'chw', az: 'ari', njd: 'nj', lak: 'la', tbl: 'tb', sjs: 'sj', con: 'conn' };
  const ea = a => { a = String(a || '').toLowerCase(); return ALIAS[a] || a; };
  const cache = new Map();
  const getJSON = u => cache.get(u) || (cache.set(u, fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null)), cache.get(u));
  /** ESPN team schedule -> [{pf, pa, home, opp, date}] newest first (this + last season if short). */
  async function teamGames(league, abbr) {
    if (!ESPN[league]) return [];
    const u = `https://site.web.api.espn.com/apis/site/v2/sports/${ESPN[league]}/teams/${ea(abbr)}/schedule`;
    const read = d => ((d && d.events) || []).flatMap(e => {
      const c = e.competitions && e.competitions[0]; if (!c || !c.status || !c.status.type || !c.status.type.completed) return [];
      if (/pre/i.test(String((e.seasonType && e.seasonType.name) || ''))) return [];
      const me = c.competitors.find(t => ea(t.team && t.team.abbreviation) === ea(abbr)), op = c.competitors.find(t => t !== me);
      if (!me || !op) return [];
      const sc = t => Number(t.score && (t.score.value != null ? t.score.value : t.score)) ;
      return [{ date: e.date, pf: sc(me), pa: sc(op), home: me.homeAway === 'home', opp: ea(op.team && op.team.abbreviation) }];
    });
    const d = await getJSON(u); let gs = read(d);
    if (gs.length < 10 && d && d.season && d.season.year) gs = gs.concat(read(await getJSON(`${u}?season=${d.season.year - 1}`)));
    return gs.filter(g => isFinite(g.pf) && isFinite(g.pa)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  /** Vegas no-vig for a market side via window.Vegas (both sides when we have them). */
  function vegasFor(marketId, side) {
    const V = globalThis.Vegas; if (!V || !marketId) return null;
    const me = V.lookup(marketId, side), other = V.lookup(marketId, side === 'no' ? 'yes' : 'no');
    return me ? noVig(me.p, other && other.p) : null;
  }
  /**
   * Browser: full estimate for a bet. spec {marketId, side:'yes'|'no', market (0-100), text, question, player}.
   * Resolves {pct, market, line:"History 7 of 10 · Vegas 58% · Market 49%"} or null.
   */
  async function estimate(spec) {
    const side = spec.side === 'no' || spec.side === 1 ? 'no' : 'yes';
    const key = JSON.stringify([spec.marketId, side, Math.round(spec.market || 0), spec.text || '']);
    if (cache.has(key)) return cache.get(key);
    const job = (async () => {
      const mk = spec.market > 0 && spec.market < 100 ? spec.market / 100 : null;
      const vg = vegasFor(spec.marketId, side), s = parseSlug(spec.marketId);
      let stats = null, hist = '';
      try {
        if (s && s.kind === 'prop' && globalThis.Viz && globalThis.Viz.loadGames) {
          const p = globalThis.Viz.parseProp({ question: spec.question, text: spec.text, player: spec.player, marketSlug: spec.marketId });
          const all = p ? await globalThis.Viz.loadGames(p) : null;
          if (all && all.games.length) {
            const opp = [s.away, s.home].map(ea).find(a => a && a !== ea(all.team)) || null;
            const home = all.team ? ea(all.team) === ea(s.home) : null;
            const st = propStats(all.games, p.n, { opp, home });
            if (st) { stats = side === 'no' ? Object.assign({}, st, { p: 1 - st.p }) : st; hist = side === 'no' ? `${st.n10 - st.hits10} of ${st.n10}` : `${st.hits10} of ${st.n10}`; }
          }
        } else if (s && s.kind !== 'prop') {
          const [A, H] = await Promise.all([teamGames(s.league, s.away), teamGames(s.league, s.home)]);
          const st = gameStats(s.kind, s.league, A, H, { line: s.line, awayAbbr: ea(s.away), homeAbbr: ea(s.home) });
          if (st) {
            stats = side === 'no' ? Object.assign({}, st, { p: 1 - st.p }) : st;
            const me = s.kind === 'total' ? null : side === 'no' ? st.h : st.a;
            hist = me ? `${me.w}-${me.l} record` : `avg total ${st.exp}`;
          }
        }
      } catch (e) { /* stats are optional */ }
      const r = blend({ stats, vegas: vg, market: mk });
      return r && { pct: r.pct, market: mk != null ? Math.round(mk * 100) : null, line: breakdown(r, hist), r };
    })();
    cache.set(key, job);
    return job;
  }
  /** Fill every [data-oc] element under node: one line "Analytics 62% · Market 55%" (UI label is Analytics, Reed). */
  function hydrate(node) {
    if (!node || !node.querySelectorAll) return;
    node.querySelectorAll('[data-oc]:not([data-oc-done])').forEach(elm => {
      elm.setAttribute('data-oc-done', '1');
      let spec; try { spec = JSON.parse(elm.getAttribute('data-oc')); } catch (e) { return; }
      estimate(spec).then(res => {
        if (!res) { elm.hidden = true; return; }
        // One compact line only (Reed): "Analytics 58% · Market 49%". Tap -> Dig deeper sheet (breakdown lives there).
        elm.innerHTML = '';
        const b = document.createElement(globalThis.DigDeeper ? 'button' : 'div'); b.className = 'oc-line';
        if (b.tagName === 'BUTTON') { b.type = 'button'; b.addEventListener('click', ev => { ev.stopPropagation(); globalThis.DigDeeper.open(spec, res); }); b.setAttribute('aria-label', 'Dig deeper'); }
        const lab = spec.label ? String(spec.label).replace(/[&<>"]/g, '') + ' · ' : '';
        b.innerHTML = `${lab}<b>Analytics ${res.pct}%</b>${res.market != null ? `<span class="oc-mkt">&nbsp;· Market ${res.market}%</span>` : ''}${b.tagName === 'BUTTON' ? '<span class="oc-chev" aria-hidden="true">›</span>' : ''}`;
        elm.append(b);
        elm.dataset.ocPct = res.pct;
      });
    });
  }
  /** Attribute value for a [data-oc] element. */
  const attr = spec => JSON.stringify(spec).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const start = () => { hydrate(document.body); let q = 0; new MutationObserver(() => { if (!q) q = setTimeout(() => { q = 0; hydrate(document.body); }, 120); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  return { logit, expit, phi, shrink, logAvg, implied, noVig, propStats, teamSummary, gameStats, blend, breakdown, parseSlug, estimate, hydrate, attr, teamGames, ESPN };
});
