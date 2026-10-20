import test from 'node:test';
import assert from 'node:assert/strict';
import { importPosts } from '../scripts/trent-import.mjs';
const batch = () => ({coverage:'partial',posts:[{id:'2112579730297983307',author:'BookitWithTrent',posted_at:'2026-10-20T16:20:00Z',text:'TEST DATA: Celtics ML and Sixers +4.5',picks:[{key:'bos',league:'NBA',game:'TEST Boston @ Detroit',pick:'Celtics ML',type:'moneyline',units:3},{key:'phi',league:'NBA',game:'TEST Philadelphia @ New York',pick:'Sixers +4.5',type:'spread',units:3}]}]});
test('multiple picks have stable ids; repeat import preserves grades',()=>{
 const a=importPosts({picks:[],read_through:'2026-10-20T04:22:05Z'},batch());
 assert.equal(a.added,2); a.doc.picks[0].result='loss';a.doc.picks[0].final_score='TEST final';a.doc.picks[0].graded_from='https://example.com/final';
 const b=importPosts(a.doc,batch()); assert.equal(b.added,0);assert.equal(b.doc.picks[0].result,'loss');
 assert.equal(b.doc.read_through,'2026-10-20T04:22:05Z');assert.equal(b.doc.monitor.coverage,'partial');
});
test('complete read advances watermark; invalid source fails without mutation',()=>{
 const b=batch();b.coverage='complete';const d={picks:[]};assert.equal(importPosts(d,b).doc.read_through,b.posts[0].posted_at);
 b.posts[0].author='Other';assert.throws(()=>importPosts(d,b),/author/);assert.deepEqual(d,{picks:[]});
});
