/* Read-only ESPN game/stat progress for Picks and Live Bets. No grading or feed writes. */
(function (root, factory) {
 const api = factory(root);
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.BetProgress = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
 'use strict';
 const PATHS = {nba:'basketball/nba',wnba:'basketball/wnba',nhl:'hockey/nhl',nfl:'football/nfl',mlb:'baseball/mlb',epl:'soccer/eng.1',ucl:'soccer/uefa.champions',uel:'soccer/uefa.europa',uecl:'soccer/uefa.europa.conf',lal:'soccer/esp.1',sea:'soccer/ita.1',bun:'soccer/ger.1',bl1:'soccer/ger.1',fl1:'soccer/fra.1',lig1:'soccer/fra.1',mls:'soccer/usa.1',lmx:'soccer/mex.1',eflch:'soccer/eng.2'};
 const ALIASES={veg:'vgk',was:'wsh',sjs:'sj',mon:'mtl',njd:'nj',lak:'la',tbl:'tb',uta:'utah',pho:'phx',gsw:'gs',nyk:'ny',nop:'no',sas:'sa',jac:'jax',cws:'chw',az:'ari'};
 const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const abbr = s => ALIASES[String(s || '').toLowerCase()] || String(s || '').toLowerCase();
 const slugOf = s => (String(s || '').match(/([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})/) || [])[1] || '';
 const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function spec(o, fallback = {}) {
  return {text:o.desc || o.pick || (['yes','no'].includes(o.side)?'':o.side) || '',question:o.question || '',market:o.market || '',player:o.player || '',team:o.player_team || o.team?.abbr || '',
   eventSlug:o.event_slug || o.eventSlug || slugOf(o.polymarket_url || o.link || o.event_url || o.market_id) || fallback.eventSlug || '',
   marketSlug:o.market_id || o.marketId || o.marketSlug || '',resolveMarket:!!(o.market_id||o.marketId||o.marketSlug),side:o.market_side || (['yes','no'].includes(o.side)?o.side:'') || (o.key ? Number(String(o.key).split(':')[1]) ? 'no':'yes' : ''),game:o.event || o.event_game || fallback.game || '',startTime:o.startTime||o.start_time||fallback.startTime||''};
 }
 function html(value) { return `<div class="bp-host" data-bp="${esc(JSON.stringify(value))}"></div>`; }
 function findEvent(board, slug) {
  const parts=slug.split('-');
  const found=(board.events || []).filter(event=>{
   const teams=event.competitions?.[0]?.competitors || [];
   return teams.some(t=>t.homeAway==='away' && abbr(t.team?.abbreviation)===abbr(parts[1])) && teams.some(t=>t.homeAway==='home' && abbr(t.team?.abbreviation)===abbr(parts[2]));
  });
  return found.length===1 ? found[0] : null; // Doubleheaders/ambiguous games are never guessed.
 }
 const numeric = v => { const s=String(v ?? '').trim();return /^-?\d+(?:\.\d+)?$/.test(s)?Number(s):null; };
 const STAT_KEYS={reb:[['rebounds','totalRebounds']],ast:[['assists']],pts:[['points']],goals:[['goals']],stl:[['steals']],blk:[['blocks']],saves:[['saves']],threes:[['threePointFieldGoalsMade-threePointFieldGoalsAttempted','threePointFieldGoalsMade']],pra:[['points'],['rebounds','totalRebounds'],['assists']],passyd:[['passingYards','yards']],rushyd:[['rushingYards','yards']],recyd:[['receivingYards','yards']],rec:[['receptions']],ptd:[['passingTouchdowns','touchdowns']],int:[['interceptions']],hits:[['hits']],hr:[['homeRuns']],rbi:[['RBIs','runsBattedIn']],k:[['strikeouts']]};
 const CATEGORIES={passyd:'passing',ptd:'passing',int:'passing',rushyd:'rushing',recyd:'receiving',rec:'receiving',hits:'batting',hr:'batting',rbi:'batting',k:'pitching'};
 function athleteStat(summary, player, stat, team) {
  const values=[];
  for (const club of summary.boxscore?.players || []) {
   if(team && abbr(club.team?.abbreviation)!==abbr(team)) continue;
   for(const group of club.statistics || []) {
    if(CATEGORIES[stat] && !norm(group.name || group.displayName).includes(CATEGORIES[stat])) continue;
    for(const athlete of group.athletes || []) {
     if(norm(athlete.athlete?.displayName)!==norm(player) || athlete.didNotPlay) continue;
     const keys=group.keys || group.names || [];
     const needed=stat==='pts' && !keys.some(k=>norm(k)==='points') && keys.some(k=>norm(k)==='goals') ? [['goals'],['assists']] : STAT_KEYS[stat]; if(!needed) continue;
     const parts=needed.map(aliases=>{
      const i=keys.findIndex(key=>aliases.some(a=>norm(a)===norm(key)));if(i<0) return null;
      let raw=athlete.stats?.[i];
      if(String(keys[i]).includes('-')) raw=String(raw).split('-')[0];
      return numeric(raw);
     });
     if(parts.every(value=>value!==null)) values.push(parts.reduce((a,b)=>a+b,0));
    }
   }
  }
  return values.length===1 ? values[0] : null;
 }
 function parseBet(s, parser) {
  const text=String(s.text || '');
  let prop=parser && parser({text:text.replace(/^(?:Yes|No):\s*/i,''),question:s.question,player:s.player,league:s.eventSlug.split('-')[0],eventSlug:s.eventSlug,marketSlug:s.marketSlug});
  if(!prop) { const save=/^(.+?) (\d+)\+ saves/i.exec(text);if(save)prop={player:s.player||save[1],n:+save[2],stat:{key:'saves'}}; }
  if(prop && (/points\s*(?:,|\+)\s*rebounds\s*(?:,?\s*and|\+)\s*assists/i.test(text+' '+s.question) || /-pra-/.test(s.marketSlug))) prop.stat={key:'pra'};
  const context=text+' '+s.market+' '+s.question+' '+s.marketSlug;
  // Do not substitute full-game statistics for an unrecognized period contract.
  const segment=/\bQ([1-4])\b/i.exec(context)||/-q([1-4])-/.exec(s.marketSlug);
  const half=/\bH([12])\b/i.exec(context)||(/-fh-/.test(s.marketSlug)?['',1]:/-sh-/.test(s.marketSlug)?['',2]:null);
  if(!segment && !half && /(?:\bperiod\b|\bquarter\b|\bhalf\b|-(?:p[1-3]|q[1-4]|fh|sh)-)/i.test(context))return {kind:'unknown'};
  if(prop) return {kind:'prop',player:prop.player,stat:prop.stat.key,target:prop.n,under:s.side==='no'||/^No:/i.test(text)||/[—–]\s*NO\b/i.test(text),segment:!!(segment||half)};
  const total=/\b(Over|Under)\s+(\d+(?:\.\d+)?)/i.exec(text);
  if(total)return {kind:'total',target:+total[2],under:total[1].toLowerCase()==='under',teamTotal:/team total/i.test(s.market)||!/^\s*(?:Yes:|No:)?\s*(?:Over|Under)\b/i.test(text),segment:segment?{quarter:+segment[1]}:half?{half:+half[1]}:null};
  const spread=/([+-]\d+(?:\.\d+)?)/.exec(text);
  if(spread)return {kind:'spread',line:+spread[1],segment:segment?{quarter:+segment[1]}:half?{half:+half[1]}:null};
  if(/to win|\bwins?\b|moneyline/i.test(text+' '+s.market))return {kind:'winner',segment:null};
  return {kind:'unknown'};
 }
 function selectedTeam(competitors,s) {
  const text=norm(s.text);
  const found=competitors.filter(c=>[c.team?.shortDisplayName,c.team?.name,c.team?.displayName,c.team?.abbreviation].filter(Boolean).some(name=>text.startsWith(norm(name))||text.startsWith('yes'+norm(name))||text.startsWith('no'+norm(name))));
  if(found.length===1)return found[0];
  return s.team ? competitors.find(c=>abbr(c.team?.abbreviation)===abbr(s.team)) : null;
 }
 function scoresFor(c,segment,league,currentPeriod) {
  if(!segment)return numeric(c.score);
  const periods=segment.quarter?[segment.quarter]:Array.from({length:segment.half===2?Math.max(2,(c.linescores||[]).length-2):2},(_,i)=>(segment.half-1)*2+i+1);
  if(!['nba','wnba','nfl'].includes(league))return null;
  const scores=periods.map(p=>{const row=(c.linescores || [])[p-1];return row?numeric(row.value ?? row.displayValue):(currentPeriod && p>currentPeriod?0:null);});
  return scores.some(v=>v===null)?null:scores.reduce((a,b)=>a+b,0);
 }
 function gameElapsed(status,league) {
  const lengths={nba:[4,12],wnba:[4,10],nhl:[3,20],nfl:[4,15]};const config=lengths[league];
  if(status.type?.completed)return 100;
  const clock=/^(\d+):(\d+)(?:\.\d+)?$/.exec(status.displayClock || '')||(/^\d+(?:\.\d+)?$/.test(status.displayClock||'')?['',0,Number(status.displayClock)]:null);
  if(!config||!clock||!status.period)return null;
  if(status.period>config[0])return 100;
  const remaining=(config[0]-status.period)*config[1]*60+(+clock[1]*60 + +clock[2]);
  return Math.max(0,Math.min(100,100*(1-remaining/(config[0]*config[1]*60))));
 }
 function evaluateBet(s,summary,parser) {
  const game=summary.header?.competitions?.[0];if(!game)return {reason:'noGame'};
  const status=game.status || {};const competitors=game.competitors || [];const league=s.eventSlug.split('-')[0];
  if(status.type?.state==='pre')return {reason:'pregame',game};
  if(!['in','post'].includes(status.type?.state))return {reason:'noStat',game};
  const bet=parseBet(s,parser);const final=!!status.type?.completed;
  if(bet.segment&&typeof bet.segment==='object'&&status.period<(bet.segment.quarter||((bet.segment.half-1)*2+1)))return {reason:'segmentPending',game};
  if(bet.kind==='prop') {
   if(bet.segment)return {reason:'noStat',game};
   const value=athleteStat(summary,bet.player,bet.stat,s.team);
   return value===null?{reason:'noStat',game}:{kind:'threshold',value,target:bet.target,under:bet.under,stat:bet.stat,final,game,player:bet.player};
  }
  const selected=selectedTeam(competitors,s);
  if(bet.kind==='total') {
   const values=bet.teamTotal?(selected?[scoresFor(selected,bet.segment,league,status.period)]:[]):competitors.map(c=>scoresFor(c,bet.segment,league,status.period));
   if(!values.length||values.some(v=>v===null))return {reason:'noStat',game};
   return {kind:'threshold',value:values.reduce((a,b)=>a+b,0),target:bet.target,under:bet.under,stat:league==='mlb'?'runs':league==='nhl'||PATHS[league]?.startsWith('soccer/')?'goals':'pts',strict:true,final,game};
  }
  if((bet.kind==='winner'||bet.kind==='spread')&&selected&&competitors.length===2) {
   const own=scoresFor(selected,bet.segment,league,status.period),opp=scoresFor(competitors.find(c=>c!==selected),bet.segment,league,status.period);
   if(own===null||opp===null)return {reason:'noStat',game};
   const margin=own-opp+(bet.line||0);
   const subject=s.side==='no'?competitors.find(c=>c!==selected):selected;
   return {kind:'margin',margin:s.side==='no'?-margin:margin,line:bet.line,team:subject.team?.name||subject.team?.shortDisplayName||subject.team?.abbreviation,elapsed:gameElapsed(status,league),final,game};
  }
  return {reason:'noStat',game};
 }
 function resolveMarket(s,event){
  const m=(event.markets||[]).find(m=>m.slug===s.marketSlug||String(m.id)===String(s.marketSlug));
  if(!m||!['yes','no'].includes(s.side))return s;
  const chosen=(m.marketSides||[]).find(x=>x.long===(s.side==='yes'));if(!chosen)return s;
  const type=m.sportsMarketType||'', team=chosen.team;
  let text=m.title||m.question||'',side=s.side;
  if((/spread$/.test(type)||/^tennis_match_(games|sets)_spread$/.test(type))&&team){text=(team.name||team.abbreviation)+' '+chosen.description;side='yes';}
  else if((/total$/.test(type)||/^tennis_match_total_(games|sets)$/.test(type))&&/^(over|under)$/i.test(chosen.description||'')&&Number.isFinite(m.line)){text=chosen.description+' '+Math.abs(m.line);side='yes';}
  else if(/winner$/.test(type)&&team){text=(team.name||team.abbreviation)+' to win';side='yes';}
  const segment=/-sh-/.test(m.slug)?' (H2)':/-fh-/.test(m.slug)?' (H1)':(/-q([1-4])-/.exec(m.slug)||[])[1];
  if(segment)text+=typeof segment==='string'&&segment.startsWith(' ')?segment:' (Q'+segment+')';
  return {...s,resolvedMarket:true,marketSlug:m.slug,text,question:m.title||m.question||'',market:type,player:m.metadata?.playerName||'',team:team?.abbreviation||s.team,side,game:event.title||s.game,startTime:event.startDate||s.startTime};
 }
 const marketCache=new Map();
 async function enrich(s){
  if(!s.resolveMarket)return s;
  const slug=s.eventSlug;if(!/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/.test(slug))return s;
  let row=marketCache.get(slug);
  if(!row||Date.now()-row.at>600000){row={at:Date.now(),promise:fetch('https://gateway.polymarket.us/v1/events/slug/'+encodeURIComponent(slug),{credentials:'omit',signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('market unavailable');return r.json();}).then(d=>d.event).catch(e=>{marketCache.delete(slug);throw e;})};marketCache.set(slug,row);}
  return resolveMarket(s,await row.promise);
 }
 function periodConflict(entries){
  const bounds=new Map();
  for(const {spec:s,game} of entries){
   if(!game||!s?.eventSlug)continue;
   const league=s.eventSlug.split('-')[0];if(!['nba','wnba','nfl'].includes(league))continue;
   const bet=parseBet(s);if(!['spread','winner'].includes(bet.kind))continue;
   if(bet.segment&&!(bet.segment.half===2))continue;
   const teams=game.competitors||[];if(teams.length!==2)continue;
   const away=teams.find(c=>c.homeAway==='away'),home=teams.find(c=>c.homeAway==='home'),selected=selectedTeam(teams,s);
   if(!away||!home||!selected)continue;
   let halfMargin=0;
   if(bet.segment){
    if(game.status?.period<3)continue;
    const a=scoresFor(away,{half:1},league),h=scoresFor(home,{half:1},league);
    if(a===null||h===null)continue;halfMargin=a-h;
   }
   // D is final away-minus-home score. H2 away margin is D minus
   // halftime margin; each selected outcome gives a strict bound on D.
   const direction=(selected===away?1:-1)*(s.side==='no'?-1:1);
   const boundary=halfMargin-(selected===away?1:-1)*(bet.line||0);
   const key=s.eventSlug;const b=bounds.get(key)||{lower:-Infinity,upper:Infinity};
   if(direction>0)b.lower=Math.max(b.lower,boundary);else b.upper=Math.min(b.upper,boundary);
   bounds.set(key,b);
   // Scores are integers; even two strict bounds less than one point
   // apart can exclude every possible final margin.
   if(Math.floor(b.lower)+1>=b.upper)return true;
  }
  return false;
 }
 function refreshComboWarning(card){
  if(!card)return;
  const entries=Array.from(card.querySelectorAll('.bp-host')).map(h=>h._bpVerified).filter(Boolean);
  const conflict=periodConflict(entries);let warning=card.querySelector('.pm-period-conflict');
  if(!conflict){warning?.remove();return;}
  if(!warning){warning=node('p','error pm-period-conflict',root.STR.comboSafety.periodConflict);warning.setAttribute('role','alert');card.prepend(warning);}
 }
 const cache=new Map();
 async function get(url) {
  const cached=cache.get(url);if(cached&&Date.now()-cached.at<15000)return cached.promise;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  const promise=fetch(url,{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error('ESPN unavailable');return r.json();}).catch(error=>{cache.delete(url);throw error;}).finally(()=>clearTimeout(timer));
  cache.set(url,{at:Date.now(),promise});return promise;
 }
 function node(tag,cls,text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function image(url) {if(!/^https:\/\//i.test(url || ''))return null;const img=node('img','bp-logo');img.src=url;img.width=22;img.height=22;img.alt='';img.decoding='async';img.onerror=()=>img.remove();return img;}
 function teamName(c) {const label=node('span','bp-team');const logo=image(c.team?.logo || c.team?.logos?.[0]?.href);if(logo)label.append(logo);label.append(node('strong','',c.team?.shortDisplayName || c.team?.name || c.team?.abbreviation || ''));return label;}
 function clockText(status,S){
  if(status?.type?.completed)return S.clockFinal;
  const detail=status?.type?.detail||status?.type?.shortDetail||'';
  if(status?.type?.state!=='in')return detail||S.clockUnavailable;
  if(/HALFTIME|END_PERIOD|INTERMISSION/.test(status.type?.name||''))return detail||S.clockUpdating;
  const clock=String(status.displayClock||'');
  if(!clock)return detail||S.clockUnavailable;
  if(/^(?:0+:)?0+(?:\.0+)?$/.test(clock))return S.clockUpdating;
  return detail||S.clockLive(clock);
 }
 function marginText(r,S){
  const team=r.team||S.yourTeam;
  if(r.unit)return r.line!==undefined?S.tenniSpread(team,r.margin,r.unit,r.final):S.tenniLead(team,r.margin,r.final);
  if(r.line!==undefined)return r.margin>0?S.covering(team,r.margin,r.final):S.needsCover(team,Math.floor(-r.margin)+1,r.final);
  return r.margin>0?S.ahead(team,r.margin,r.final):r.margin<0?S.behind(team,-r.margin,r.final):S.tied(team,r.final);
 }
 function progressTrack(value,min,max,label,state,marker=false){
  const track=node('div','bp-bar bp-'+state);track.setAttribute('role',marker?'meter':'progressbar');
  track.setAttribute('aria-valuemin',min);track.setAttribute('aria-valuemax',max);track.setAttribute('aria-valuenow',Math.max(min,Math.min(value,max)));track.setAttribute('aria-label',label);
  const fill=node('span','bp-fill');fill.style.width=Math.max(0,Math.min(100,(value-min)/(max-min)*100))+'%';track.append(fill);
  if(marker)track.append(node('span','bp-marker'));return track;
 }
 function render(host,s,result) {
  const S=root.STR.progress;host.title=S.explanation;const rows=[];const game=result.game;
  if(game) {
   const competitors=[...(game.competitors || [])].sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home'));
   const matchup=host.closest('.lb-edge')?.querySelector('.lb-matchup');
   if(matchup){matchup.replaceChildren();competitors.forEach((c,i)=>{if(i)matchup.append(node('span','bp-at',game.tennis?'vs.':'@'));matchup.append(teamName(c));});}
   const score=node('div','bp-scoreline');
   if(game.status?.type?.state==='pre')score.textContent=S.starts(new Date(game.date || '').toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}));
   else {const text=competitors.map(c=>(c.team?.abbreviation || '')+' '+(game.tennis?(c.linescores||[]).map(s=>s.value).join(', '):(c.score ?? S.dash))).join(' · ');score.append(node('b','',game.tennis?S.tenniScores(text):text),node('span','bp-clock',clockText(game.status,S)));}
   rows.push(score);
  }
  if(result.reason)rows.push(node('div','bp-note',S[result.reason] || S.noStat));
  else if(result.kind==='threshold') {
   const limit=result.target,value=result.value;
   const row=node('div','bp-values');row.append(node('b','',S.count(value,limit,S.stats[result.stat] || S.stats.score)));
   let note;
   if(result.under)note=value<limit?S.stayUnder(limit,result.final):value===limit&&result.strict?S.atLine:S.overLimit;
   else {const remaining=Math.max(0,(result.strict?Math.floor(limit)+1:limit)-value);note=remaining?(result.final?S.notReached:S.needs(remaining)):S.reached;}
   row.append(node('span','',note));rows.push(row);
   const met=result.under?value<limit:value>limit||(!result.strict&&value===limit);
   const state=met?'positive':result.final||result.under?'negative':'neutral';
   rows.push(progressTrack(value,0,limit>0?limit:1,S.count(value,limit,S.stats[result.stat] || S.stats.score),state));
  } else if(result.kind==='margin') {
   const caption=marginText(result,S),row=node('div','bp-values');row.append(node('b','',caption),node('span','',result.line===undefined?S.centerTie:S.centerLine));rows.push(row);
   const range=Math.max(10,Math.abs(result.margin)*1.25);rows.push(progressTrack(result.margin,-range,range,caption,result.margin>0?'positive':result.margin<0?'negative':'neutral',true));
  }
  rows.push(node('span','bp-checked',(game?.status?.type?.completed?S.final+' · ':'')+S.checked(new Date().toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}))));
  host.replaceChildren(...rows);
 }
 async function hydrate(host) {
  if(host._bpBusy)return;host._bpBusy=true;
  try {
   let s=JSON.parse(host.dataset.bp);if(!host.children.length)host.append(node('div','bp-note',root.STR.progress.loading));
   try{s=await enrich(s);}catch(e){/* Scores remain available; never guess missing contract details. */}
   const label=host.previousElementSibling;if(s.resolveMarket&&label?.classList.contains('pm-leg-label'))label.textContent=s.text;
   const parts=s.eventSlug.split('-'),path=PATHS[parts[0]];
   if(root.TennisScores?.isTennis(s.eventSlug)){
    const T=root.TennisScores,date=(s.startTime||parts.slice(3).join('-')).slice(0,10).replaceAll('-',''),board=await get('https://site.api.espn.com/apis/site/v2/sports/tennis/'+T.tour(s.eventSlug)+'/scoreboard?dates='+date+'&limit=1000'),match=T.find(board,s.game,s.eventSlug,s.startTime);
    const result=!match?{reason:'noGame'}:s.resolveMarket&&!s.resolvedMarket?{reason:'noStat',game:T.adapt(match)}:T.evaluate(s,match);
    if(host.isConnected){render(host,s,result);if(result.game?.tennis)host.closest('.lb-edge')?.querySelector('.lb-unverified')?.remove();}return;
   }
   if(!path){render(host,s,{reason:'noGame'});return;}
   const board=await get('https://site.api.espn.com/apis/site/v2/sports/'+path+'/scoreboard?dates='+parts.slice(3).join('')+'&limit=1000');
   const event=findEvent(board,s.eventSlug);
   if(!event){render(host,s,{reason:'noGame'});return;}
   let summary={header:{competitions:event.competitions}};
   if(event.status?.type?.state!=='pre')summary=await get('https://site.web.api.espn.com/apis/site/v2/sports/'+path+'/summary?event='+event.id);
   // Keep score, splits and clock together from one scoreboard snapshot. Summary
   // box scores can lag or temporarily report a zero clock at period transitions.
   summary={...summary,header:{...summary.header,competitions:[{...event.competitions[0],status:event.status||event.competitions[0].status}]}};
   if(host.isConnected){const result=s.resolveMarket&&!s.resolvedMarket?{reason:'noStat',game:summary.header?.competitions?.[0]}:evaluateBet(s,summary,root.Viz?.parseProp);host._bpVerified={spec:s,game:result.game};render(host,s,result);refreshComboWarning(host.closest('.pm-position'));}
  } catch(error) {if(host.isConnected)render(host,{}, {reason:'unavailable'});} finally {host._bpBusy=false;}
 }
 function scan() {
  if(document.hidden)return;
  document.querySelectorAll('#tab-picks .bp-host, #tab-bets .bp-host').forEach(host=>{if(!host.closest('details:not([open])')&&!host.closest('[hidden]'))hydrate(host);});
 }
 if(typeof document!=='undefined') {
  let pending=false;const schedule=()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;scan();},60);};
  new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches('.bp-host')||n.querySelector('.bp-host')))))schedule();}).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('toggle',schedule,true);document.addEventListener('visibilitychange',schedule);
  setInterval(scan,15000);
 }
 return {spec,html,findEvent,athleteStat,parseBet,selectedTeam,scoresFor,gameElapsed,evaluateBet,resolveMarket,clockText,marginText,periodConflict};
});

