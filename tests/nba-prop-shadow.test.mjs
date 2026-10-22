import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {boxPlayers,historyGame,contract,estimate,tail} from '../scripts/nba-prop-model.mjs';
import {candidates,mergePredictions,status,endpointMetrics} from '../scripts/nba-prop-shadow.mjs';
const config=JSON.parse(fs.readFileSync('data/testing/nba-prop-protocol.json'));config.created_at='2026-10-01T00:00:00Z';
const now='2026-10-22T02:20:00Z';
const player=(extra={})=>({athlete_id:'1',player:'Test Player',team_id:'A',position:'C',starter:true,minutes:30,pts:24,reb:8,ast:2,threes:1,stl:1,blk:2,fga:15,tpa:3,pf:2,dnp:false,ejected:false,...extra});
const history={refreshed_at:'2026-10-21T00:00:00Z',games:Array.from({length:24},(_,i)=>({id:String(i),date:new Date(Date.UTC(2026,8,i+1)).toISOString(),recorded_at:'2026-10-21T00:00:00Z',season_type:2,players:[player({reb:6+i%5}),player({athlete_id:'2',team_id:'B',pts:12,reb:5,ast:4})]}))};
const event={id:'live',date:'2026-10-22T02:00:00Z',details_checked_at:now,details_available:true,details_source_url:'https://site.api.espn.com/test',status:{period:2,displayClock:'12:00',type:{state:'in'}},nba_players:[player({minutes:8,pts:6,reb:3,ast:1,blk:0})],competitions:[{competitors:[{homeAway:'away',team:{id:'A',abbreviation:'A'},score:'20'},{homeAway:'home',team:{id:'B',abbreviation:'B'},score:'22'}]}],injuries:[]};
const spec={player:'Test Player',stat:'reb',target:10};
test('boxscore parser keeps explicit identity, position, role, attempts, zeros and missing values',()=>{
 const s={boxscore:{players:[{team:{id:'A'},statistics:[{names:['MIN','PTS','REB','AST','3PT','FG','STL','BLK','PF'],athletes:[{athlete:{id:'1',displayName:'Test Player',position:{abbreviation:'C'}},starter:false,stats:['3:30','2','0','1','1-2','1-3','0','0','1']}]}]}]}};
 const p=boxPlayers(s)[0];assert.equal(p.minutes,3.5);assert.equal(p.position,'C');assert.equal(p.starter,false);assert.equal(p.threes,1);assert.equal(p.tpa,2);assert.equal(p.fga,3);assert.equal(p.reb,0);
 assert.equal(boxPlayers({boxscore:{players:[{statistics:[{names:['MIN'],athletes:[{athlete:{id:'3',displayName:'Missing'},stats:['--']}]}]}]}})[0].reb,null);
 assert.equal(historyGame({...s,header:{season:{type:1},competitions:[{date:'2026-10-01',status:{type:{completed:true,state:'post'}}}]}},'1',now,'https://espn.test'),null);
});
test('contracts require exact player, supported full-game stat and explicit integer threshold',()=>{
 const m={player:'Test Player',period:'full_game',question:'Will Test Player record at least 10 total rebounds in A vs. B?'};
 assert.deepEqual(contract(m),spec);assert.equal(contract({...m,player:'Other Player'}),null);
 assert.equal(contract({...m,question:'Will Test Player record at least 10 points in the first half?'}),null);
 assert.equal(contract({...m,question:'Will Test Player record 10 points?'}),null);
});
test('ability is stat specific, conditioned on verified position/team/starter role, with no market price input',()=>{
 const r=estimate(spec,event,history,config,now);assert.equal(r.eligible,true);assert.ok(r.p>0&&r.p<1);assert.equal(r.evidence.position,'C');assert.ok(r.evidence.historical_games>=8);assert.equal(r.evidence.role_proxy,'reb share');
 const assists=estimate({...spec,stat:'ast'},event,history,config,now);assert.ok(r.p>assists.p);
 assert.equal(estimate(spec,{...event,ask:.99},history,config,now).p,r.p);
 assert.deepEqual(estimate(spec,event,history,config,now),r);
});
test('missing or changed position/role, low minutes, foul risk and stale source cause abstention',()=>{
 for(const extra of [{position:'G'},{position:null},{starter:false},{minutes:1},{pf:5},{dnp:true},{reb:null}])assert.equal(estimate(spec,{...event,nba_players:[player({minutes:8,reb:3,...extra})]},history,config,now).eligible,false);
 assert.equal(estimate(spec,{...event,details_checked_at:'2026-10-22T02:00:00Z'},history,config,now).eligible,false);
 assert.equal(estimate(spec,{...event,nba_players:[...event.nba_players,...event.nba_players]},history,config,now).eligible,false);
});
test('future game data and history acquired after observation cannot leak into prediction',()=>{
 const future=structuredClone(history);future.games.forEach(g=>g.date='2026-10-23T00:00:00Z');assert.equal(estimate(spec,event,future,config,now).eligible,false);
 future.games.forEach(g=>{g.date='2026-10-01T00:00:00Z';g.recorded_at='2026-10-23T00:00:00Z';});assert.equal(estimate(spec,event,future,config,now).eligible,false);
 assert.equal(estimate(spec,event,{games:history.games.slice(0,3)},config,now).eligible,false);
});
test('count distribution remains bounded and known Poisson-mixture special case is correct',()=>{
 assert.equal(tail(0,2,2,1),1);assert.equal(tail(1,1,1,1),.5);assert.ok(tail(10,20,30,20)<tail(5,20,30,20));
});
const c={market_id:'m',player:'Test Player',period:'full_game',question:'Will Test Player record at least 10 total rebounds in A vs. B?',side_index:0,ask:.45,bid:.43,quoted_at:now};
const feed={slug:'nba-a-b-2026-10-22',updated:now,game_context:{event_id:'live'},prop_test_candidates:[c]};
const empty={model_version:config.model_version,protocol_hash:'TEST',started_at:null,ends_at:null,predictions:[]};
test('prospective merge records before results, deduplicates canonical contracts and preserves old forecasts',()=>{
 const r=mergePredictions(empty,[{feed,event}],history,config,now);assert.equal(r.added,1);assert.equal(r.ledger.predictions[0].result,'pending');assert.equal(r.ledger.started_at,now);
 const duplicate={...feed,prop_test_candidates:[{...c,market_id:'duplicate'}]};const again=mergePredictions(r.ledger,[{feed:duplicate,event}],history,config,now);assert.equal(again.added,0);assert.deepEqual(again.ledger.predictions,r.ledger.predictions);
 const old=mergePredictions(empty,[{feed,event}],history,{...config,created_at:'2026-10-23T00:00:00Z'},now);assert.equal(old.added,0);
 const ended=mergePredictions({...empty,ends_at:'2026-10-21T00:00:00Z'},[{feed,event}],history,config,now);assert.equal(ended.added,0);
});
test('candidate quotes require supported provider type, actual buyability and liquid executable side',()=>{
 const market={id:'m',sportsMarketType:'basketball_player_rebounds',question:c.question,active:true,status:'MARKET_STATUS_OPEN',bestBidQuote:{value:.43},bestAskQuote:{value:.45},marketSides:[{long:true,tradable:true},{long:false,tradable:false}]};
 const open={slug:feed.slug};assert.equal(candidates(open,{markets:[market]},now).length,1);assert.equal(candidates(open,{markets:[{...market,marketSides:[]}]},now).length,0);
 assert.equal(candidates(open,{markets:[{...market,sportsMarketType:'basketball_player_points'}]},now).length,0);
 assert.equal(candidates(open,{markets:[{...market,bestAskQuote:{value:.9}}]},now).length,0);
});
test('pre-endpoint status has no profit peek or automatic validation, insufficient endpoint evidence remains inconclusive',()=>{
 const r=mergePredictions(empty,[{feed,event}],history,config,now),s=status(r.ledger,history,config,now);
 assert.equal(s.state,'collecting_results');assert.equal(s.per_stat.reb.metrics,undefined);assert.match(s.promotion,/disabled/);assert.equal(endpointMetrics([],config).decision,'inconclusive');
});
