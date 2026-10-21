(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ComboSafety=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const event=l=>l.eventSlug||l.event_slug||String(l.marketId||l.market_id||l.slug||'').match(/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}/)?.[0]||'';
 function threshold(l){
  const id=l.marketId||l.market_id||l.slug||'',side=l.market_side||l.side;
  if(!['yes','no'].includes(side))return null;
  // Same player/stat/event/period only; never compare unrelated player totals.
  const prop=/^(astatc-.+-gte)(\d+(?:pt\d+)?)$/.exec(id);
  if(prop)return {family:prop[1],n:Number(prop[2].replace('pt','.')),over:side==='yes',inclusive:true};
  const total=/^(tsc-.+-)(\d+(?:pt\d+)?)$/.exec(id);
  if(total)return {family:total[1],n:Number(total[2].replace('pt','.')),over:side==='yes',inclusive:false};
  return null;
 }
 function check(legs){
  let sameGame=false,unknown=false,conflict=false,duplicate=false;
  if(!Array.isArray(legs)||legs.length<2)return {sameGame,unknown,conflict,duplicate};
  for(let i=0;i<legs.length;i++){
   const a=legs[i],ae=event(a),am=a.marketId||a.market_id||a.slug,as=a.market_side||a.side;
   if(!ae)unknown=true;
   for(const b of legs.slice(i+1)){
    const bm=b.marketId||b.market_id||b.slug,bs=b.market_side||b.side;
    if(am&&am===bm&&['yes','no'].includes(as)&&['yes','no'].includes(bs)){if(as!==bs)conflict=true;else duplicate=true;}
    if(ae&&ae===event(b))sameGame=true;
    const at=threshold(a),bt=threshold(b);
    if(at&&bt&&at.family===bt.family&&at.over!==bt.over){const over=at.over?at:bt,under=at.over?bt:at;if(over.n>=under.n)conflict=true;}
   }
  }
  return {sameGame,unknown,conflict,duplicate};
 }
 function message(legs,S){const r=check(legs);return r.conflict?S.conflict:r.duplicate?S.duplicate:'';}
 return {event,check,message};
});
