import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),B=require('../js/live-scoreboard.js');
const now=Date.parse('2026-10-22T01:00:00Z');
const event=(id,state,date='2026-10-21T23:00:00Z')=>({id,date,status:{type:{state,shortDetail:state==='in'?'3:32 - 3rd':'Final'}},competitions:[{id,competitors:[{homeAway:'home',team:{abbreviation:'ORL'},score:'90'},{homeAway:'away',team:{abbreviation:'ATL',logo:'javascript:bad'},score:'93'}]}]});
test('selected sport only, Chicago today, live-first, deduplicated finals and upcoming',()=>{const docs=[{league:'nba',events:[event('f','post'),event('p','pre'),event('l','in'),event('old','post','2026-10-20T23:00:00Z')]},{league:'nba',events:[event('l','in')]},{league:'nhl',events:[event('h','in')]}];const rows=B.games(docs,'nba',now);assert.deepEqual(rows.map(x=>x.id),['nba:l','nba:p','nba:f']);assert.equal(rows[0].detail,'3:32 - 3rd');assert.deepEqual(rows[0].teams.map(x=>x.name),['ATL','ORL']);assert.equal(rows[0].teams[0].logo,undefined);assert.equal(rows[1].teams[0].score,null);assert.deepEqual(B.games(docs,'',now),[]);});
test('tennis names and golf tournament status never fabricate two-team scores',()=>{const tennis={league:'atp',events:[{id:'t',date:'2026-10-21T12:00Z',status:{type:{state:'in',shortDetail:'Set 2'}},competitions:[{id:'m',competitors:[{athlete:{displayName:'Player A'},score:'1'},{athlete:{displayName:'Player B'},score:'0'}]}]}]};assert.equal(B.games([tennis],'tennis',now)[0].teams[0].name,'Player A');const golf={league:'pga',events:[{id:'g',date:'2026-10-18T12:00Z',name:'Tournament',status:{type:{state:'in',detail:'Round 3'}},competitions:[{id:'g',competitors:[]}]}]};assert.equal(B.games([golf],'golf',now)[0].tournament,true);assert.deepEqual(B.games([golf],'golf',now)[0].teams,[]);});
test('game selection uses verified ESPN identity and the matching sport, never names',()=>{const feed={slug:'nba-cha-bkn-2026-10-21',game_context:{event_id:'401909836'}};assert.equal(B.matches(feed,'nba:401909836'),true);assert.equal(B.matches(feed,'nba:401909837'),false);assert.equal(B.matches({...feed,slug:'nhl-cha-bkn-2026-10-21'},'nba:401909836'),false);assert.equal(B.matches({slug:feed.slug,game:'Hornets vs Nets'},'nba:401909836'),false);assert.equal(B.matches(feed,null),false);});
test('college filters bridge missing feed context using a unique snapshot team pair and date',()=>{
 const e=event('college','in');e.competitions[0].competitors[0].team.abbreviation='APP';e.competitions[0].competitors[1].team.abbreviation='JMU';
 const docs=[{league:'cfb',events:[e]}],feed={slug:'cfb-jmad-applst-2026-10-21',game_context:{available:false}};
 B.games(docs,'ncaaf',now);assert.equal(B.matches(feed,'cfb:college'),true);
 assert.equal(B.matches({...feed,slug:'ncaaf-jmad-applst-2026-10-21'},'cfb:college'),true);
 for(const slug of ['cfb-applst-jmad-2026-10-21','cfb-jmad-applst-2026-10-20','cfb-librty-kenest-2026-10-21','nba-jmad-applst-2026-10-21'])assert.equal(B.matches({...feed,slug},'cfb:college'),false);
 assert.equal(B.matches({...feed,game_context:{event_id:'different'}},'cfb:college'),false);
 B.games([{league:'cfb',events:[e,{...e,id:'second',competitions:[{...e.competitions[0],id:'second'}]}]}],'ncaaf',now);assert.equal(B.matches(feed,'cfb:college'),false);
 B.games([],'ncaaf',now);assert.equal(B.matches(feed,'cfb:college'),false);
});
