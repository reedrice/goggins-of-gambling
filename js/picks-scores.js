/* Sport-filtered ticker consuming published ESPN snapshots; no direct sports ingestion. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PicksScores = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SOURCES = [
    ['NBA', 'basketball/nba'], ['NHL', 'hockey/nhl'], ['NFL', 'football/nfl'],
    ['MLB', 'baseball/mlb'], ['WNBA', 'basketball/wnba'], ['Soccer', 'soccer/all'],
    ['NCAAF','football/college-football'], ['NCAAB','basketball/mens-college-basketball'], ['WNCAAB','basketball/womens-college-basketball'],
    ['ATP','tennis/atp'], ['WTA','tennis/wta'], ['PGA','golf/pga'], ['LPGA','golf/lpga']
  ];
  const REFRESH = 60000;
  let active = null, cache = null, selectedSport = '';
  const SPORT_LEAGUES = {NBA:['nba'],NHL:['nhl'],NFL:['nfl'],MLB:['mlb'],WNBA:['wnba'],NCAAF:['cfb'],NCAAB:['cbb'],WNCAAB:['wcbb'],Tennis:['atp','wta'],Golf:['pga','lpga','dpwt'],Soccer:['epl','bun','eflch','fl1','lal','lmx','mls','sea','ucl','uecl','uel']};
  const leagueSource = league => Object.entries(SPORT_LEAGUES).find(([,leagues])=>leagues.includes(league))?.[0];
  function snapshotFor(docs, sport = '', now = new Date()) {
    const selected = docs.filter(d=>!sport || SPORT_LEAGUES[sport]?.includes(d.league));
    const games = mode => selected.flatMap(d=>liveGames(d, ['atp','wta','pga','lpga','dpwt'].includes(d.league)?d.league.toUpperCase():leagueSource(d.league), mode, now));
    const live=games('live');
    return {groups:groupGames([live.length?live:games('upcoming')],sport==='NCAAF'),upcoming:!live.length};
  }
  function dates(now = new Date()) {
    const fmt = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
    // Yesterday catches games still live after local midnight. Completed games are filtered below.
    return [fmt(new Date(now.getTime() - 86400000)), fmt(now)];
  }
  function teamLogo(team) {
    const candidates = [team.logo, ...(team.logos || []).map(logo => logo.href)];
    return candidates.find(url => typeof url === 'string' && /^https:\/\//i.test(url)) || null;
  }
  function liveGames(board, source, mode = 'live', now = new Date()) {
    const seen = new Set();
    const events = (board.events || []).flatMap(event => (source==='ATP'||source==='WTA') && Array.isArray(event.groupings) ? event.groupings.flatMap(g=>(g.competitions || []).map(c=>({...event,id:event.id+':'+c.id,date:c.date,competitions:[c]}))) : [event]);
    return events.flatMap(event => {
      const game = (event.competitions || [])[0];
      const status = (game && game.status) || event.status || {};
      if (!game || !status.type || status.type.completed || seen.has(event.id)) return [];
      if (mode === 'live' && status.type.state !== 'in') return [];
      if (mode === 'upcoming' && (status.type.state !== 'pre' || /postpon|cancel|suspend|delay/i.test((status.type.name || '') + (status.type.description || '')) || !event.date || Date.parse(event.date) < now.getTime() || dates(new Date(event.date))[1] !== dates(now)[1])) return [];
      if(source==='PGA'||source==='LPGA') {
        seen.add(event.id);
        return [{id:String(event.id),league:source,tournament:true,away:event.name,home:'',awayLogo:null,homeLogo:null,awayScore:null,homeScore:null,detail:mode==='upcoming'?event.date:status.type.shortDetail || status.type.detail || status.type.description || ''}];
      }
      const away = (game.competitors || []).find(t => t.homeAway === 'away');
      const home = (game.competitors || []).find(t => t.homeAway === 'home');
      if (!away || !home) return [];
      if(source==='ATP'||source==='WTA') {
        if(!away.athlete || !home.athlete)return [];
        const setScore=c=>(c.linescores || []).every(x=>Number.isFinite(x.value)) ? (c.linescores || []).map(x=>x.value).join(', ') : '';
        seen.add(event.id);return [{id:String(event.id),league:source,away:away.athlete.shortName || away.athlete.displayName,home:home.athlete.shortName || home.athlete.displayName,awayLogo:null,homeLogo:null,awayScore:setScore(away),homeScore:setScore(home),detail:mode==='upcoming'?event.date:status.type.shortDetail || status.type.detail || ''}];
      }
      if(!away.team || !home.team)return [];
      const score = team => /^\d+$/.test(String(team.score)) ? String(team.score) : null;
      if (mode === 'live' && (score(away) === null || score(home) === null)) return [];
      seen.add(event.id);
      const leagueLink = (event.links || []).map(link => link.href || '').find(href => href.includes('/league/')) || '';
      const soccerLeague = /\/league\/([^/?#]+)/.exec(leagueLink);
      return [{ id: String(event.id), league: source === 'Soccer' && soccerLeague ? soccerLeague[1] : source,
        away: away.team.shortDisplayName || away.team.displayName || away.team.abbreviation,
        home: home.team.shortDisplayName || home.team.displayName || home.team.abbreviation,
        awayLogo: teamLogo(away.team), homeLogo: teamLogo(home.team),
        ...(source==='NCAAF'?collegeMeta(game,away,home):{}),
        awayScore: score(away), homeScore: score(home), detail: mode === 'upcoming' ? event.date : status.type.shortDetail || status.type.detail || status.displayClock || '' }];
    });
  }
  function collegeMeta(competition, away, home) {
    const rank=c=>Number.isInteger(c.curatedRank?.current)&&c.curatedRank.current>=1&&c.curatedRank.current<=25?c.curatedRank.current:null;
    const group=competition.groups;
    const conference=competition.conferenceCompetition===false?'non-conference':competition.conferenceCompetition===true&&group?.isConference&&(group.shortName||group.name)?(group.shortName||group.name):'unknown';
    return {conference,awayRank:rank(away),homeRank:rank(home)};
  }
  function groupGames(results, byConference=false) {
    const groups = new Map();
    results.flat().forEach(game => {
      const key=byConference?game.league+':'+game.conference:game.league;
      if (!groups.has(key)) groups.set(key, new Map());
      groups.get(key).set(game.id, game);
    });
    return Array.from(groups, ([key, games]) => {const rows=Array.from(games.values());return {league:rows[0].league,...(byConference?{conference:rows[0].conference}:{}),games:rows};});
  }
  function stop() {
    if (!active) return;
    clearTimeout(active.timer); active.controller?.abort(); active = null;
  }
  function mount(root) {
    stop();
    const S = window.STR.picks.scores;
    const state = active = { root, paused: false, timer: null, controller: null };
    root.className = 'picks-score-ticker';
    const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
    const header = node('div', 'pst-header');
    header.append(node('strong', 'pst-title', S.title));
    const meta = node('span', 'pst-meta', S.loading);
    const pause = node('button', 'pst-pause', S.pause); pause.type = 'button'; pause.disabled = true;
    pause.onclick = () => { state.paused = !state.paused; root.classList.toggle('pst-paused', state.paused); pause.textContent = state.paused ? S.resume : S.pause; pause.setAttribute('aria-pressed', String(state.paused)); };
    header.append(meta, pause);
    const viewport = node('div', 'pst-viewport');
    root.replaceChildren(header, viewport);
    // Capture errors on both original and cloned marquee lanes. Team text stays
    // visible if ESPN does not supply a logo or an image cannot be loaded.
    root.addEventListener('error', event => {
      if (event.target.matches && event.target.matches('img.pst-logo')) event.target.remove();
    }, true);
    const team = (name, logo, rank) => {
      const label = node('span', 'pst-team');
      if (logo) {
        const image = node('img', 'pst-logo'); image.src = logo;
        image.alt = ''; image.width = 20; image.height = 20; image.decoding = 'async';
        label.append(image);
      }
      if(rank){const number=node('span','pst-rank',S.rank(rank));number.setAttribute('aria-label',S.rankLabel(rank));label.append(number);}
      label.append(node('span', 'pst-name', name));
      return label;
    };
    root.setAttribute('role', 'region'); root.setAttribute('aria-label', S.title);
    function render(snapshot) {
      if (active !== state || !root.isConnected) return;
      const view = snapshotFor(snapshot.docs, selectedSport);
      snapshot = {...snapshot,...view,failures:snapshot.failures.filter(league=>!selectedSport||SPORT_LEAGUES[selectedSport].includes(league))};
      const when = new Date(snapshot.sourceAt || snapshot.at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
      header.querySelector('.pst-title').textContent = snapshot.upcoming ? S.upcoming : S.title;
      meta.textContent = snapshot.failures.length ? S.partial(snapshot.failures.join(', '), when) : S.checked(when);
      meta.title = S.coverage;
      if (Date.now()-Date.parse(snapshot.sourceAt)>30*60000) meta.textContent += ' · '+S.delayed;
      if (!snapshot.groups.length) {
        viewport.replaceChildren(node('div', 'pst-empty', snapshot.failures.length ? S.unavailable : selectedSport ? S.emptySport(S.leagues[selectedSport] || selectedSport) : S.empty)); pause.disabled = true; return;
      }
      const oldTrack = viewport.querySelector('.pst-track');
      const transform = oldTrack && getComputedStyle(oldTrack).transform;
      const distance = transform && transform !== 'none' ? Math.abs(new DOMMatrixReadOnly(transform).m41) : 0;
      const track = node('div', 'pst-track');
      const lane = node('div', 'pst-lane');
      snapshot.groups.forEach(group => {
        const block = node('div', 'pst-group');
        block.append(node('strong', 'pst-league', group.conference ? (group.conference==='non-conference'?S.nonConference:group.conference==='unknown'?S.conferenceUnknown:group.conference) : S.leagues[group.league] || S.soccer));
        group.games.forEach(game => {
          const item = node('span', 'pst-game');
          item.append(team(game.away, game.awayLogo, game.awayRank));
          if (!snapshot.upcoming && game.awayScore!==null) item.append(node('b', 'pst-score', game.awayScore));
          if(!game.tournament)item.append(node('span', 'pst-at', S.at), team(game.home, game.homeLogo, game.homeRank));
          if (!snapshot.upcoming && game.homeScore!==null) item.append(node('b', 'pst-score', game.homeScore));
          const detail = snapshot.upcoming ? new Date(game.detail).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) + ' CT' : game.detail;
          item.append(node('span', 'pst-clock', detail));
          item.querySelectorAll('.pst-score').forEach((score,i)=>window.SiteMotion?.update('ticker:'+group.league+':'+game.id+':'+i,score,score.textContent));
          block.append(item);
        });
        lane.append(block);
      });
      track.append(lane);
      const duplicate = lane.cloneNode(true); duplicate.setAttribute('aria-hidden', 'true'); track.append(duplicate);
      viewport.replaceChildren(track); pause.disabled = false;
      root.style.setProperty('--pst-lane-width', viewport.clientWidth + 'px');
      const duration = Math.max(20, lane.scrollWidth / 42);
      root.style.setProperty('--pst-duration', duration + 's');
      // Keep our place through minute-by-minute score updates, so late league
      // groups are reached even when a full circuit takes longer than a minute.
      track.style.animationDelay = -(distance % lane.scrollWidth) / lane.scrollWidth * duration + 's';
    }
    async function refresh() {
      if (active !== state || !root.isConnected) return;
      if (document.hidden || root.closest('[hidden]')) { state.timer = setTimeout(refresh, REFRESH); return; }
      if (cache && Date.now() - cache.at < REFRESH) { render(cache); state.timer = setTimeout(refresh, REFRESH - (Date.now() - cache.at)); return; }
      if (state.loading) return;
      state.loading = true;
      const controller = state.controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
      const read = async path => {
        const response=await fetch(path+'?scores='+Math.floor(Date.now()/REFRESH),{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw Error('snapshot');return response.json();
      };
      const index=await read('data/espn/index.json');
      if(!Array.isArray(index.snapshots))throw Error('index');
      const entries=index.snapshots.filter(s=>leagueSource(s.league)&&typeof s.file==='string'&&/^data\/espn\/[a-z0-9-]+\.json$/.test(s.file));
      const results=await Promise.allSettled(entries.map(async entry=>{
        if(!entry.available)throw Error('unavailable');
        const doc=await read(entry.file);
        if(doc.league!==entry.league||!Array.isArray(doc.events))throw Error('shape');
        return doc;
      }));
      if (active !== state) return;
      cache={at:Date.now(),sourceAt:index.updated_at,docs:results.filter(r=>r.status==='fulfilled').map(r=>r.value),failures:results.flatMap((r,i)=>r.status==='rejected'?[entries[i].league]:[])};
      render(cache);
      } catch {
        if(active===state){meta.textContent=S.unavailable;if(!viewport.querySelector('.pst-game'))viewport.replaceChildren(node('div','pst-empty',S.unavailable));}
      } finally {
        clearTimeout(timeout);state.loading=false;
        if(active===state)state.timer=setTimeout(refresh,REFRESH);
      }
    }
    refresh();
    state.redraw = () => { if (cache) render(cache); };
    state.wake = () => { if (!document.hidden) { clearTimeout(state.timer); refresh(); } };
  }
  if (typeof window !== 'undefined') window.addEventListener('picks:sport-change',event=>{const sport=event.detail?.sport;if(sport!==''&&!SPORT_LEAGUES[sport])return;selectedSport=sport;active?.redraw?.();});
  if (typeof window !== 'undefined') window.addEventListener('resize', () => active?.redraw?.());
  if (typeof window !== 'undefined') for(const event of ['focus','online'])window.addEventListener(event,()=>active?.wake?.());
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => active?.wake?.());
  return { SOURCES, SPORT_LEAGUES, snapshotFor, collegeMeta, dates, liveGames, groupGames, mount, stop };
});
