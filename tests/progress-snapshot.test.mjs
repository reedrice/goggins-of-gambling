import test from 'node:test';import assert from 'node:assert/strict';
import BP from '../js/bet-progress.js';import {normalizeFixture,fixtures} from '../scripts/fetch-espn-status.mjs';
const now=Date.parse('2026-10-22T23:35:00Z');
function event(state='in'){
 const status={period:1,displayClock:'8:12',type:{state,completed:state==='post',detail:'8:12 - 1st Quarter'}};
 return {id:'verified-college-game',date:'2026-10-22T23:00:00Z',status,competitions:[{date:'2026-10-22T23:00:00Z',status,competitors:[{homeAway:'away',score:'7',linescores:[{value:7}],team:{abbreviation:'JMU',displayName:'James Madison Dukes'}},{homeAway:'home',score:'0',linescores:[{value:0}],team:{abbreviation:'APP',displayName:'App State Mountaineers'}}]}]};
}
const spec=()=>BP.spec({desc:'Appalachian State +4.5 (H1)',team:{abbr:'applst'},eventSlug:'cfb-jmad-applst-2026-10-22'});
const board=(e=event(),at=new Date(now).toISOString())=>({fetched_at:at,events:[e]});
test('real college 1h and 1q contract codes preserve the selected side and period',()=>{
 for(const [code,period] of [['1h',{half:1}],['1q',{quarter:1}],['2h',{half:2}],['2q',{quarter:2}]]){
  const slug='asc-cfb-jmad-applst-2026-10-22-'+code+'-neg-4pt5';
  const source={markets:[{slug,title:'James Madison wins by over 4.5 points in '+code,sportsMarketType:'football_team_first_half_spread',marketSides:[{long:true,description:'-4.50',team:{name:'James Madison',abbreviation:'jmad'}},{long:false,description:'+4.50',team:{name:'Appalachian State',abbreviation:'applst'}}]}]};
  const s=BP.resolveMarket({eventSlug:spec().eventSlug,marketSlug:slug,side:'no',resolveMarket:true},source);
  assert.deepEqual(BP.parseBet(s).segment,period);assert.equal(s.side,'yes');
  const result=BP.snapshotResult(s,board(),null,now);
  if(code.startsWith('1')){assert.equal(result.kind,'margin');assert.equal(result.margin,-2.5);}else assert.equal(result.reason,'segmentPending');
 }
 const slug='atc-cfb-jmad-applst-2026-10-22-winner-1h-applst';
 const s=BP.resolveMarket({eventSlug:spec().eventSlug,marketSlug:slug,side:'yes',resolveMarket:true},{markets:[{slug,title:'Appalachian State wins 1st half',sportsMarketType:'football_team_first_half_winner',marketSides:[{long:true,team:{name:'Appalachian State',abbreviation:'applst'}}]}]});
 assert.deepEqual(BP.parseBet(s).segment,{half:1});assert.equal(BP.snapshotResult(s,board(),null,now).margin,-7);
 const second=event();second.status.period=3;second.competitions[0].competitors[0].score='21';second.competitions[0].competitors[0].linescores=[{value:7},{value:7},{value:7}];second.competitions[0].competitors[1].score='10';second.competitions[0].competitors[1].linescores=[{value:0},{value:3},{value:7}];
 assert.equal(BP.snapshotResult(s,board(second),null,now).margin,-11);
 second.competitions[0].competitors[1].score='17';second.competitions[0].competitors[1].linescores[2].value=14;
 assert.equal(BP.snapshotResult(s,board(second),null,now).margin,-11);
 const totalSlug='tsc-cfb-jmad-applst-2026-10-22-tt1h-applst-10pt5';
 const total=BP.resolveMarket({eventSlug:spec().eventSlug,marketSlug:totalSlug,side:'no',resolveMarket:true},{markets:[{slug:totalSlug,title:'Appalachian State over 10.5 total points in 1st half',sportsMarketType:'football_team_first_half_total',line:10.5,marketSides:[{long:false,description:'Under',team:{name:'Appalachian State',abbreviation:'applst'}}]}]});
 const r=BP.snapshotResult(total,board(second),null,now);assert.equal(r.kind,'threshold');assert.equal(r.value,3);assert.equal(r.target,10.5);assert.equal(r.under,true);
 const combinedSlug='tsc-cfb-jmad-applst-2026-10-22-total-30pt5';
 const combined=BP.resolveMarket({eventSlug:spec().eventSlug,marketSlug:combinedSlug,side:'yes',resolveMarket:true},{markets:[{slug:combinedSlug,title:'Over 30.5',sportsMarketType:'football_team_full_game_total',line:30.5,marketSides:[{long:true,description:'Over'}]}]});
 assert.equal(BP.snapshotResult(combined,board(second),null,now).value,38); // Same taxonomy prefix, but no selected team means combined total.
});
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
