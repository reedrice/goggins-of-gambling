import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import LB from '../js/live-bets.js';import BP from '../js/bet-progress.js';import B from '../js/live-scoreboard.js';
const now=Date.parse('2026-10-24T20:00:00Z'),at=new Date(now).toISOString();
const events=Array.from({length:64},(_,i)=>{const status={period:2,displayClock:'5:00',type:{state:'in',completed:false,detail:'5:00 - 2nd Quarter'}};return {id:String(i),date:'2026-10-24T18:00:00Z',status,competitions:[{status,competitors:[{homeAway:'away',score:'14',team:{abbreviation:'A'+i,name:'Away '+i}},{homeAway:'home',score:'7',team:{abbreviation:'H'+i,name:'Home '+i}}]}]};});
const feeds=events.map((e,i)=>({slug:`cfb-a${i}-h${i}-2026-10-24`,game:'Away vs Home '+i,url:'https://example.com',status:'live',updated:at,start_time:e.date,game_context:{available:true,event_id:e.id,game_state:'in',away:{},home:{}},open:[],edges:Array.from({length:32},(_,j)=>({key:i+':'+j,group:j%2?'game':'prop',class:'edge',tier:j%3?'big':'slight',status:'open',edge:8,now_chance:50,now_odds:'+100',market:'Total',side:'Over 40.5',first_seen:at}))}));
test('Saturday: 64 games, 2048 markets remain accessible with at most six cards per category/page',()=>{
 const data=LB.combineGames(feeds);assert.equal(data.game_count,64);assert.equal(data.edges.length,2048);
 const groups=LB.groupEdges(data.edges);for(const type of ['game','prop']){const all=[...groups[type].shown,...groups[type].more],seen=[];for(let offset=0;offset<all.length;offset+=6){const p=LB.page(all,offset);assert.ok(p.items.length<=6);seen.push(...p.items.map(e=>e.key));}assert.equal(seen.length,1024);assert.equal(new Set(seen).size,1024);}
 assert.equal(B.games([{league:'cfb',events}],'ncaaf',now).length,64);
 for(let i=0;i<64;i++){assert.ok(B.matches(feeds[i],'cfb:'+i));assert.equal(LB.combineGames([feeds[i]]).edges.length,32);}
 assert.equal(LB.combineGames(feeds.map(d=>({...d,status:'final'}))).edges.length,0);
 assert.equal(LB.page([1,2],900).start,0);assert.deepEqual(LB.page([],900).items,[]);
});
test('crowded shared snapshot: all 64 games update totals, finals and stale states correctly',()=>{
 const board={fetched_at:at,events};for(let i=0;i<64;i++){
 const spec=BP.spec({desc:'Over 40.5',eventSlug:feeds[i].slug});let r=BP.snapshotResult(spec,board,null,now);assert.equal(r.value,21);assert.equal(r.target,40.5);
 const changed=structuredClone(board);changed.events[i].competitions[0].competitors[0].score='35';r=BP.snapshotResult(spec,changed,null,now);assert.equal(r.value,42);
 changed.events[i].status={...changed.events[i].status,type:{state:'post',completed:true,detail:'Final'}};changed.events[i].competitions[0].status=changed.events[i].status;r=BP.snapshotResult(spec,changed,null,now);assert.equal(r.final,true);assert.equal(r.value,42);
 assert.equal(BP.snapshotResult(spec,{...board,fetched_at:new Date(now-660000).toISOString()},null,now).reason,'stale');
 }
});
test('2000 account/log progress hosts: only near cards tick, scrolling rechecks, detached hosts are released',()=>{
 let callback;const observed=new Set(),calls=[];const queue=BP.viewportQueue(cb=>{callback=cb;return {observe:h=>observed.add(h),unobserve:h=>observed.delete(h)};},h=>calls.push(h));
 const hosts=Array.from({length:2000},(_,i)=>({i}));queue.sync(hosts);assert.equal(observed.size,2000);assert.equal(calls.length,0);
 callback(hosts.slice(0,6).map(target=>({target,isIntersecting:true})));calls.length=0;queue.run();assert.equal(calls.length,6);
 callback(hosts.slice(0,6).map(target=>({target,isIntersecting:false})));callback([{target:hosts[1000],isIntersecting:true}]);calls.length=0;queue.run();assert.deepEqual(calls,[hosts[1000]]);
 queue.sync([]);assert.equal(observed.size,0);calls.length=0;queue.run();assert.equal(calls.length,0);
});
test('full 12000-row record: closed log has no cards; all pages bounded; settled rows have no live hydration',()=>{
 const src=fs.readFileSync('js/app.js','utf8'),start=src.indexOf('  function liveRecordHtml('),end=src.indexOf('  // ---------------------------------------------------------------- settings',start);
 const context={window:{LiveBets:LB,BetProgress:{html:()=>'<div class="bp-host"></div>',spec:x=>x}},liveRecordOffset:0,liveRecordExpanded:new Set(),STR:{},safeUrl:()=>null,esc:String,tip:()=>'',sign:()=>''};context.self=context;vm.createContext(context);vm.runInContext(fs.readFileSync('js/strings.js','utf8'),context);vm.runInContext(src.slice(start,end)+';this.renderLog=liveRecordHtml;',context);context.STR=context.window.STR;
 const entries=Array.from({length:12000},(_,i)=>({id:String(i),at:String(i).padStart(6,'0'),result:i%2?'pending':'win',side_index:0}));const rec={entries,totals:{all:{n:12000,pending:6000}}};
 assert.ok(!context.renderLog(rec).includes('data-live-alert='));
 for(const offset of [0,6,6000,11994]){context.liveRecordOffset=offset;const html=context.renderLog(rec,true);assert.equal((html.match(/data-live-alert=/g)||[]).length,6);assert.equal((html.match(/class="bp-host"/g)||[]).length,3);}
});

