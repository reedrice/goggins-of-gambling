import test from 'node:test';import assert from 'node:assert/strict';import LB from '../js/live-bets.js';
test('automatic refresh resumes on focus, visibility and network, avoiding overlap and cleaning detached roots',()=>{
 const old={document:globalThis.document,window:globalThis.window,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 const events=new Map();let tick,calls=0,busy=false,cleared=false;
 const surface={addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
 try{
  globalThis.document={...surface,visibilityState:'visible'};globalThis.window=surface;
  globalThis.setInterval=(fn,ms)=>{tick=fn;assert.equal(ms,30000);return 1;};globalThis.clearInterval=()=>{cleared=true;};
  const root={isConnected:true,getClientRects:()=>[{}]},stop=LB.autoRefresh(root,()=>calls++,()=>busy);
  tick();assert.equal(calls,1);busy=true;events.get('focus')();assert.equal(calls,1);busy=false;
  document.visibilityState='hidden';tick();assert.equal(calls,1);document.visibilityState='visible';events.get('visibilitychange')();events.get('online')();assert.equal(calls,3);
  root.isConnected=false;tick();assert.equal(calls,3);assert.equal(events.size,0);assert.equal(cleared,true);stop();
 }finally{Object.assign(globalThis,old);}
});
