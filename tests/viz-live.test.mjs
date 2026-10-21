import test from 'node:test';import assert from 'node:assert/strict';
import V from '../js/viz.js';
test('an event failure does not block new prices while the chart remains open; closing aborts and stops polling',async()=>{
 const previous={fetch:globalThis.fetch,document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const scheduled=[],seen=[],listeners=new Map();let signal;
 try{
  globalThis.document={visibilityState:'visible',addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
  globalThis.setTimeout=(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;};globalThis.clearTimeout=()=>{};
  let price=.45;
  globalThis.fetch=async(url,options)=>{signal=options.signal;if(url.includes('/events/'))throw Error('temporary event failure');return {ok:true,json:async()=>({marketData:{marketSlug:'test',longQuote:{value:String(price)}}})};};
  const status={textContent:''},stop=V.startLive([{slug:'event',fn:()=>{}}],[{slug:()=> 'test',fromBbo:d=>{seen.push(+d.longQuote.value);return true;}}],status);
  await new Promise(setImmediate);assert.deepEqual(seen,[.45]);assert.match(status.textContent,/Live from Polymarket/);
  price=.52;await scheduled[0].fn();assert.deepEqual(seen,[.45,.52]);assert.equal(scheduled.length,2);
  stop();assert.equal(signal.aborted,true);assert.equal(listeners.size,0);await scheduled[1].fn();assert.equal(seen.length,2);
 }finally{Object.assign(globalThis,previous);}
});
