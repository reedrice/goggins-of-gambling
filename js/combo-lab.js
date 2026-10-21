(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ComboLab=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const day=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
 function eligibleEvent(ev,now=Date.now()){return ev && ev.teams?.length===2 && Number.isFinite(Date.parse(ev.start_time)) && day(Date.parse(ev.start_time))===day(now) && !ev.finished;}
 function candidates(ev,mode='mixed'){
  const out=[];
  for(const m of ev.markets||[]){
   const prop=m.type==='prop';
   if(!['moneyline','spread','total','prop'].includes(m.type)|| (mode==='lines'&&prop)||(mode==='props'&&!prop))continue;
   if(prop&&(!m.player||!m.team||!ev.teams.some(t=>String(t.abbr).toLowerCase()===String(m.team).toLowerCase())))continue;
   if(!Number.isFinite(m.yes_ask)||!Number.isFinite(m.yes_bid)||m.yes_ask<m.yes_bid||m.yes_ask-m.yes_bid>6)continue;
   for(const side of ['yes','no']){
    const price=side==='yes'?m.yes_ask:m.no_cost;
    if(m[side+'_buyable']===false||!Number.isFinite(price)||price<17||price>55)continue;
    out.push({ev,m,side,price,prop});
   }
  }
  return out;
 }
 function choose(events,{count=4,mode='mixed',now=Date.now(),random=Math.random}={}){
  if(![3,4,5,6].includes(count)||!['mixed','lines','props'].includes(mode))throw Error('Invalid combo options');
  const groups=events.filter(e=>eligibleEvent(e,now)).map(ev=>candidates(ev,mode)).filter(g=>g.length);
  for(let i=groups.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[groups[i],groups[j]]=[groups[j],groups[i]];}
  const selected=[],used=new Set();
  for(const rows of groups){
   if(selected.length===count)break;
   if(used.has(rows[0].ev.slug))continue;
   const desired=mode==='mixed' ? rows.filter(x=>x.prop===(selected.length%2===1)) : rows;
   const pool=desired.length?desired:rows;
   selected.push(pool[Math.floor(random()*pool.length)]);used.add(rows[0].ev.slug);
  }
  return selected.length===count?selected:[];
 }
 const multiplier=legs=>legs.reduce((p,x)=>p*100/x.price,1);
 function mount(container,{onUse}){
  const W=window,S=W.STR.comboLab;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const panel=el('details'),summary=el('summary',S.title);panel.className='card';panel.append(summary);container.append(panel);
  const controls=el('div');controls.className='row';
  const count=el('select');count.setAttribute('aria-label',S.legs);for(const n of [3,4,5,6]){const o=el('option',S.legCount(n));o.value=n;o.selected=n===4;count.append(o);}
  const mode=el('select');mode.setAttribute('aria-label',S.markets);for(const k of ['mixed','lines','props']){const o=el('option',S[k]);o.value=k;mode.append(o);}
  const generate=el('button',S.generate);generate.type='button';generate.className='btn btn-primary';controls.append(count,mode,generate);panel.append(controls);
  const status=el('p'),output=el('div');status.setAttribute('role','status');panel.append(status,output,el('p',S.note));
  let serial=0;
  const json=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Unavailable');return r.json();};
  generate.onclick=async()=>{
   const run=++serial;generate.disabled=true;output.replaceChildren();status.textContent=S.loading;
   const wanted=Number(count.value),kind=mode.value;
   try{
    const ix=await json('data/markets/index.json?t='+Date.now());
    const live=await json('data/live/index.json?t='+Date.now());
    const final=new Set(live.games.filter(g=>g.status==='final').map(g=>g.slug));
    const now=Date.now();const targets=ix.events.filter(e=>eligibleEvent(e,now)&&!final.has(e.slug));
    let failed=0;const events=[];let next=0;
    await Promise.all(Array.from({length:Math.min(4,targets.length)},async()=>{while(next<targets.length){const target=targets[next++];try{
     const payload=await json(W.MarketsCore.GATEWAY+'/v1/events/slug/'+encodeURIComponent(target.slug));const raw=payload.event;
     if(!raw||raw.closed||raw.ended||raw.active===false||raw.gameStatus==='finished')continue;
     const ev=W.MarketsCore.compactEvent(raw);ev.liveAt=new Date().toISOString();events.push(ev);
    }catch(e){failed++;}}}));
    if(run!==serial||!container.isConnected)return;
    const picks=choose(events,{count:wanted,mode:kind,now});
    if(!picks.length){status.textContent=S.insufficient(wanted,failed);return;}
    const stamp=picks.map(p=>p.ev.liveAt).sort()[0];
    const legs=picks.map(p=>W.Picker.makeLeg(p.ev,p.m,p.side,p.ev.liveAt,true));
    const list=el('ol');picks.forEach((p,i)=>{const li=el('li');const game=p.ev.title||p.ev.slug;const odds=p.price>=50?'-'+Math.round(p.price/(100-p.price)*100):'+'+Math.round((100-p.price)/p.price*100);li.append(el('strong',legs[i].desc),el('div',game+' | '+odds));if(W.Viz){const b=el('button',S.chart);b.type='button';b.className='btn btn-sm';b.onclick=()=>W.Viz.open({title:legs[i].desc,sub:game,legs:[{text:legs[i].desc,eventSlug:p.ev.slug,marketSlug:p.m.id,side:p.side==='no'?1:0}]});li.append(b);}list.append(li);});output.append(list);
    const multiple=multiplier(picks);output.append(el('p',S.price('+'+Math.round((multiple-1)*100).toLocaleString('en-US'),Math.floor(multiple*10))));
    const use=el('button',S.use);use.type='button';use.className='btn';use.onclick=()=>{
     if(Date.now()-Date.parse(stamp)>120000){status.textContent=S.expired;return;}
     if(onUse(legs.map(l=>({...l})))!==false)use.disabled=true;
    };output.append(use);status.textContent=S.checked(new Date(stamp).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}),failed);
   }catch(e){if(run===serial)status.textContent=S.failed;}finally{if(run===serial)generate.disabled=false;}
  };
 }
 return {day,eligibleEvent,candidates,choose,multiplier,mount};
});
