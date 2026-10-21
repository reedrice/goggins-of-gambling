/* Read-only ESPN game/stat progress for Picks and Live Bets. No grading or feed writes. */
(function (root, factory) {
 const api = factory(root);
 if (typeof module === 'object' && module.exports) module.exports = api;
 else root.BetProgress = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
 'use strict';
 const PATHS = {nba:'basketball/nba',wnba:'basketball/wnba',nhl:'hockey/nhl',nfl:'football/nfl',mlb:'baseball/mlb',epl:'soccer/eng.1',ucl:'soccer/uefa.champions',uel:'soccer/uefa.europa',uecl:'soccer/uefa.europa.conf',lal:'soccer/esp.1',sea:'soccer/ita.1',bun:'soccer/ger.1',bl1:'soccer/ger.1',fl1:'soccer/fra.1',lig1:'soccer/fra.1',mls:'soccer/usa.1',lmx:'soccer/mex.1',eflch:'soccer/eng.2'};
 const ALIASES={was:'wsh',sjs:'sj',mon:'mtl',njd:'nj',lak:'la',tbl:'tb',uta:'utah',pho:'phx',gsw:'gs',nyk:'ny',nop:'no',sas:'sa',jac:'jax',cws:'chw',az:'ari'};
 const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const abbr = s => ALIASES[String(s || '').toLowerCase()] || String(s || '').toLowerCase();
 const slugOf = s => (String(s || '').match(/([a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2})/) || [])[1] || '';
 const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function spec(o, fallback = {}) {
  return {text:o.desc || o.pick || (['yes','no'].includes(o.side)?'':o.side) || '',question:o.question || '',market:o.market || '',player:o.player || '',team:o.player_team || o.team?.abbr || '',
   eventSlug:o.event_slug || o.eventSlug || slugOf(o.polymarket_url || o.link || o.event_url || o.market_id) || fallback.eventSlug || '',
   marketSlug:o.market_id || o.marketId || o.marketSlug || '',side:o.market_side || (['yes','no'].includes(o.side)?o.side:'') || (o.key ? Number(String(o.key).split(':')[1]) ? 'no':'yes' : ''),game:o.event || o.event_game || fallback.game || ''};
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
  const segment=/\bQ([1-4])\b/i.exec(context);
  if(!segment && /(?:\bperiod\b|\bquarter\b|\bhalf\b|-(?:p[1-3]|q[1-4]|fh|sh)-)/i.test(context) && !/\bH[12]\b/i.test(context))return {kind:'unknown'};
  const half=/\bH([12])\b/i.exec(context);
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
 function scoresFor(c,segment,league) {
  if(!segment)return numeric(c.score);
  const periods=segment.quarter?[segment.quarter]:Array.from({length:2},(_,i)=>(segment.half-1)*2+i+1);
  if(!['nba','wnba','nfl'].includes(league))return null;
  const scores=periods.map(p=>{const row=(c.linescores || [])[p-1];return row?numeric(row.value ?? row.displayValue):null;});
  return scores.some(v=>v===null)?null:scores.reduce((a,b)=>a+b,0);
 }
 function gameElapsed(status,league) {
  const lengths={nba:[4,12],wnba:[4,10],nhl:[3,20],nfl:[4,15]};const config=lengths[league];
  if(status.type?.completed)return 100;
  const clock=/^(\d+):(\d+)(?:\.\d+)?$/.exec(status.displayClock || '');
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
  if(bet.kind==='prop') {
   if(bet.segment)return {reason:'noStat',game};
   const value=athleteStat(summary,bet.player,bet.stat,s.team);
   return value===null?{reason:'noStat',game}:{kind:'threshold',value,target:bet.target,under:bet.under,stat:bet.stat,final,game,player:bet.player};
  }
  const selected=selectedTeam(competitors,s);
  if(bet.kind==='total') {
   const values=bet.teamTotal?(selected?[scoresFor(selected,bet.segment,league)]:[]):competitors.map(c=>scoresFor(c,bet.segment,league));
   if(!values.length||values.some(v=>v===null))return {reason:'noStat',game};
   return {kind:'threshold',value:values.reduce((a,b)=>a+b,0),target:bet.target,under:bet.under,stat:league==='mlb'?'runs':league==='nhl'||PATHS[league]?.startsWith('soccer/')?'goals':'pts',strict:true,final,game};
  }
  if((bet.kind==='winner'||bet.kind==='spread')&&selected&&competitors.length===2) {
   const own=scoresFor(selected,bet.segment,league),opp=scoresFor(competitors.find(c=>c!==selected),bet.segment,league);
   if(own===null||opp===null)return {reason:'noStat',game};
   const margin=own-opp+(bet.line||0);
   return {kind:'margin',margin:s.side==='no'?-margin:margin,line:bet.line,elapsed:gameElapsed(status,league),final,game};
  }
  return {reason:'noStat',game};
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
 function render(host,s,result) {
  const S=root.STR.progress;host.title=S.explanation;const rows=[];const game=result.game;
  if(game) {
   const competitors=[...(game.competitors || [])].sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home'));
   const matchup=host.closest('.lb-edge')?.querySelector('.lb-matchup');
   if(matchup){matchup.replaceChildren();competitors.forEach((c,i)=>{if(i)matchup.append(node('span','bp-at','@'));matchup.append(teamName(c));});}
   const score=node('div','bp-scoreline');
   if(game.status?.type?.state==='pre')score.textContent=S.starts(new Date(game.date || '').toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}));
   else {score.append(node('b','',competitors.map(c=>(c.team?.abbreviation || '')+' '+(c.score ?? S.dash)).join(' · ')),node('span','bp-clock',game.status?.type?.shortDetail || game.status?.type?.detail || S.clockUnavailable));}
   rows.push(score);
  }
  if(result.reason)rows.push(node('div','bp-note',S[result.reason] || S.noStat));
  else if(result.kind==='threshold') {
   const limit=result.target,value=result.value;
   const row=node('div','bp-values');row.append(node('b','',S.count(value,limit,S.stats[result.stat] || S.stats.score)));
   let note;
   if(result.under)note=value<limit?S.below(limit):value===limit&&result.strict?S.atLine:S.limitReached;
   else {const remaining=Math.max(0,(result.strict?Math.floor(limit)+1:limit)-value);note=remaining?(result.final?S.notReached:S.needs(remaining)):S.reached;}
   row.append(node('span','',note));rows.push(row);
   const bar=node('progress','bp-bar');bar.max=limit>0?limit:1;bar.value=Math.max(0,Math.min(value,bar.max));bar.setAttribute('aria-label',S.count(value,limit,S.stats[result.stat] || S.stats.score));if(result.under)bar.classList.add('bp-limit');rows.push(bar);
  } else if(result.kind==='margin') {
   rows.push(node('div','bp-values',result.line!==undefined?S.adjusted(result.margin):S.margin(result.margin)));
   if(result.elapsed!==null) {const label=node('span','bp-note',S.gameElapsed);const bar=node('progress','bp-bar');bar.max=100;bar.value=result.elapsed;bar.setAttribute('aria-label',S.gameElapsed);rows.push(label,bar);}
  }
  if(game?.status?.type?.completed)rows.push(node('span','bp-note',S.final));
  rows.push(node('span','bp-checked',S.checked(new Date().toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}))));
  host.replaceChildren(...rows);
 }
 async function hydrate(host) {
  if(host._bpBusy)return;host._bpBusy=true;
  try {
   const s=JSON.parse(host.dataset.bp);if(!host.children.length)host.append(node('div','bp-note',root.STR.progress.loading));
   const parts=s.eventSlug.split('-'),path=PATHS[parts[0]];
   if(!path){render(host,s,{reason:'noGame'});return;}
   const board=await get('https://site.api.espn.com/apis/site/v2/sports/'+path+'/scoreboard?dates='+parts.slice(3).join('')+'&limit=1000');
   const event=findEvent(board,s.eventSlug);
   if(!event){render(host,s,{reason:'noGame'});return;}
   let summary={header:{competitions:event.competitions}};
   if(event.status?.type?.state!=='pre')summary=await get('https://site.web.api.espn.com/apis/site/v2/sports/'+path+'/summary?event='+event.id);
   if(host.isConnected)render(host,s,evaluateBet(s,summary,root.Viz?.parseProp));
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
 return {spec,html,findEvent,athleteStat,parseBet,selectedTeam,scoresFor,gameElapsed,evaluateBet};
});
