/**
 * js/dig-deeper.js — "Dig deeper" sheet (HANDOFF §57). Tap the Analytics line on any bet ->
 * full-screen sheet (not a tab): the Analytics breakdown (History · Vegas · Market), then a
 * stat picker that offers ONLY stats that fit the player's ESPN position, with splits
 * L5 / L10 / Season / vs opp. Teams: form, home/away, points for/against, pace.
 * NFL receivers/backs: target share donut vs teammates (last 5 box scores) + team pass rate.
 * Free ESPN data, client-side. Browser: window.DigDeeper; Node: module.exports (pure parts).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DigDeeper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // ---------------------------------------------------------------- position -> stats (one place)
  // Stat: [label, gamelog name] ("a-b:1" = 2nd part of "a-b"; fn = derived from a row reader r(name)).
  const S = {
    passYd: ['Pass yards', 'passingYards'], passTd: ['Pass TDs', 'passingTouchdowns'], int: ['INTs', 'interceptions'],
    cmp: ['Completions', 'completions'], att: ['Pass attempts', 'passingAttempts'],
    rushAtt: ['Rush attempts', 'rushingAttempts'], rushYd: ['Rush yards', 'rushingYards'], rushTd: ['Rush TDs', 'rushingTouchdowns'],
    tgt: ['Targets', 'receivingTargets'], rec: ['Receptions', 'receptions'], recYd: ['Receiving yards', 'receivingYards'], recTd: ['Receiving TDs', 'receivingTouchdowns'],
    fgm: ['Field goals', 'fieldGoalsMade-fieldGoalAttempts:0'], kpts: ['Kicking points', 'totalKickingPoints'],
    tkl: ['Tackles', 'totalTackles'], sacks: ['Sacks', 'sacks'],
    min: ['Minutes', 'minutes'], pts: ['Points', 'points'], reb: ['Rebounds', 'totalRebounds'], ast: ['Assists', 'assists'],
    threes: ['Threes', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted:0'], tpa: ['3PT attempts', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted:1'],
    fga: ['Shot attempts', 'fieldGoalsMade-fieldGoalsAttempted:1'], blk: ['Blocks', 'blocks'], stl: ['Steals', 'steals'], tov: ['Turnovers', 'turnovers'],
    usage: ['Usage', r => r('fieldGoalsMade-fieldGoalsAttempted:1') + 0.44 * r('freeThrowsMade-freeThrowsAttempted:1') + r('turnovers')],
    goals: ['Goals', 'goals'], nhlAst: ['Assists', 'assists'], nhlPts: ['Points', 'points'], shots: ['Shots', 'shotsTotal'],
    toi: ['Time on ice', 'timeOnIcePerGame'], ppp: ['PP points', r => r('powerPlayGoals') + r('powerPlayAssists')],
    saves: ['Saves', 'saves'], svp: ['Save %', 'savePct'], ga: ['Goals against', 'goalsAgainst'], sa: ['Shots against', 'shotsAgainst'],
    ab: ['At bats', 'atBats'], hits: ['Hits', 'hits'], tb: ['Total bases', r => r('hits') + r('doubles') + 2 * r('triples') + 3 * r('homeRuns')],
    hr: ['Home runs', 'homeRuns'], rbi: ['RBIs', 'RBIs'], runs: ['Runs', 'runs'], bb: ['Walks', 'walks'], hk: ['Strikeouts', 'strikeouts'],
    pk: ['Strikeouts', 'strikeouts'], outs: ['Outs', r => { const v = r('innings'); return Math.floor(v) * 3 + Math.round((v % 1) * 10); }],
    ha: ['Hits allowed', 'hits'], er: ['Earned runs', 'earnedRuns'], pbb: ['Walks', 'walks'], pitches: ['Pitches', 'pitches']
  };
  const POSITION_STATS = {
    nfl: { QB: ['passYd', 'passTd', 'cmp', 'att', 'int', 'rushYd', 'rushAtt'], RB: ['rushYd', 'rushAtt', 'rushTd', 'rec', 'tgt', 'recYd'],
      WR: ['tgt', 'rec', 'recYd', 'recTd'], TE: ['tgt', 'rec', 'recYd', 'recTd'], K: ['fgm', 'kpts'], DEF: ['tkl', 'sacks', 'int'] },
    nba: { G: ['pts', 'ast', 'threes', 'tpa', 'fga', 'min', 'usage', 'reb', 'stl', 'tov'], F: ['pts', 'reb', 'ast', 'threes', 'fga', 'min', 'usage', 'stl', 'blk'],
      C: ['reb', 'pts', 'blk', 'fga', 'min', 'usage', 'ast'] },
    wnba: null,
    nhl: { SK: ['nhlPts', 'goals', 'nhlAst', 'shots', 'toi', 'ppp'], G: ['saves', 'svp', 'ga', 'sa'] },
    mlb: { H: ['hits', 'tb', 'hr', 'rbi', 'runs', 'ab', 'bb', 'hk'], P: ['pk', 'outs', 'ha', 'er', 'pbb', 'pitches'] }
  };
  POSITION_STATS.wnba = POSITION_STATS.nba;
  const SHARE = ['RB', 'WR', 'TE'];   // NFL: target share donut + team pass rate
  /** ESPN position abbreviation -> group key for POSITION_STATS. */
  function posGroup(league, pos) {
    pos = String(pos || '').toUpperCase();
    if (league === 'nfl') return pos === 'QB' ? 'QB' : /^(RB|FB|HB)$/.test(pos) ? 'RB' : pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : /^(K|PK|P)$/.test(pos) ? 'K' : 'DEF';
    if (league === 'nba' || league === 'wnba') return /G/.test(pos) && !/F/.test(pos) ? 'G' : pos === 'C' ? 'C' : 'F';
    if (league === 'nhl') return pos === 'G' ? 'G' : 'SK';
    if (league === 'mlb') return /^(SP|RP|P|CP)$/.test(pos) ? 'P' : 'H';
    return null;
  }
  /** Stats offered for a position, limited to what this gamelog actually has. */
  function statsFor(league, pos, names) {
    const g = posGroup(league, pos), list = ((POSITION_STATS[league] || {})[g]) || [];
    const has = n => names.includes(String(n).split(':')[0]);
    return list.filter(k => { const f = S[k][1]; return typeof f === 'function' ? true : has(f); }).map(k => ({ key: k, label: S[k][0] }));
  }
  /** Pure: per-game rows [{date, opp, home, value}] for one stat from an ESPN gamelog (newest first). */
  function rows(log, key) {
    if (!log || !Array.isArray(log.names)) return [];
    const num = v => { v = String(v == null ? '' : v); if (/^\d+:\d\d$/.test(v)) { const [m, s] = v.split(':'); return +m + s / 60; } return parseFloat(v) || 0; };
    const out = [], f = S[key][1], seen = new Set();
    for (const st of log.seasonTypes || []) {
      if (/preseason/i.test(st.displayName || '')) continue;
      for (const c of st.categories || []) for (const e of c.events || []) {
        if (seen.has(e.eventId)) continue; seen.add(e.eventId);
        const r = nm => { const [n, part] = String(nm).split(':'), i = log.names.indexOf(n); if (i < 0) return 0; const raw = String(e.stats[i]); return part != null ? num(raw.split(/[-/]/)[+part]) : num(raw); };
        const m = (log.events || {})[e.eventId] || {};
        out.push({ id: e.eventId, date: m.gameDate || '', opp: (m.opponent && m.opponent.abbreviation) || '', home: m.atVs ? m.atVs !== '@' : null, season: String(st.displayName || '').split(' ')[0], value: Math.round((typeof f === 'function' ? f(r) : r(f)) * 10) / 10 });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }
  /** Pure: split a row list. */
  function split(all, mode, opp) {
    if (mode === 'L5') return all.slice(0, 5);
    if (mode === 'L10') return all.slice(0, 10);
    if (mode === 'Opp') return all.filter(g => opp && String(g.opp).toLowerCase() === String(opp).toLowerCase());
    return all.filter(g => all[0] && g.season === all[0].season);
  }
  const avg = gs => gs.length ? Math.round(gs.reduce((s, g) => s + g.value, 0) / gs.length * 10) / 10 : 0;
  /** Pure: target shares from box scores [{name, targets}] -> sorted [{name, share}] (top 5 + Others). */
  function shares(list) {
    const m = new Map(); for (const x of list) m.set(x.name, (m.get(x.name) || 0) + x.targets);
    const tot = [...m.values()].reduce((a, b) => a + b, 0); if (!tot) return [];
    const s = [...m].map(([name, t]) => ({ name, share: t / tot })).sort((a, b) => b.share - a.share);
    const top = s.slice(0, 5), rest = s.slice(5).reduce((a, x) => a + x.share, 0);
    return rest > 0 ? top.concat([{ name: 'Others', share: rest }]) : top;
  }

  // ---------------------------------------------------------------- browser
  const cache = new Map();
  const getJSON = u => cache.get(u) || (cache.set(u, fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { if (j == null) cache.delete(u); return j; })), cache.get(u));
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const SVGNS = 'http://www.w3.org/2000/svg';
  function donut(items, me) {
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'dd-donut');
    let a = -Math.PI / 2;
    items.forEach((x, i) => {
      const b = a + x.share * 2 * Math.PI, big = b - a > Math.PI ? 1 : 0, r = 50;
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', `M${60 + r * Math.cos(a)} ${60 + r * Math.sin(a)} A${r} ${r} 0 ${big} 1 ${60 + r * Math.cos(b)} ${60 + r * Math.sin(b)}`);
      p.setAttribute('class', 'dd-seg' + (x.name === me ? ' dd-me' : '')); p.style.opacity = x.name === me ? 1 : 0.25 + 0.12 * (5 - Math.min(5, i));
      svg.append(p); a = b;
    });
    return svg;
  }
  /** Game bars vs a line: green = hit (value >= line), red = miss. Oldest on the left. */
  function bars(gs, line) {
    const out = el('div', 'dd-chart'), plot = el('div', 'dd-bars'), labs = el('div', 'dd-labs');
    const max = Math.max(1, line || 0, ...gs.map(g => Math.abs(g.value)));
    if (line != null && line > 0) { const l = el('div', 'dd-line'); l.style.bottom = `${(100 * line / max).toFixed(1)}%`; plot.append(l); }
    gs.slice().reverse().forEach(g => {
      const c = el('div', 'dd-col'), b = el('div', 'dd-bar' + (line == null ? '' : g.value >= line ? ' dd-hit' : ' dd-miss'));
      b.style.height = `${Math.max(2, 100 * Math.abs(g.value) / max)}%`; b.title = `${g.opp} ${g.value}`; b.append(el('span', 'dd-v', String(g.value)));
      c.append(b); plot.append(c); labs.append(el('div', 'dd-xl', g.opp));
    });
    out.append(plot, labs); return out;
  }
  /** − line + stepper. */
  function stepper(val, step, on) {
    const w = el('div', 'dd-step'), m = el('button', 'dd-sb', '−'), v = el('span', 'dd-sv', String(val)), pl = el('button', 'dd-sb', '+');
    m.type = pl.type = 'button'; m.setAttribute('aria-label', 'Lower'); pl.setAttribute('aria-label', 'Higher');
    m.onclick = () => on(Math.round((val - step) * 10) / 10); pl.onclick = () => on(Math.round((val + step) * 10) / 10);
    w.append(m, v, pl); return w;
  }
  function chips(opts, cur, on, off) {
    const w = el('div', 'dd-chips');
    for (const o of opts) { const dis = off && off.includes(o.v), b = el('button', 'dd-chip' + (o.v === cur ? ' on' : '') + (dis ? ' dd-off' : ''), o.l); b.type = 'button'; b.disabled = !!dis; b.onclick = () => on(o.v); w.append(b); }
    return w;
  }
  // The bet's live Polymarket chart, top of every sheet (one instance per sheet, ~1 s polling).
  let live = null;
  function liveFor(spec) {
    if (live) return live.el;
    const V = globalThis.Viz; if (!V || !V.liveChart || !spec.marketId) return (globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('Polymarket', 'no market linked to chart', 'dd-none') : el('div', 'dd-none', 'no market linked to chart'));
    live = V.liveChart({ marketId: spec.marketId, marketSlug: spec.marketId, eventSlug: spec.eventSlug || null, side: spec.side === 'no' || spec.side === 1 ? 1 : 0, text: spec.text, question: spec.question, player: spec.player || null });
    return live.el;
  }
  function close() { if (live) { live.stop(); live = null; } document.querySelectorAll('.dd-back').forEach(n => n.remove()); document.removeEventListener('keydown', onKey); document.documentElement.classList.remove('dd-open'); }
  const onKey = e => { if (e.key === 'Escape') close(); };

  async function playerView(body, spec, s) {
    const V = globalThis.Viz; let p = V && V.parseProp({ question: spec.question, text: spec.text, player: spec.player, marketSlug: spec.marketId });
    if (!p && !spec.player) return false;
    if (!p) p = { player: spec.player, league: (s && V.ESPN_PATH[s.league]) ? s.league : '', n: 0, stat: { key: 'any', names: [], label: '' } };   // stat Viz can't parse (e.g. saves)
    const got = await V.loadGames(p); if (!got || !got.log) { body.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note(got ? 'ESPN' : '', got ? 'no games found' : "Couldn't reach ESPN · try again", 'dd-none') : el('div', 'dd-none', got ? 'no games found' : "Couldn't reach ESPN · try again"))); return true; }
    const path = V.ESPN_PATH[got.league];
    const ath = await getJSON(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${got.id}`);
    const pos = ath && ath.athlete && ath.athlete.position && ath.athlete.position.abbreviation;
    const list = statsFor(got.league, pos, got.log.names || []);
    if (!list.length) { body.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('ESPN', 'no stats for this position', 'dd-none') : el('div', 'dd-none', 'no stats for this position'))); return true; }
    const myTeam = V.espnAbbr(got.team), opp = s ? [s.away, s.home].map(V.espnAbbr).find(a => a && a !== myTeam) : null;
    let key = (list.find(x => S[x.key][1] === (p.stat.names || [])[0]) || list[0]).key, mode = 'L10', line = p.n || null;
    const head = el('div', 'dd-sub', [p.player, pos].filter(Boolean).join(' · '));
    const area = el('div');
    body.append(head, area);
    const draw = () => {
      // Current season by date (ESPN's default log can still be last season); none yet -> show last season, labeled.
      const st0 = V.seasonStart(got.league), both = rows(got.log, key).concat(rows(got.prevLog, key)), seen = new Set();
      const uniq = both.filter(g => !seen.has(g.id) && seen.add(g.id)).sort((a, b) => b.date.localeCompare(a.date));
      const last0 = (u, st) => (u.find(g => g.date.slice(0, 10) < st) || {}).season;
      const all = uniq.filter(g => g.date.slice(0, 10) >= st0), last = uniq.filter(g => g.date.slice(0, 10) < st0 && (!last0 || g.season === last0(uniq, st0)));
      const eff = mode;
      const gs = eff === 'Last' ? last : split(all, mode, opp);
      if (line == null) line = Math.max(1, Math.round(avg(all.length ? all : last)));
      const hits = gs.filter(g => g.value >= line).length;
      area.replaceChildren(
        chips(list.map(x => ({ v: x.key, l: x.label })), key, v => { key = v; line = null; draw(); }),
        chips([{ v: 'L5', l: 'L5' }, { v: 'L10', l: 'L10' }, { v: 'Season', l: 'Season' }].concat(opp ? [{ v: 'Opp', l: 'vs ' + opp.toUpperCase() }] : [], [{ v: 'Last', l: 'Last season' }]), eff, v => { mode = v; draw(); }),
        el('div', 'dd-big', gs.length ? `${hits} of ${gs.length}` : '—'),
        el('div', 'dd-cap', gs.length ? `${line}+ ${S[key][0].toLowerCase()} · avg ${avg(gs)}` : eff === 'Last' ? 'No games last season' : 'No games yet this season'),
        stepper(line, key === 'svp' ? 0.01 : 1, v => { line = Math.max(0, v); draw(); }));
      if (gs.length) area.append(bars(gs, line)); else area.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('ESPN', mode === 'Last' ? 'no games last season' : 'not enough games yet to chart', 'dd-none') : el('div', 'dd-none', mode === 'Last' ? 'no games last season' : 'not enough games yet to chart')));
    };
    draw();
    if (got.league === 'nfl' && SHARE.includes(posGroup('nfl', pos))) {
      const sec = el('div', 'dd-sec'); sec.append(el('div', 'dd-h', 'Target share')); body.append(sec);
      const ids = rows(got.log, 'rec').slice(0, 5).map(g => g.id);
      const box = await Promise.all(ids.map(id => getJSON(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`)));
      const tg = [], tm = { pass: 0, rush: 0 };
      for (const d of box) {
        const nm = ath && ath.athlete && ath.athlete.displayName, pl = (d && d.boxscore && d.boxscore.players) || [];
        const t = pl.find(x => (x.statistics || []).some(st => (st.athletes || []).some(a => a.athlete && a.athlete.displayName === nm))) || pl.find(x => V.espnAbbr(x.team && x.team.abbreviation) === myTeam); if (!t) continue;
        const tAbbr = V.espnAbbr(t.team && t.team.abbreviation);
        const rc = (t.statistics || []).find(x => x.name === 'receiving'), i = rc ? (rc.keys || []).indexOf('receivingTargets') : -1;
        if (rc && i >= 0) for (const a of rc.athletes || []) tg.push({ name: a.athlete.displayName, targets: +a.stats[i] || 0 });
        const ts = ((d.boxscore.teams || []).find(x => V.espnAbbr(x.team && x.team.abbreviation) === tAbbr) || {}).statistics || [];
        const g = n => (ts.find(x => x.name === n) || {}).displayValue || '';
        tm.pass += +String(g('completionAttempts')).split('/')[1] || 0; tm.rush += +g('rushingAttempts') || 0;
      }
      const sh = shares(tg), me = (sh.find(x => x.name === (ath && ath.athlete && ath.athlete.displayName)) || {});
      if (sh.length) {
        const row = el('div', 'dd-share'); row.append(donut(sh, me.name));
        const leg = el('div', 'dd-legend'); sh.forEach(x => leg.append(el('div', x.name === me.name ? 'dd-me-t' : '', `${x.name} ${Math.round(x.share * 100)}%`)));
        row.append(leg); sec.append(row);
        if (tm.pass + tm.rush) sec.append(el('div', 'dd-cap', `Team pass rate ${Math.round(100 * tm.pass / (tm.pass + tm.rush))}% · last ${ids.length}`));
      } else sec.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('ESPN box scores', 'no target data yet', 'dd-none') : el('div', 'dd-none', 'no target data yet')));
    }
    return true;
  }
  /** Pure: a team's games as bar rows for a game bet: total = combined points, else margin (pf - pa). */
  function teamRows(gs, kind) { return gs.map(g => ({ date: g.date, opp: String(g.opp || '').toUpperCase(), home: g.home, value: kind === 'total' ? g.pf + g.pa : g.pf - g.pa })); }
  async function teamView(body, s, spec) {
    const OC = globalThis.OurChance; if (!OC || !s) return;
    const [A, H] = await Promise.all([OC.teamGames(s.league, s.away), OC.teamGames(s.league, s.home)]);
    const side = spec && (spec.side === 'no' || spec.side === 1) ? 'no' : 'yes';
    let team = side === 'no' && s.kind !== 'total' ? 'home' : 'away', mode = 'L10', kind = s.kind === 'total' ? 'total' : 'margin';
    // Line: totals use the total; spreads the team's spread (away line, flipped for home); moneyline 0.5 (win).
    const baseLine = () => kind === 'total' ? (s.kind === 'total' ? s.line : null) : s.kind === 'spread' ? (team === 'away' ? -s.line : s.line) + 0.5 * 0 : 0.5;
    let line = baseLine();
    const area = el('div'); body.append(area);
    const r1 = n => Math.round(n * 10) / 10;
    const draw = () => {
      const gsAll = team === 'away' ? A : H, abbr = team === 'away' ? s.away : s.home, oppAbbr = team === 'away' ? s.home : s.away;
      const cur = gsAll.filter(g => !g.last);   // current season only; last season behind its chip
      const eff = mode;
      const gs = eff === 'Last' ? gsAll.filter(g => g.last) : mode === 'L5' ? cur.slice(0, 5) : mode === 'L10' ? cur.slice(0, 10) : mode === 'Opp' ? cur.filter(g => g.opp === oppAbbr) : cur;
      const rs = teamRows(gs, kind);
      if (line == null) line = Math.round(avg(teamRows((cur.length ? cur : gsAll).slice(0, 10), kind))) + 0.5;
      const sum = OC.teamSummary(gs), hits = rs.filter(g => g.value >= line).length;
      const capWord = kind === 'total' ? `Over ${line}` : line === 0.5 ? 'Wins' : `Margin ${line > 0 ? '+' : ''}${line}`;
      area.replaceChildren(
        chips([{ v: 'away', l: s.away.toUpperCase() }, { v: 'home', l: s.home.toUpperCase() }], team, v => { team = v; if (kind !== 'total') line = baseLine(); draw(); }),
        chips([{ v: 'total', l: 'Total' }, { v: 'margin', l: 'Margin' }], kind, v => { kind = v; line = kind === 'total' && s.kind === 'total' ? s.line : kind === 'margin' ? baseLine() : null; draw(); }),
        chips([{ v: 'L5', l: 'L5' }, { v: 'L10', l: 'L10' }, { v: 'Season', l: 'Season' }, { v: 'Opp', l: 'vs ' + oppAbbr.toUpperCase() }, { v: 'Last', l: 'Last season' }], eff, v => { mode = v; draw(); }),
        el('div', 'dd-big', rs.length ? `${hits} of ${rs.length}` : '—'),
        el('div', 'dd-cap', !rs.length ? (eff === 'Last' ? 'No games last season' : 'No games yet this season') : `${capWord} · ${team === 'home' ? 'Home' : 'Away'} ${team === 'home' ? `${sum.homeW}-${sum.homeN - sum.homeW}` : `${sum.awayW}-${sum.awayN - sum.awayW}`} · ${sum.w}-${sum.l}`),
        stepper(line, 1, v => { line = v; draw(); }));
      if (!rs.length) area.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('ESPN', mode === 'Last' ? 'no games last season' : 'not enough games yet to chart', 'dd-none') : el('div', 'dd-none', mode === 'Last' ? 'no games last season' : 'not enough games yet to chart')));
      if (rs.length) {
        area.append(bars(rs, kind === 'margin' ? null : line));
        if (kind === 'margin') area.lastChild.querySelectorAll('.dd-bar').forEach((b, i) => b.classList.add(rs[rs.length - 1 - i].value >= line ? 'dd-hit' : 'dd-miss'));
        area.append(el('div', 'dd-cap dd-foot', `For ${r1(sum.pf)} · Against ${r1(sum.pa)} · Pace ${r1(sum.pf + sum.pa)}`));
      }
    };
    draw();
  }
  /** Open the sheet for a bet spec (same spec as [data-oc]); res = the Analytics estimate. */
  async function open(spec, res) {
    close();
    const back = el('div', 'dd-back'), sheet = el('div', 'dd-sheet'); sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    const top = el('div', 'dd-top'), x = el('button', 'dd-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    top.append(el('div', 'dd-title', spec.label || spec.text || ''), x);
    const body = el('div', 'dd-body');
    if (res) {
      const a = el('div', 'dd-sec');
      a.append(el('div', 'dd-big', `${res.pct}%`), el('div', 'dd-cap', `Analytics${res.market != null ? ` · Market ${res.market}%` : ''}`));
      if (res.line) a.append(el('div', 'dd-why', res.line));
      body.append(a);
    }
    sheet.append(top, body); back.append(sheet); document.body.append(back);
    document.documentElement.classList.add('dd-open');
    back.addEventListener('click', e => { if (e.target === back) close(); }); document.addEventListener('keydown', onKey);
    // Primary view (Reed): the bet's live Polymarket price chart, ~1 s polling, same data as the main chart.
    if (spec.marketId) { const lc = el('div', 'dd-sec dd-chart'); lc.append(liveFor(spec)); body.append(lc); }
    const s = globalThis.OurChance && globalThis.OurChance.parseSlug(spec.marketId);
    const sec = el('div', 'dd-sec'); body.append(sec);   // history bars + stats: secondary, below (scroll)
    const loading = el('div', 'dd-none', 'Loading stats…'); sec.append(loading);
    const drop = () => loading.remove(); new MutationObserver((m, o) => { if (sec.children.length > 1) { drop(); o.disconnect(); } }).observe(sec, { childList: true });
    try { if (!(s && s.kind !== 'prop' ? (await teamView(sec, s, spec), true) : await playerView(sec, spec, s))) sec.append((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('ESPN', 'no stats for this bet', 'dd-none') : el('div', 'dd-none', 'no stats for this bet'))); }
    catch (e) { if (typeof console !== 'undefined') console.warn('dig deeper', e); sec.replaceChildren((globalThis.Viz && globalThis.Viz.note ? globalThis.Viz.note('', "Couldn't reach ESPN · try again", 'dd-none') : el('div', 'dd-none', "Couldn't reach ESPN · try again"))); }
  }
  return { open, close, teamRows, POSITION_STATS, STATS: S, posGroup, statsFor, rows, split, shares };
});
