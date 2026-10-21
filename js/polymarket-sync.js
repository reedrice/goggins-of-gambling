// Private browser-only portfolio reader. No trade/order endpoints, telemetry or shared writes.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PolymarketSync=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const PATHS=new Set(['/v1/portfolio/positions','/v1/portfolio/activities']);
 const enc=new TextEncoder(),dec=new TextDecoder();
 const b64=buffer=>{const value=new Uint8Array(buffer);let text='';for(let i=0;i<value.length;i+=32768)text+=String.fromCharCode(...value.subarray(i,i+32768));return btoa(text);};
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const number=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
 const usd=value=>value?.currency==='USD'?number(value.value):null;
 function validate(c){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c?.keyId||''))throw Error('keys');
  let seed;try{seed=bytes(c.secretKey);}catch(e){throw Error('keys');}
  if(![32,64].includes(seed.length))throw Error('keys');return c;
 }
 async function passwordKey(password,salt,iterations=310000){
  if(typeof password!=='string'||password.length<12)throw Error('password');
  if(iterations!==310000)throw Error('vault');
  const base=await root.crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return root.crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function seal(value,key,salt){const iv=root.crypto.getRandomValues(new Uint8Array(12));return {version:1,iterations:310000,salt:b64(salt),iv:b64(iv),data:b64(await root.crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value))))};}
 async function unlock(vault,password){
  if(vault?.version!==1)throw Error('vault');const salt=bytes(vault.salt),key=await passwordKey(password,salt,vault.iterations);
  let value;try{value=JSON.parse(dec.decode(await root.crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(vault.iv)},key,bytes(vault.data))));}catch(e){throw Error('unlock');}
  validate(value.credentials);return {value,key,salt};
 }
 async function headers(c,path,now=Date.now()){
  if(!PATHS.has(path))throw Error('endpoint');validate(c);
  const seed=bytes(c.secretKey).slice(0,32),prefix=Uint8Array.from([48,46,2,1,0,48,5,6,3,43,101,112,4,34,4,32]);
  const der=new Uint8Array(48);der.set(prefix);der.set(seed,16);
  const key=await root.crypto.subtle.importKey('pkcs8',der,'Ed25519',false,['sign']);
  return {'X-PM-Access-Key':c.keyId,'X-PM-Timestamp':String(now),'X-PM-Signature':b64(await root.crypto.subtle.sign('Ed25519',key,enc.encode(String(now)+'GET'+path)))};
 }
 async function pages(c,path,request=root.fetch.bind(root)){
  if(!PATHS.has(path))throw Error('endpoint');let cursor='',seen=new Set(),positions={},activities=[];
  for(let i=0;i<100;i++){
   const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
   const r=await request('https://api.polymarket.us'+path+'?'+query,{method:'GET',headers:await headers(c,path),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error(r.status===401||r.status===403?'auth':r.status===429?'rate':'network');
   const d=await r.json();if(path.endsWith('positions')){if(!d.positions||typeof d.positions!=='object'||Array.isArray(d.positions))throw Error('schema');Object.assign(positions,d.positions);}else{if(!Array.isArray(d.activities))throw Error('schema');activities.push(...d.activities);}
   if(d.eof||!d.nextCursor)return path.endsWith('positions')?positions:activities;
   if(seen.has(d.nextCursor))throw Error('pagination');seen.add(d.nextCursor);cursor=d.nextCursor;
  }throw Error('pagination');
 }
 const quantity=p=>number(p.netPositionDecimal??p.netPosition);
 function rows(positions){return Object.entries(positions||{}).map(([slug,p])=>({slug,...p,quantity:quantity(p)})).filter(p=>p.quantity!==null);}
 function settlements(activities){
  const unique=new Map();for(const a of activities||[]){const r=a.positionResolution;if(a.type!=='ACTIVITY_TYPE_POSITION_RESOLUTION'||!r?.marketSlug)continue;
   const id=r.tradeId||r.marketSlug+':'+(r.updateTime||r.afterPosition?.updateTime||'');unique.set(id,r);
  }return [...unique.values()];
 }
 function stats(snapshot){
  const resolutions=settlements(snapshot.activities),result={wins:0,losses:0,even:0,unclassified:0,won:0,lost:0,realized:0,spent:null,returned:null};
  for(const r of resolutions){const before=usd(r.beforePosition?.realized),after=usd(r.afterPosition?.realized);if(before===null||after===null){result.unclassified++;continue;}const delta=after-before;result.realized+=delta;if(delta>0){result.wins++;result.won+=delta;}else if(delta<0){result.losses++;result.lost-=delta;}else result.even++;}
  // Do not infer buy/sell direction from quantities: the documented activity shape
  // doesn't guarantee a direction field. Turnover is not money spent.
  const trades=[...new Map((snapshot.activities||[]).filter(a=>a.trade?.id).map(a=>[a.trade.id,a.trade])).values()];
  const confirmed=trades.filter(t=>t.state==='TRADE_STATE_CONFIRMED');
  if(confirmed.length&&confirmed.every(t=>/^ORDER_INTENT_(BUY|SELL)_(LONG|SHORT)$/.test(t.intent||'')&&usd(t.costBasis)!==null)){
   result.spent=confirmed.filter(t=>t.intent.startsWith('ORDER_INTENT_BUY')).reduce((n,t)=>n+Math.abs(usd(t.costBasis)),0);
   result.returned=confirmed.filter(t=>t.intent.startsWith('ORDER_INTENT_SELL')).reduce((n,t)=>n+Math.abs(usd(t.costBasis)),0);
  }
  if(result.unclassified){result.won=null;result.lost=null;result.realized=null;}
  result.open=rows(snapshot.positions).filter(p=>!p.expired&&p.quantity!==0).length;return result;
 }
 function progressSpecs(p){
  const meta=p.marketMetadata||{}, legs=p.comboLegDetails?.length?p.comboLegDetails:[{...meta,slug:p.slug,outcomeSide:p.quantity<0?'NO':'YES'}];
  return legs.map(l=>{const side=/(?:SHORT|NO)$/.test(String(l.outcomeSide))?'no':/(?:LONG|YES)$/.test(String(l.outcomeSide))?'yes':null;
   const label=l.outcome&&!/^(yes|no)$/i.test(l.outcome)?l.outcome:l.title||l.slug;
   return {desc:label||p.slug,question:l.title||'',market_id:l.slug,eventSlug:l.eventSlug||'',market_side:side||'',unsupported:!side};
  });
 }
 function activityLabel(slug,positions,S){
  const p=positions?.[slug];const title=p?.marketMetadata?.title;
  if(title&&title!==slug)return title;
  return String(slug||'').startsWith('crossd-')?S.combo:S.bet;
 }
 let current=null,key=null,salt=null,timer=null,host=null,busy=false,epoch=0,message='',activityOpen=false;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const money=value=>value===null?root.STR.pmSync.unknown:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 function lock(){epoch++;current=null;key=null;salt=null;busy=false;clearTimeout(timer);message='';paint();}
 async function persist(){const vault=await seal(current,key,salt);try{root.Store.setPolymarketVault(vault);}catch(e){throw Error('storage');}}
 async function sync(){
  if(busy||!current||!host?.isConnected||host.closest('[hidden]')||document.hidden)return;const run=epoch;busy=true;message='';paint();
  try{const c=current.credentials;const [positions,activities]=await Promise.all([pages(c,'/v1/portfolio/positions'),pages(c,'/v1/portfolio/activities')]);if(run!==epoch)return;
   current={credentials:c,snapshot:{positions,activities,historyComplete:true,checked_at:new Date().toISOString()}};await persist();
  }catch(e){if(run===epoch)message=root.STR.pmSync.errors[e.message]||root.STR.pmSync.errors.network;}finally{if(run===epoch){busy=false;paint();clearTimeout(timer);timer=setTimeout(sync,30000);}}
 }
 function input(label,type='text'){const wrap=node('label',label),field=node('input');field.type=type;field.required=true;field.autocomplete=type==='password'?'new-password':'off';field.spellcheck=false;wrap.append(field);return {wrap,field};}
 function paint(){
  if(!host?.isConnected)return;const S=root.STR.pmSync;host.replaceChildren();host.className='card pm-sync';host.append(node('h3',S.title));
  const status=node('p',message|| (busy?S.syncing:current?.snapshot?S.checked(new Date(current.snapshot.checked_at).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'})):S.private),'muted small');status.setAttribute('role','status');host.append(status);
  if(!current){
   const vault=root.Store.getPolymarketVault(),form=node('form'),password=input(S.password,'password');password.field.minLength=12;
   let id,secret;if(!vault){id=input(S.keyId);secret=input(S.secret,'password');secret.field.autocomplete='off';form.append(id.wrap,secret.wrap);}
   form.append(password.wrap);const submit=node('button',vault?S.unlock:S.connect,'btn btn-primary');submit.type='submit';form.append(submit);host.append(form,node('p',vault?S.unlockNote:S.setupNote,'muted small'));
   form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;status.textContent=S.connecting;const run=++epoch;
    try{if(vault){const opened=await unlock(vault,password.field.value);if(run!==epoch)return;current=opened.value;key=opened.key;salt=opened.salt;}else{
      const c=validate({keyId:id.field.value.trim(),secretKey:secret.field.value.trim()});const positions=await pages(c,'/v1/portfolio/positions');
      salt=root.crypto.getRandomValues(new Uint8Array(16));key=await passwordKey(password.field.value,salt);current={credentials:c,snapshot:{positions,activities:[],checked_at:new Date().toISOString()}};
      await persist();
     }form.reset();paint();sync();
    }catch(e){current=null;key=null;salt=null;status.textContent=S.errors[e.message]||S.errors.unlock;submit.disabled=false;}
   };return;
  }
  const actions=node('div',undefined,'row');const refresh=node('button',S.refresh,'btn btn-sm');refresh.type='button';refresh.disabled=busy;refresh.onclick=sync;
  const locking=node('button',S.lock,'btn btn-sm');locking.type='button';locking.onclick=lock;const disconnect=node('button',S.disconnect,'btn btn-sm');disconnect.type='button';disconnect.onclick=()=>{if(root.confirm(S.disconnectConfirm)){root.Store.setPolymarketVault(null);lock();}};actions.append(refresh,locking,disconnect);host.append(actions);
  const snapshot=current.snapshot;if(!snapshot)return;const totals=stats(snapshot),grid=node('div',undefined,'kpis');
  for(const [label,value] of [[S.spent,money(totals.spent)],[S.returned,money(totals.returned)],[S.won,money(totals.won)],[S.lost,money(totals.lost)],[S.net,money(totals.realized)],[S.record,snapshot.historyComplete?totals.wins+'–'+totals.losses+'–'+totals.even:S.unknown]]){const cell=node('div',undefined,'kpi');cell.append(node('div',label,'k'),node('div',snapshot.historyComplete?value:S.unknown,'v'));grid.append(cell);}host.append(grid,node('p',S.metricNote,'muted small'));
  if(totals.spent===null)host.append(node('p',S.spendingUnavailable,'muted small'));
  if(totals.unclassified)host.append(node('p',S.unclassified(totals.unclassified),'muted small'));
  const positions=rows(snapshot.positions).filter(p=>p.quantity!==0&&!p.expired);host.append(node('h3',S.positions(positions.length)));
  if(!positions.length)host.append(node('p',S.noPositions,'muted'));
  for(const p of positions){const card=node('div',undefined,'card');const title=p.comboLegDetails?.length?S.comboTitle(p.comboLegDetails.length):activityLabel(p.slug,snapshot.positions,S);card.append(node('strong',title),node('p',S.positionInfo(p.quantity,money(usd(p.cost)),money(usd(p.cashValue))),'muted small'));
   for(const spec of progressSpecs(p)){card.append(node('div',spec.desc));if(root.BetProgress&&!spec.unsupported){const box=node('div','', 'bp-host');box.dataset.bp=JSON.stringify(root.BetProgress.spec(spec));card.append(box);}else card.append(node('p',S.progressUnavailable,'muted small'));}host.append(card);
  }
  const activity=node('details');activity.open=activityOpen;activity.ontoggle=()=>{activityOpen=activity.open;};activity.append(node('summary',S.activity));const list=node('ul');const recent=(snapshot.activities||[]).filter(a=>a.trade||a.positionResolution).slice(0,20);
  recent.forEach(a=>{const t=a.trade,r=a.positionResolution;const label=activityLabel((t||r).marketSlug,snapshot.positions,S);list.append(node('li',t?S.trade(label):S.settlement(label)));});if(!recent.length)list.append(node('li',S.noActivity));activity.append(list);host.append(activity,node('p',S.pollNote,'muted small'));
 }
 function mount(element){host=element;clearTimeout(timer);paint();if(current)sync();}
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden&&current){clearTimeout(timer);sync();}});
 return {mount,lock,headers,passwordKey,seal,unlock,pages,rows,stats,progressSpecs,activityLabel,validate};
});
