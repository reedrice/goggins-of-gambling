import test from 'node:test';import assert from 'node:assert/strict';
import BP from '../js/bet-progress.js';import {normalizeFixture,fixtures} from '../scripts/fetch-espn-status.mjs';
const now=Date.parse('2026-10-22T23:35:00Z');
function event(state='in'){
 const status={period:1,displayClock:'8:12',type:{state,completed:state==='post',detail:'8:12 - 1st Quarter'}};
 return {id:'verified-college-game',date:'2026-10-22T23:00:00Z',status,competitions:[{date:'2026-10-22T23:00:00Z',status,competitors:[{homeAway:'away',score:'7',linescores:[{value:7}],team:{abbreviation:'JMU',displayName:'James Madison Dukes'}},{homeAway:'home',score:'0',linescores:[{value:0}],team:{abbreviation:'APP',displayName:'App State Mountaineers'}}]}]};
}
const spec=()=>BP.spec({desc:'Appalachian State +4.5 (H1)',team:{abbr:'applst'},eventSlug:'cfb-jmad-applst-2026-10-22'});
const board=(e=event(),at=new Date(now).toISOString())=>({fetched_at:at,events:[e]});
test('college snapshots match both official abbreviations and preserve first-half spread',()=>{
 const result=BP.snapshotResult(spec(),board(),null,now);assert.equal(result.kind,'margin');assert.equal(result.margin,-2.5);assert.equal(result.checkedAt,new Date(now).toISOString());
 assert.equal(BP.findProgressEvent(board(),spec().eventSlug).id,'verified-college-game');
 assert.equal(BP.findProgressEvent(board(),'cfb-jmad-ecar-2026-10-22'),null);
 assert.equal(BP.findProgressEvent({...board(),events:[event(),event()]},spec().eventSlug),null);
});
test('canonical snapshot paths support college leagues and reject injected or unsupported paths',()=>{
 for(const [slug,file] of [['cfb-jmad-applst-2026-10-22','cfb'],['ncaaf-ecar-mphs-2026-10-22','cfb'],['cbb-duke-unc-2026-10-22','cbb'],['ncaaw-duke-unc-2026-10-22','wcbb']])assert.equal(BP.snapshotPath({eventSlug:slug}),`data/espn/${file}-2026-10-22.json`);
 assert.equal(BP.snapshotPath({eventSlug:'../secret'}),null);assert.equal(BP.snapshotPath({eventSlug:'unknown-a-b-2026-10-22'}),null);
});
test('stale, overdue pregame and missing source time cannot fabricate live progress',()=>{
 assert.equal(BP.snapshotResult(spec(),board(event(),new Date(now-11*60000).toISOString()),null,now).reason,'stale');
 assert.equal(BP.snapshotResult(spec(),board(event('pre')),null,now).reason,'startPending');
 assert.equal(BP.snapshotResult(spec(),board(event(),''),null,now).reason,'stale');
 assert.equal(BP.snapshotResult(spec(),board(event('post'),new Date(now-86400000).toISOString()),null,now).final,true);
});
test('college mens and womens half scoring use their actual period structures',()=>{
 const c={score:'50',linescores:[{value:20},{value:30},{value:4}]};
 assert.equal(BP.scoresFor(c,{half:1},'cbb',2),20);assert.equal(BP.scoresFor(c,{half:2},'cbb',3),34);
 assert.equal(BP.scoresFor(c,{half:1},'wcbb',3),50);
 assert.equal(BP.scoresFor(c,{half:2},'cfb',3),4);
});
test('existing summary snapshots retain real player stats, DNP and identity without new fetches',()=>{
 const summary={boxscore:{players:[{team:{abbreviation:'JMU'},statistics:[{name:'rushing',keys:['rushingYards'],athletes:[{athlete:{displayName:'Test Player'},didNotPlay:false,stats:['27']}]}]}]}};
 const normalized=normalizeFixture(event(),'cfb','https://espn.test',new Date(now).toISOString(),summary,'https://espn.test/summary');
 assert.equal(BP.athleteStat({boxscore:normalized.boxscore},'Test Player','rushyd','jmu'),27);
 assert.equal(normalizeFixture(event(),'cfb','https://espn.test','now').boxscore,undefined);
});
test('tennis normalization retains major and round metadata for existing match rules',()=>{
 const e=fixtures({events:[{name:'Tournament',major:true,groupings:[{competitions:[{id:'1',round:{displayName:'Q1'},wasSuspended:true,competitors:[]}]}]}]})[0];
 const row=normalizeFixture(e,'atp','https://espn.test','now');assert.equal(row.major,true);assert.equal(row.competitions[0].round.displayName,'Q1');assert.equal(row.competitions[0].wasSuspended,true);
});
