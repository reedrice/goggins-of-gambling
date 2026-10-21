import test from 'node:test';import assert from 'node:assert/strict';
import {problems,recoveryDecision} from '../scripts/site-health.mjs';
const now=Date.parse('2026-10-21T12:00:00Z'),fresh=new Date(now).toISOString(),old=new Date(now-61*60000).toISOString();
test('healthy JSON and fresh due games pass; final games may retain old timestamps',()=>{
 assert.deepEqual(problems({games:[{status:'final',updated:old,start_time:old}]},{snapshots:[],updated_at:fresh},fresh,now),[]);
 assert.equal(problems({games:[{status:'live',start_time:old,updated:old}]},{snapshots:[],updated_at:fresh},fresh,now).length,1);
});
test('missing indices, stale stamps and future dates fail',()=>{
 assert.equal(problems({}, {}, old, now).length,3);
 assert.equal(problems({games:[]},{snapshots:[],updated_at:fresh},'2099-01-01',now).length,1);
});
test('recovery never duplicates active work or loops within an hour',()=>{
 assert.equal(recoveryDecision([{status:'in_progress',created_at:fresh}],now),'active');
 assert.equal(recoveryDecision([{status:'completed',event:'workflow_dispatch',created_at:fresh}],now),'cooldown');
 assert.equal(recoveryDecision([{status:'completed',event:'workflow_dispatch',created_at:old}],now),'dispatch');
 assert.equal(recoveryDecision([],now),'dispatch');
});

test('detect before the UI warning; successful manual refresh must not suppress the next recovery',()=>{
 const at16=new Date(now-16*60000).toISOString();
 assert.ok(problems({games:[{status:'live',start_time:old,updated:at16}]},{snapshots:[],updated_at:fresh},fresh,now).length);
 assert.equal(recoveryDecision([{status:'completed',event:'workflow_dispatch',conclusion:'success',created_at:at16}],now),'dispatch');
 assert.equal(recoveryDecision([{status:'completed',event:'workflow_dispatch',conclusion:'failure',created_at:at16}],now),'cooldown');
});

test('five-minute freshness threshold detects a six-minute gap',()=>{
 const at6=new Date(now-6*60000).toISOString();
 assert.ok(problems({games:[]},{snapshots:[],updated_at:fresh},at6,now).length);
 const at4=new Date(now-4*60000).toISOString();
 assert.deepEqual(problems({games:[]},{snapshots:[],updated_at:at4},at4,now),[]);
});

test('successful recovery that never reaches the public feed alerts after CDN grace instead of looping',()=>{
 const created=new Date(now-4*60000).toISOString(),updated=new Date(now-3*60000).toISOString();
 const runs=[{status:'completed',event:'workflow_dispatch',conclusion:'success',created_at:created,updated_at:updated}];
 assert.equal(recoveryDecision(runs,now,now-10*60000),'cooldown');
 assert.equal(recoveryDecision(runs,now,now-2*60000),'dispatch');
 assert.equal(recoveryDecision([{...runs[0],updated_at:new Date(now-60000).toISOString()}],now,now-10*60000),'active');
});
