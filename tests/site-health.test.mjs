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
