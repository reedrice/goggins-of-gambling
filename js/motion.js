/* Presentation only: no requests, polling, persistent storage or probability changes. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.SiteMotion=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const previous=new Map(),seen=new Set(),started=Date.now(),running=new Set();
 const reduced=()=>!root.matchMedia||root.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function remember(key,value){previous.delete(key);previous.set(key,value);if(previous.size>3000)previous.delete(previous.keys().next().value);}
 function animate(el,frames,options={}){
  if(!el?.animate||reduced()||root.document?.visibilityState==='hidden')return null;
  const a=el.animate(frames,{duration:340,easing:'cubic-bezier(.2,.7,.2,1)',...options});running.add(a);
  const clear=()=>running.delete(a);a.addEventListener('finish',clear,{once:true});a.addEventListener('cancel',clear,{once:true});return a;
 }
 function update(key,el,value,kind='flash'){
  if(value===null||value===undefined||value==='')return false;
  const before=previous.get(key);remember(key,value);
  if(before===undefined||before===value)return false;
  animate(el,kind==='width'?[{width:before},{width:value}]:[{backgroundColor:'var(--selection-fill)',opacity:.55},{backgroundColor:'transparent',opacity:1}],{duration:kind==='width'?480:600});return true;
 }
 function card(el,key,firstSeen){
  update('odds:'+key,el.querySelector('.lb-odds'),el.querySelector('.lb-odds')?.textContent);
  const known=seen.has(key);seen.add(key);if(seen.size>3000)seen.delete(seen.values().next().value);
  if(!known&&Date.parse(firstSeen)>started)animate(el,[{opacity:0},{opacity:1}],{duration:260});
 }
 function progress(host){
  const key=host.closest('[data-motion-key]')?.dataset.motionKey||host.dataset.bp;
  if(!key)return;
  const score=host.querySelector('.bp-scoreline b');if(score)update('score:'+key,score,score.textContent);
  const fill=host.querySelector('.bp-fill');if(fill)update('progress:'+key,fill,fill.style.width,'width');
 }
 function scoreboard(host){
  host.querySelectorAll('.lb-board-game').forEach(game=>game.querySelectorAll('.lb-board-score').forEach((el,i)=>update('board:'+game.dataset.gameId+':'+i,el,el.textContent)));
 }
 // Native summary clicks include Enter/Space keyboard activation. No focus changes.
 const detailsAnimations=new WeakMap();
 root.document?.addEventListener('click',e=>{
  const control=e.target.closest?.('.slate-pill,.view-toggle button');
  if(control){const selected=control.matches('.slate-pill')?control:root.document.querySelector('.view-toggle button.on');animate(selected,[{opacity:.65},{opacity:1}],{duration:180});}
  const summary=e.target.closest?.('.lb-card-details > summary');if(!summary||e.button>0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||reduced())return;
  const details=summary.parentElement,card=details.closest('.lb-edge');if(!card?.animate)return;
  e.preventDefault();const old=detailsAnimations.get(details),opening=old?!old.opening:!details.open;
  const from=card.getBoundingClientRect().height;old?.animation.cancel();
  details.open=opening;const to=card.getBoundingClientRect().height;
  // Keep closing content available while its container shrinks.
  if(!opening)details.open=true;
  const animation=animate(card,[{height:from+'px',overflow:'hidden'},{height:to+'px',overflow:'hidden'}],{duration:240});
  if(!animation){details.open=opening;return;}
  detailsAnimations.set(details,{animation,opening});
  animation.addEventListener('finish',()=>{details.open=opening;detailsAnimations.delete(details);},{once:true});
 });
 const preference=root.matchMedia?.('(prefers-reduced-motion: reduce)');
 preference?.addEventListener?.('change',e=>{if(e.matches)for(const a of [...running])a.finish();});
 return {update,card,progress,scoreboard,reduced};
});
