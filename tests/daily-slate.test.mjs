import test from 'node:test';import assert from 'node:assert/strict';import Slate from '../js/daily-slate.js';
const now=Date.parse('2026-10-21T12:00:00Z');
const event=(id,date,state='pre',name='STATUS_SCHEDULED')=>({id,date,status:{type:{state,name,completed:state==='post'}}});
test('Chicago slate includes late UTC next-day games; deduplicates snapshots and excludes final/cancelled',()=>{
 const events=[event('a','2026-10-22T03:00Z'),event('b','2026-10-22T06:00Z'),event('c','2026-10-21T23:00Z','post'),event('d','2026-10-21T23:00Z','pre','STATUS_CANCELED')];
 assert.equal(Slate.activeEvents([{league:'nba',events},{league:'nba',events}],['nba'],now),1);
 assert.equal(Slate.day('2026-10-22T03:00Z'),'2026-10-21');
});
test('count tennis matches rather than tournament wrappers; golf retains ongoing multi-day events',()=>{
 const tennis={league:'atp',events:[{id:'tournament',competitions:[event('m1','2026-10-21T14:00Z'),event('m2','2026-10-21T15:00Z')]}]};
 assert.equal(Slate.activeEvents([tennis],['atp'],now),2);
 assert.equal(Slate.activeEvents([{league:'pga',events:[event('tour','2026-10-19T14:00Z','in')]}],['pga'],now),1);
});
