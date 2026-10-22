import test from 'node:test';
import assert from 'node:assert/strict';
import {playerUsage,participation} from '../scripts/live-prop-quality.mjs';
import {buildLive} from '../scripts/live-watch.mjs';
import {createRequire} from 'node:module';
const LiveBets=createRequire(import.meta.url)('../js/live-bets.js');
const now='2026-10-22T02:00:00Z',market={group:'prop',player:'Test Player'};
const event=(minutes=10,extra={})=>({id:'1',details_checked_at:now,details_source_url:'https://site.api.espn.com/test',
 status:{period:2,displayClock:'4:00',type:{state:'in'}},player_usage:[{player:'Test Player',team_id:'A',athlete_id:'42',minutes,...extra}]});
const context=e=>({available:true,event_id:'1',home:{id:'A'},away:{id:'B'},player_usage_event:e});
const check=e=>participation('nba',market,context(e),now);
test('extract actual ESPN minutes, preserving unknown and DNP instead of inferring healthy/starter',()=>{
 const rows=playerUsage({boxscore:{players:[{team:{id:'A'},statistics:[{names:['minutes','points'],athletes:[
  {athlete:{id:'1',displayName:'Clock'},stats:['3:30','2']},
  {athlete:{displayName:'Decimal'},stats:['10','2']},
  {athlete:{displayName:'Missing'},stats:['--','0'],didNotPlay:true}]}]}]}});
 assert.equal(rows[0].minutes,3.5);assert.equal(rows[1].minutes,10);assert.equal(rows[2].minutes,null);assert.equal(rows[2].did_not_play,true);
 assert.deepEqual(playerUsage({leaders:[{minutes:30}]}),[]);
});
test('established participation passes; unused and lightly used bench players fail even with good prices',()=>{
 assert.equal(check(event(10)).eligible,true);assert.equal(check(event(0)).eligible,false);
 assert.equal(check(event(2)).eligible,false);assert.equal(check(event(5)).eligible,false);
 assert.equal(check(event(10,{did_not_play:true})).eligible,false);assert.equal(check(event(10,{ejected:true})).eligible,false);
});
test('missing, stale, duplicate, wrong team and wrong event evidence all fail closed',()=>{
 for(const e of [null,{...event(),details_checked_at:'2026-10-22T01:49:00Z'},
  {...event(),id:'2'},event(10,{team_id:'X'}),event(10,{player:'Other Player'}),
  {...event(),player_usage:[...event().player_usage,...event().player_usage]}])assert.equal(check(e).eligible,false);
});
test('pregame, early game, final, overtime and invalid clock cannot establish regulation usage',()=>{
 for(const status of [{period:1,displayClock:'8:00',type:{state:'in'}},{period:1,displayClock:'12:00',type:{state:'pre'}},
  {period:4,displayClock:'0:00',type:{state:'post'}},{period:5,displayClock:'4:00',type:{state:'in'}},
  {period:2,displayClock:'4:99',type:{state:'in'}}])assert.equal(check({...event(),status}).eligible,false);
});
test('WNBA and college use their regulation lengths; unrelated markets unchanged',()=>{
 assert.equal(participation('wnba',market,context({...event(8),status:{period:2,displayClock:'0:00',type:{state:'in'}}}),now).eligible,true);
 assert.equal(participation('cbb',market,context({...event(8),status:{period:1,displayClock:'0:00',type:{state:'in'}}}),now).eligible,true);
 assert.equal(participation('nba',{group:'game'},null,now),null);
 assert.equal(participation('nfl',market,null,now),null);
});
test('withheld candidates never enter cards, counts or new-edge alerts; price and history remain intact',()=>{
 const opening={slug:'nba-a-b-2026-10-22',title:'A vs B',start_time:'2026-10-22T01:00:00Z',markets:[
  {...market,id:'p',kind:'Player prop',sides:['Yes: Test Player 10+ points','No: Test Player 10+ points'],mid:60,yesBuy:60,noBuy:40}]};
 const ev={markets:[{id:'p',active:true,status:'MARKET_STATUS_OPEN',bestBidQuote:{value:'0.49'},bestAskQuote:{value:'0.50'}}]};
 const ctx={...context(event(1)),game_state:'in',injuries:[],in_game_injuries:[],leaders:[]};
 const out=buildLive(opening,ev,null,now,ctx);
 assert.ok(out.edges.length);assert.equal(out.edges[0].class,'participation');assert.equal(out.edges[0].edge,10);
 assert.equal(out.alerts.filter(a=>a.type==='new_edge').length,0);
 assert.equal(LiveBets.groupEdges(out.edges).prop.total,0);
});
