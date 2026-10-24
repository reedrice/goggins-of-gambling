import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import PJ from '../js/public-json.js';import BP from '../js/bet-progress.js';
const response=data=>({ok:true,json:async()=>structuredClone(data)});
test('concurrent consumers share requests, unchanged revisions survive manifest rechecks, new revisions refresh',async()=>{
 let time=0,revision='one',calls=[];const api=PJ.create({now:()=>time,request:async url=>{calls.push(url);return response(url.startsWith('data/espn/index')?{snapshots:[{file:'data/espn/nba-2026-10-24.json',available:true,fetched_at:revision}]}:{revision});}});
 const path='data/espn/nba-2026-10-24.json';assert.deepEqual(await Promise.all([api.snapshot(path),api.snapshot(path),api.snapshot(path)]),[{revision:'one'},{revision:'one'},{revision:'one'}]);assert.equal(calls.length,2);
 time=31000;await api.snapshot(path);assert.equal(calls.length,3);revision='two';time=62000;assert.equal((await api.snapshot(path)).revision,'two');assert.equal(calls.length,5);
});
test('live cards pick up a changed game revision without refetching unchanged games',async()=>{
 let time=0,revision='one',calls=[];const api=PJ.create({now:()=>time,request:async url=>{calls.push(url);return response(url.startsWith('data/live/index')?{games:[{slug:'nba-away-home',updated:revision}]}:{edges:[revision]});}});
 assert.deepEqual((await api.live('nba-away-home')).edges,['one']);time=31000;await api.live('nba-away-home');assert.equal(calls.length,3);revision='two';time=62000;assert.deepEqual((await api.live('nba-away-home')).edges,['two']);assert.equal(calls.length,5);
});
test('hidden requests pause, resume catches up, 429 Retry-After protects all public endpoints',async()=>{
 let time=0,visible=false,calls=0,limited=true;const api=PJ.create({now:()=>time,visible:()=>visible,request:async()=>{calls++;return limited?{ok:false,status:429,headers:{get:()=> '90'}}:response({ok:true});}});
 await assert.rejects(api.get('data/picks.json'),/hidden/);assert.equal(calls,0);visible=true;await assert.rejects(api.get('data/picks.json'),/429/);time=60000;await assert.rejects(api.get('data/live/index.json'),/cooling/);assert.equal(calls,1);limited=false;time=91000;assert.deepEqual(await api.get('data/picks.json'),{ok:true});assert.equal(calls,2);
 await assert.rejects(api.get('https://api.polymarket.us/v1/portfolio/positions'),/Public JSON/);assert.equal(calls,2);
});
test('failed or malformed responses recover instead of being cached as successful snapshots',async()=>{
 let time=0,calls=0;const api=PJ.create({now:()=>time,request:()=>{calls++;if(calls===1)throw Error('offline');return response({fresh:true});}});
 await assert.rejects(api.get('data/picks.json'),/offline/);time=6000;assert.deepEqual(await api.get('data/picks.json'),{fresh:true});assert.equal(calls,2);
});
test('a new ESPN publication changes the actual progress value and final state',async()=>{
 let time=Date.parse('2026-10-24T01:00:00Z'),score=7,final=false;const path='data/espn/cfb-2026-10-23.json';
 const api=PJ.create({now:()=>time,request:async url=>response(url.startsWith('data/espn/index')?{snapshots:[{file:path,available:true,fetched_at:String(time)}]}:{fetched_at:new Date(time).toISOString(),events:[{date:'2026-10-24T00:00:00Z',status:{period:4,type:{state:final?'post':'in',completed:final}},competitions:[{competitors:[{homeAway:'away',score:String(score),team:{abbreviation:'JMU'}},{homeAway:'home',score:'3',team:{abbreviation:'APP'}}]}]}]})});
 const spec=BP.spec({desc:'Under 49.5',eventSlug:'cfb-jmad-applst-2026-10-23'});let r=BP.snapshotResult(spec,await api.snapshot(path),null,time);assert.equal(r.value,10);assert.equal(r.final,false);
 time+=31000;score=28;final=true;r=BP.snapshotResult(spec,await api.snapshot(path),null,time);assert.equal(r.value,31);assert.equal(r.final,true);
});
test('centralized strings load with a window object and no implicit STR global, as in Node collectors',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../js/strings.js',import.meta.url),'utf8'),context);assert.equal(context.window.STR.liveScoreboard.conferences.top25,'Top 25');
});

test('initial fan-out is bounded and queued requests stop when the tab hides',async()=>{
 let visible=true,calls=0,active=0,max=0;const finish=[];
 const api=PJ.create({visible:()=>visible,request:()=>{calls++;active++;max=Math.max(max,active);return new Promise(resolve=>finish.push(()=>{active--;resolve(response({ok:true}));}));}});
 const jobs=Array.from({length:20},(_,i)=>api.get('data/item-'+i+'.json'));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,6);visible=false;finish.forEach(done=>done());const result=await Promise.allSettled(jobs);assert.equal(max,6);assert.equal(calls,6);assert.equal(result.filter(r=>r.status==='fulfilled').length,6);
});
