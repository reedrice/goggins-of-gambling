/* Public versioned ESPN snapshots only. No betting advice, keys, AI or new ingestion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.DailySlate=api;api.mount(document.getElementById('daily-slate'));if(root.PicksScores)root.PicksScores.mount(document.getElementById('picks-score-ticker'));}})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const GROUPS=[['nba',['nba'],'🏀'],['nhl',['nhl'],'🏒'],['tennis',['atp','wta'],''],['nfl',['nfl'],'🏈'],['cfb',['cfb'],'🏈'],['wnba',['wnba'],'🏀'],['cbb',['cbb'],'🏀'],['wcbb',['wcbb'],'🏀'],['mlb',['mlb'],'⚾'],['soccer',['epl','bun','eflch','fl1','lal','lmx','mls','sea','ucl','uecl','uel'],'⚽'],['golf',['pga','lpga','dpwt'],'⛳']];
 const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
 const sportFor=key=>({nba:'NBA',nhl:'NHL',tennis:'Tennis',atp:'Tennis',wta:'Tennis',nfl:'NFL',cfb:'NCAAF',wnba:'WNBA',cbb:'NCAAB',wcbb:'WNCAAB',mlb:'MLB',soccer:'Soccer',golf:'Golf'})[key]||'';
 function activeEvents(docs,leagues,now=Date.now()){
  const seen=new Set(),today=day(now);
  for(const doc of docs.filter(d=>leagues.includes(d.league)))for(const e of doc.events||[])for(const c of e.competitions?.length?e.competitions:[e]){
   const type=(c.status||e.status)?.type,at=Date.parse(c.date||e.date),id=c.id||e.id;
   if(!id||!Number.isFinite(at)||!type||type.completed||type.state==='post'||!/^(pre|in)$/.test(type.state)||/cancel|postpon|suspend/i.test(type.name||''))continue;
   const ongoingGolf=['pga','lpga','dpwt'].includes(doc.league)&&type.state==='in'&&at<=now;
   if(day(at)===today||ongoingGolf)seen.add(doc.league+':'+id);
  }
  return seen.size;
 }
 function mount(root){
  if(!root)return;
  const S=window.STR.slate,title=document.createElement('div'),row=document.createElement('div'),status=document.createElement('span');
  title.className='slate-heading';title.textContent=S.title;row.className='slate-row';row.tabIndex=0;row.setAttribute('aria-label',S.title);status.className='slate-status';status.setAttribute('role','status');root.append(title,row,status);
  let loading=false;
  let selected='';
  const sync=()=>row.querySelectorAll('button').forEach(b=>{const on=b.dataset.sport===selected;b.setAttribute('aria-pressed',String(on));b.classList.toggle('slate-selected',on);});
  const button=sport=>{const b=document.createElement('button');b.type='button';b.dataset.sport=sport;b.onclick=()=>{selected=sport;sync();window.dispatchEvent(new CustomEvent('slate:select',{detail:{sport}}));};return b;};
  window.addEventListener('picks:sport-change',e=>{selected=e.detail.sport;sync();});
  const read=async path=>{const r=await fetch(path+'?slate='+Math.floor(Date.now()/300000),{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
  async function refresh(){
   if(loading||document.visibilityState==='hidden')return;loading=true;
   try{
    const index=await read('data/espn/index.json');if(!Array.isArray(index.snapshots))throw Error('index');
    const entries=index.snapshots.filter(s=>typeof s.file==='string'&&/^data\/espn\/[a-z0-9-]+\.json$/.test(s.file));
    const results=await Promise.all(entries.map(async s=>{try{if(!s.available)throw Error('unavailable');const d=await read(s.file);if(d.league!==s.league||!Array.isArray(d.events))throw Error('shape');return d;}catch{return null;}}));
    const docs=results.filter(Boolean);let incomplete=false;
    const all=button('');all.className='slate-pill';all.textContent=window.STR.picks.allSports;
    row.replaceChildren(all,...GROUPS.map(([key,leagues,icon])=>{
     const relevant=entries.map((s,i)=>({s,d:results[i]})).filter(x=>leagues.includes(x.s.league));
     const complete=leagues.every(l=>relevant.some(x=>x.s.league===l))&&relevant.every(x=>x.d&&Date.now()-Date.parse(x.d.fetched_at)<30*60000);
     const count=activeEvents(docs,leagues);incomplete=incomplete||!complete;if(!count)return null;
     const pill=button(sportFor(key));pill.className='slate-pill';
     const label=S.names[key],kind=key==='tennis'?'matches':key==='golf'?'events':'games',unit=(count===1?S.singular:S.units)[kind];
     pill.textContent=`${icon?icon+' ':''}${label} (${complete?count:count+'+'} ${unit})`;
     if(key==='tennis'){const ball=document.createElement('span');ball.className='slate-tennis-ball';ball.setAttribute('aria-hidden','true');pill.prepend(ball);}
     pill.title=complete?S.detail:S.partial;incomplete=incomplete||!complete;return pill;
    }).filter(Boolean));
    sync();
    status.textContent=incomplete?S.partial:'';
   }catch{status.textContent=S.unavailable;if(!row.children.length)row.textContent=S.loadingFailed;}
   finally{loading=false;}
  }
  refresh();setInterval(refresh,300000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
 }
 return {GROUPS,sportFor,day,activeEvents,mount};
});
