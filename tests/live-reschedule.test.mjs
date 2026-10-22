import test from 'node:test';import assert from 'node:assert/strict';import {needsTick} from '../scripts/live-tick.mjs';
import {buildLive} from '../scripts/live-watch.mjs';
test('rescheduling outside discovery window still refreshes the old published schedule',()=>{
 const now=Date.parse('2026-10-21T10:34:00Z');
 const published={status:'pregame',start_time:'2026-10-22T09:30:00Z'};
 const discovery={start:'2026-10-23T11:30:00Z'};
 assert.equal(needsTick(discovery,published,now),true);
 assert.equal(needsTick(discovery,{...published,start_time:discovery.start},now),false);
 assert.equal(needsTick(discovery,{...published,status:'final'},now),false);
});
test('publication reconciles schedule without moving opening price baseline',()=>{
 const open={slug:'test',title:'Test',start_time:'2026-10-20T09:30:00Z',taken_at:'2026-10-19T00:00:00Z',markets:[]};
 const event={startDate:'2026-10-23T11:30:00Z',markets:[{id:'test',active:true}]};
 const published=buildLive(open,event,null,'2026-10-21T10:34:00Z');
 assert.equal(published.start_time,event.startDate);
 assert.equal(published.status,'pregame');
 assert.equal(published.open_taken_at,open.taken_at);
 assert.equal(open.start_time,'2026-10-20T09:30:00Z');
 assert.equal(buildLive(open,{...event,startDate:'invalid'},null,'2026-10-21T10:34:00Z').start_time,open.start_time);
});

test('exchange-open games recover from stale finals without reopening verified finished games',()=>{
 const now=Date.parse('2026-10-22T16:00:00Z'),game={start:'2026-10-23T01:30:00Z',open:true},saved={status:'final',start_time:game.start,game_context:{game_state:'pre'}};
 assert.equal(needsTick(game,saved,now),true);
 assert.equal(needsTick({...game,open:false},saved,now),false);
 assert.equal(needsTick({...game,open:undefined},saved,now),false);
 assert.equal(needsTick(game,{...saved,game_context:{game_state:'post'}},now),false);
 assert.equal(needsTick({...game,start:'2026-10-26T01:30:00Z'},saved,now),false);
});
