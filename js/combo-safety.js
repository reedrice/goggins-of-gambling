(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ComboSafety=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const event=l=>l.eventSlug||l.event_slug||String(l.marketId||l.market_id||l.slug||'').match(/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}/)?.[0]||'';
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
   }
  }
  return {sameGame,unknown,conflict,duplicate};
 }
 function message(legs,S){const r=check(legs);return r.conflict?S.conflict:r.duplicate?S.duplicate:r.sameGame?S.sameGame:r.unknown?S.unknown:'';}
 return {event,check,message};
});
