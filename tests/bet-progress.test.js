const test=require('node:test');const assert=require('node:assert/strict');
const BP=require('../js/bet-progress.js'),V=require('../js/viz.js');
const teams=[{homeAway:'away',score:'96',team:{abbreviation:'PHI',name:'76ers',shortDisplayName:'76ers'},linescores:[{value:23},{value:31},{value:29},{value:13}]},{homeAway:'home',score:'92',team:{abbreviation:'NY',name:'Knicks',shortDisplayName:'Knicks'},linescores:[{value:20},{value:25},{value:31},{value:16}]}];
const summary=()=>({header:{competitions:[{status:{period:4,displayClock:'5:22',type:{state:'in',completed:false,shortDetail:'5:22 - 4th'}},competitors:structuredClone(teams)}]},boxscore:{players:[{team:{abbreviation:'PHI'},statistics:[{keys:['points','rebounds','assists','threePointFieldGoalsMade-threePointFieldGoalsAttempted'],athletes:[{athlete:{displayName:'Joel Embiid'},stats:['24','6','3','2-5']}]}]}]}});
const spec=(text,other={})=>BP.spec({side:text,event_slug:'nba-phi-ny-2026-10-20',...other});
const evaluate=(s,d=summary())=>BP.evaluateBet(s,d,V.parseProp);
test('Embiid rebounds use only his verified row and the requested target',()=>{const r=evaluate(spec('Yes: Joel Embiid record at least 10 total rebounds in PHI 76ers vs. NY Knicks',{question:'Will Joel Embiid record at least 10 total rebounds in PHI 76ers vs. NY Knicks?'}));assert.equal(r.value,6);assert.equal(r.target,10);assert.equal(r.under,false);});
test('No/under player side keeps the threshold as a limit',()=>{const r=evaluate(spec('Joel Embiid 10+ rebounds — NO',{market_side:'no'}));assert.equal(r.under,true);assert.equal(r.value,6);});
test('missing player, wrong team and missing stat never turn into zero',()=>{assert.equal(evaluate(spec('Not A Player 10+ rebounds')).reason,'noStat');assert.equal(evaluate(spec('Joel Embiid 10+ rebounds',{player_team:'ny'})).reason,'noStat');assert.equal(evaluate(spec('Joel Embiid 1+ steals')).reason,'noStat');});
test('DNP rows and ambiguous duplicated players are not trusted',()=>{const d=summary();d.boxscore.players[0].statistics[0].athletes[0].didNotPlay=true;assert.equal(evaluate(spec('Joel Embiid 10+ rebounds'),d).reason,'noStat');const other=summary();other.boxscore.players.push(structuredClone(other.boxscore.players[0]));assert.equal(evaluate(spec('Joel Embiid 10+ rebounds'),other).reason,'noStat');});
test('PRA sums the right fields and threes read made, not attempted',()=>{assert.equal(evaluate(spec('Joel Embiid 30+ points + rebounds + assists')).value,33);assert.equal(evaluate(spec('Joel Embiid 3+ threes')).value,2);});
test('team totals do not accidentally include the opponent score',()=>{const r=evaluate(spec('76ers Under 108.5 points',{market:'Team total'}));assert.equal(r.value,96);assert.equal(r.under,true);assert.equal(r.target,108.5);assert.equal(r.stat,'pts');});
test('game totals use combined scores and preserve over vs under',()=>{const r=evaluate(spec('Over 220.5 total points'));assert.equal(r.value,188);assert.equal(r.under,false);assert.equal(r.strict,true);});
test('quarter markets use quarter scores; missing splits stay unavailable',()=>{assert.equal(evaluate(spec('Under 50.5 (Q1)',{market:'Q1 total'})).value,43);const d=summary();delete d.header.competitions[0].competitors[1].linescores;assert.equal(evaluate(spec('Under 50.5 (Q1)'),d).reason,'noStat');});
test('quarter player props never use full-game player totals',()=>assert.equal(evaluate(spec('Joel Embiid 10+ points (Q1)')).reason,'noStat'));
test('spread and moneyline use the selected team and actual margin',()=>{assert.equal(evaluate(spec('Knicks +8.5')).margin,4.5);assert.equal(evaluate(spec('76ers to win')).margin,4);assert.equal(evaluate(spec('Knicks to win')).margin,-4);});
test('pregame, missing game and unsupported markets have explicit states',()=>{const d=summary();d.header.competitions[0].status.type.state='pre';assert.equal(evaluate(spec('Joel Embiid 10+ rebounds'),d).reason,'pregame');assert.equal(evaluate(spec('Anything'),{}).reason,'noGame');assert.equal(evaluate(spec('Unknown market')).reason,'noStat');});
test('final stats are tagged without writing grades',()=>{const d=summary();d.header.competitions[0].status.type={state:'post',completed:true};const before=JSON.stringify(d);assert.equal(evaluate(spec('Joel Embiid 10+ rebounds'),d).final,true);assert.equal(JSON.stringify(d),before);});
test('game matching uses both teams and rejects ambiguous doubleheaders',()=>{const e={id:'verified',competitions:[{competitors:teams}]};assert.equal(BP.findEvent({events:[e]},'nba-phi-ny-2026-10-20').id,'verified');assert.equal(BP.findEvent({events:[e,e]},'nba-phi-ny-2026-10-20'),null);assert.equal(BP.findEvent({events:[e]},'nba-phi-bos-2026-10-20'),null);});
test('clock bars measure regulation elapsed, not win probability',()=>{assert.ok(BP.gameElapsed(summary().header.competitions[0].status,'nba')>80);assert.equal(BP.gameElapsed({type:{state:'in'},period:4,displayClock:''},'nba'),null);assert.equal(BP.gameElapsed({type:{completed:true}},'nba'),100);});
test('markup escapes source content and extracts event slug from market ids',()=>{assert.equal(BP.spec({market_id:'astatc-nhl-ana-nyi-2026-10-20-ast-leocar-gte1'}).eventSlug,'nhl-ana-nyi-2026-10-20');assert.ok(!BP.html({text:'<img onerror="x">'}).includes('<img'));});


test('hockey points sum goals and assists when ESPN omits points', () => {
 const s={boxscore:{players:[{team:{abbreviation:'CBJ'},statistics:[{keys:['goals','assists'],athletes:[{athlete:{displayName:'Adam Fantilli'},stats:['1','2']}]}]}]}};
 assert.equal(BP.athleteStat(s,'Adam Fantilli','pts','CBJ'),3);
 s.boxscore.players[0].statistics[0].keys=['goals'];
 assert.equal(BP.athleteStat(s,'Adam Fantilli','pts','CBJ'),null);
});

test('unrecognized period/half questions never use full game scores',()=>{assert.equal(evaluate(spec('Under 1.5',{question:'Over 1.5 total goals in 3rd period'})).reason,'noStat');assert.equal(evaluate(spec('Over 107.5',{market_id:'tsc-nba-phi-ny-2026-10-20-sh-107pt5'})).reason,'noStat');});
test('No game sides invert the displayed adjusted margin',()=>assert.equal(evaluate(spec('76ers to win',{market_side:'no'})).margin,-4));
