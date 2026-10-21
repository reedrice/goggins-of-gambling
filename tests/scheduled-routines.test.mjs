import test from 'node:test';import assert from 'node:assert/strict';
import {ct,due,slot,injuryNotes,eligible,weeklyReport,selectMarkets,manualGame,selectCandidates} from '../scripts/scheduled-routines.mjs';
test('partial-game lines cannot crowd out a valid full-game line',()=>{const full={id:'full',type:'total',smt:'basketball_full_game_total',yes_ask:55,no_cost:47},half={...full,id:'half',smt:'basketball_first_half_total',yes_ask:50};assert.deepEqual(selectMarkets([half,full]).map(x=>x.id),['full']);});
test('manual single/combo markets reserve their game against generated conflicting suggestions',()=>{const old={slate_date:'2026-10-21',sections:{parlays:[{legs:[{market_id:'aec-nba-atl-orl-2026-10-21'}]}]}};assert.ok(manualGame(old,'nba-atl-orl-2026-10-21','2026-10-21'));assert.ok(!manualGame(old,'nba-okc-sa-2026-10-21','2026-10-21'));});
test('Chicago schedules follow daylight saving and do not run twice per slot',()=>{
 assert.equal(ct(Date.parse('2026-10-21T12:00:00Z')).minute,420);
 assert.equal(ct(Date.parse('2026-12-21T13:00:00Z')).minute,420);
 assert.ok(due('lineup-goalie-check','2026-10-21T17:01:00Z',Date.parse('2026-10-21T21:01:00Z')));
 assert.ok(!due('lineup-goalie-check','2026-10-21T21:01:00Z',Date.parse('2026-10-21T21:11:00Z')));
 assert.equal(slot('weekly-learning-review',Date.parse('2026-10-25T14:00:00Z')),'2026-10-18');
 assert.equal(slot('weekly-learning-review',Date.parse('2026-10-25T15:00:00Z')),'2026-10-25');
});
test('injuries require an exact normalized player and a published adverse status',()=>{
 const s={injuries:[{injuries:[{athlete:{displayName:'Player One'},status:'Out'},{athlete:{displayName:'Player Two'},status:'Active'}]}]};
 assert.deepEqual(injuryNotes(s,['Player One']),[{name:'Player One',status:'Out'}]);
 assert.deepEqual(injuryNotes(s,['Player']),[]);assert.deepEqual(injuryNotes(s,['Player Two']),[]);
});
test('unbuyable sides, extreme prices and partial-game markets are excluded',()=>{
 const m={type:'total',smt:'basketball_team_full_game_total',yes_ask:50,no_cost:52};
 assert.ok(eligible(m,'yes'));assert.ok(!eligible({...m,no_buyable:false},'no'));
 assert.ok(!eligible({...m,smt:'basketball_team_first_half_total'},'yes'));
 assert.ok(!eligible({...m,yes_ask:99},'yes'));
});
test('weekly report preserves measured counts without invented recommendations',()=>{
 const d={sample:{picks_graded:12},clv:{n:2,avg_pts:-1},calibration:{picks:[]},categories:[],best:[],worst:[]};
 assert.deepEqual(weeklyReport(d,'2026-10-21T00:00:00Z').sample,d.sample);
 assert.match(weeklyReport(d,'2026-10-21T00:00:00Z').note,/below 30/);
});

test('daily slate refreshes once per five-minute slot, including overnight',()=>{
 assert.ok(due('daily-slate-odds-digest','2026-10-21T12:54:00Z',Date.parse('2026-10-21T17:01:00Z')));
 assert.ok(!due('daily-slate-odds-digest','2026-10-21T17:01:00Z',Date.parse('2026-10-21T17:04:00Z')));
 assert.equal(slot('daily-slate-odds-digest',Date.parse('2026-10-21T11:59:00Z')),'2026-10-21:415');
 assert.ok(due('daily-slate-odds-digest','2026-10-21T17:01:00Z',Date.parse('2026-10-21T17:06:00Z')));
});

test('expanded selection keeps distinct markets and separate line/prop caps',()=>{const lines=Array.from({length:5},(_,i)=>({market_id:'l'+i,edge:10-i})),props=Array.from({length:9},(_,i)=>({market_id:'p'+i,player:'Player '+i,edge:9-i}));const chosen=selectCandidates([...lines,...props,{...lines[0],market_side:'no',edge:1}]);assert.equal(chosen.filter(p=>!p.player).length,3);assert.equal(chosen.filter(p=>p.player).length,6);assert.equal(chosen.filter(p=>p.market_id==='l0').length,1);});
test('market discovery recognizes the full tracked sport footprint',async()=>{const c=(await import('../js/markets-core.js')).default;for(const l of ['cfb','cbb','wcbb','wnba','atp','wta','atpdb','wtadb','pga','lpga','dpwt','epl'])assert.ok(c.LEAGUES[l]);});
