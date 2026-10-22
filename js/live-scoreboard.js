/* Selected-sport scores from the existing public ESPN snapshots. No new timer or ingestion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LiveScoreboard=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const GROUPS={nba:['nba'],wnba:['wnba'],nhl:['nhl'],mlb:['mlb'],nfl:['nfl'],ncaaf:['cfb'],ncaab:['cbb'],wncaab:['wcbb'],tennis:['atp','wta'],golf:['pga','lpga','dpwt'],soccer:['epl','bun','eflch','fl1','lal','lmx','mls','sea','ucl','uecl','uel']};
 const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 const logo=c=>[c.team?.logo,...(c.team?.logos||[]).map(x=>x.href)].find(x=>typeof x==='string'&&/^https:\/\//.test(x));
 function games(docs,sport,now=Date.now()){
  const seen=new Set(),out=[];
  for(const d of docs.filter(d=>GROUPS[sport]?.includes(d.league)))for(const e of d.events||[])for(const c of e.competitions?.length?e.competitions:[e]){
   const status=c.status||e.status||{},type=status.type||{},at=Date.parse(c.date||e.date),id=d.league+':'+(c.id||e.id);
   if(seen.has(id)||!Number.isFinite(at)||!type.state)continue;
   if(day(at)!==day(now)&&!(type.state==='in'&&at<=now&&(['golf'].includes(sport)||now-at<86400000)))continue;
   const competitors=c.competitors||[];
   const tournament=sport==='golf';
   const pair=tournament?[]:[...competitors].sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home')).slice(0,2);
   if(!tournament&&pair.length!==2)continue;
   const teams=pair.map(p=>({name:p.team?.abbreviation||p.athlete?.shortName||p.athlete?.displayName||p.team?.displayName||p.roster?.displayName||p.displayName||'',logo:logo(p),score:type.state==='pre'?null:(typeof p.score==='object'?p.score?.displayValue:p.score)??null}));
   if(teams.some(t=>!t.name))continue;
   seen.add(id);out.push({id,at,state:type.state,detail:type.shortDetail||type.detail||type.description||'',teams,tournament,name:e.name||'',checked:d.fetched_at});
  }
  return out.sort((a,b)=>({in:0,pre:1,post:2}[a.state]??3)-({in:0,pre:1,post:2}[b.state]??3)||a.at-b.at);
 }
 const cache=new Map(),offsets=new Map();
 async function read(path){const r=await fetch(path+'?scores='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('score snapshot');return r.json();}
 async function load(sport){
  const old=cache.get(sport);if(old&&Date.now()-old.at<30000)return old.promise;
  const promise=(async()=>{const ix=await read('data/espn/index.json');const entries=(ix.snapshots||[]).filter(s=>GROUPS[sport]?.includes(s.league)&&s.date===day(Date.now())&&/^data\/espn\/[a-z0-9-]+\.json$/.test(s.file));if(!entries.length)throw Error('coverage');const results=await Promise.allSettled(entries.map(async s=>{if(!s.available)throw Error('unavailable');const d=await read(s.file);if(d.league!==s.league||!Array.isArray(d.events))throw Error('shape');return d;}));return {docs:results.filter(x=>x.status==='fulfilled').map(x=>x.value),partial:results.some(x=>x.status==='rejected')};})();
  cache.set(sport,{at:Date.now(),promise});try{return await promise;}catch(e){cache.delete(sport);throw e;}
 }
 function matches(feed,id){return !!id && id.slice(id.indexOf(':')+1)===String(feed.game_context?.event_id||'') && GROUPS[Object.keys(GROUPS).find(s=>GROUPS[s].includes(id.split(':')[0]))]?.includes(String(feed.slug||'').split('-')[0]);}
 function mount(host,sport,options={}){
  if(!host||!GROUPS[sport])return;
  const S=window.STR.liveScoreboard,node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  host.className='lb-scoreboard';host.setAttribute('role','region');host.setAttribute('aria-label',S.title);host.append(node('span','lb-board-note',S.loading));
  load(sport).then(({docs,partial})=>{
   if(!host.isConnected)return;const rows=games(docs,sport),times=docs.map(d=>Date.parse(d.fetched_at)).filter(Number.isFinite),oldest=Math.min(...times),stale=!times.length||Date.now()-oldest>10*60000;
   host.replaceChildren();const meta=node('div','lb-board-note');meta.textContent=times.length?S.checked(new Date(oldest).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'})):S.unavailable;if(partial||stale)meta.textContent+=' · '+S.delayed;host.append(meta);
   if(options.selected){const clear=node('button','lb-board-clear',S.allGames);clear.type='button';clear.onclick=()=>options.onSelect?.(null);meta.append(' · ',clear);}
   if(!rows.length){host.append(node('span','lb-board-empty',partial?S.unavailable:S.empty));return;}
   const rail=node('div','lb-board-rail'),viewport=node('div','lb-board-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label',S.title);
   const left=node('button','lb-board-arrow','‹'),right=node('button','lb-board-arrow','›');left.type=right.type='button';left.setAttribute('aria-label',S.previous);right.setAttribute('aria-label',S.next);
   for(const g of rows){const card=node('button','lb-board-game');card.type='button';card.dataset.gameId=g.id;card.setAttribute('aria-pressed',String(options.selected===g.id));card.setAttribute('aria-label',S.game(g.tournament?g.name:g.teams.map(t=>t.name).join(' vs. ')));card.onclick=()=>options.onSelect?.(options.selected===g.id?null:g.id,g.id);card.append(node('div','lb-board-clock'+(g.state==='in'?' lb-board-live':''),g.state==='pre'?new Date(g.at).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'})+' CT':g.detail));if(g.tournament)card.append(node('strong','lb-board-tournament',g.name));for(const t of g.teams){const row=node('div','lb-board-team');if(t.logo){const img=node('img','');img.src=t.logo;img.alt='';img.width=img.height=16;img.onerror=()=>img.remove();row.append(img);}row.append(node('span','lb-board-name',t.name),node('b','lb-board-score',t.score??'—'));card.append(row);}viewport.append(card);}
   const sync=()=>{left.disabled=viewport.scrollLeft<2;right.disabled=viewport.scrollLeft+viewport.clientWidth>=viewport.scrollWidth-2;};
   const move=n=>viewport.scrollBy({left:n*Math.max(128,viewport.clientWidth-128),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});left.onclick=()=>move(-1);right.onclick=()=>move(1);viewport.onscroll=()=>{offsets.set(sport,viewport.scrollLeft);sync();};viewport.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1);}};
   rail.append(left,viewport,right);host.append(rail);viewport.scrollLeft=offsets.get(sport)||0;sync();if(options.focusId)Array.from(viewport.children).find(c=>c.dataset.gameId===options.focusId)?.focus({preventScroll:true});const observer=new ResizeObserver(sync);observer.observe(viewport);const cleanup=new MutationObserver(()=>{if(!host.isConnected){observer.disconnect();cleanup.disconnect();}});cleanup.observe(document.body,{childList:true,subtree:true});
  }).catch(()=>{if(host.isConnected)host.replaceChildren(node('span','lb-board-note',S.unavailable));});
 }
 return {games,GROUPS,matches,mount};
});
