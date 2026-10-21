import test from 'node:test';import assert from 'node:assert/strict';import {needsTick} from '../scripts/live-tick.mjs';
test('rescheduling outside discovery window still refreshes the old published schedule',()=>{
 const now=Date.parse('2026-10-21T10:34:00Z');
 const published={status:'pregame',start_time:'2026-10-22T09:30:00Z'};
 const discovery={start:'2026-10-23T11:30:00Z'};
 assert.equal(needsTick(discovery,published,now),true);
 assert.equal(needsTick(discovery,{...published,start_time:discovery.start},now),false);
 assert.equal(needsTick(discovery,{...published,status:'final'},now),false);
});
