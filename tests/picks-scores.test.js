const test = require('node:test');
const assert = require('node:assert/strict');
const {liveGames, groupGames, dates} = require('../js/picks-scores.js');
const event = (id, state='in', extra={}) => ({id, competitions:[{status:{type:{state,shortDetail:'Q3 4:32',completed:state==='post'}}, competitors:[{homeAway:'home',team:{shortDisplayName:'Home'},score:'92'},{homeAway:'away',team:{shortDisplayName:'Away'},score:'94'}]}], ...extra});
test('shows all live games, regardless of picks; away/home order and zero score retained',()=>{
 const e=event('not-a-pick');e.competitions[0].competitors[1].score='0';
 assert.deepEqual(liveGames({events:[e]},'NBA')[0],{id:'not-a-pick',league:'NBA',away:'Away',home:'Home',awayLogo:null,homeLogo:null,awayScore:'0',homeScore:'92',detail:'Q3 4:32'});
});
test('scheduled and completed games do not appear',()=>assert.equal(liveGames({events:[event('a','pre'),event('b','post')]},'NBA').length,0));
test('halftime remains live; incomplete games and unknown scores are omitted',()=>{
 const half=event('h');half.competitions[0].status.type.shortDetail='Halftime';
 const missing=event('m');delete missing.competitions[0].competitors[0].score;
 assert.deepEqual(liveGames({events:[half,missing,{id:'x'}]},'NHL').map(g=>g.id),['h']);
});
test('league groups are contiguous and duplicate event ids do not repeat',()=>{
 const nba=liveGames({events:[event('1'),event('2')]},'NBA'); const nhl=liveGames({events:[event('3')]},'NHL');
 const groups=groupGames([nba,nhl,[nba[0]]]);assert.deepEqual(groups.map(g=>[g.league,g.games.length]),[['NBA',2],['NHL',1]]);
});
test('soccer competitions group by their own league',()=>{
 const a=event('1','in',{links:[{href:'https://www.espn.com/soccer/team-stats/_/gameId/1/league/eng.1'}]});
 assert.equal(liveGames({events:[a]},'Soccer')[0].league,'eng.1');
});
test('yesterday/today CT range covers midnight and DST',()=>{
 assert.deepEqual(dates(new Date('2026-10-21T02:00:00Z')),['20261019','20261020']);
 assert.deepEqual(dates(new Date('2026-10-21T06:00:00Z')),['20261020','20261021']);
 assert.deepEqual(dates(new Date('2026-11-02T06:30:00Z')),['20261101','20261102']);
});

test('upcoming fallback includes only future games today in CT',()=>{
 const now=new Date('2026-10-21T01:00:00Z');
 const scheduled=(id,date,name='STATUS_SCHEDULED')=>{const e=event(id,'pre',{date});e.competitions[0].status.type.name=name;return e;};
 const board={events:[scheduled('tonight','2026-10-21T03:30:00Z'),scheduled('tomorrow','2026-10-21T19:00:00Z'),scheduled('past','2026-10-20T20:00:00Z'),scheduled('postponed','2026-10-21T03:30:00Z','STATUS_POSTPONED')]};
 assert.deepEqual(liveGames(board,'NBA','upcoming',now).map(g=>g.id),['tonight']);
});

test('uses scoreboard team logos and accepts only HTTPS images',()=>{
 const e=event('logos');const [home,away]=e.competitions[0].competitors;
 away.team.logo='https://a.espncdn.com/away.png';home.team.logo='javascript:alert(1)';
 home.team.logos=[{href:'https://a.espncdn.com/home.png'}];
 const game=liveGames({events:[e]},'NBA')[0];
 assert.equal(game.awayLogo,away.team.logo);assert.equal(game.homeLogo,home.team.logos[0].href);
 home.team.logos=[];assert.equal(liveGames({events:[e]},'NBA')[0].homeLogo,null);
});

 test('college sports use the same verified team score handling',()=>assert.equal(liveGames({events:[event('cfb')]},'NCAAF')[0].league,'NCAAF'));
 test('tennis reads individual matches and set games, not the tournament status',()=>{const match={id:'match',date:'2026-10-21T01:00:00Z',status:{type:{state:'in',completed:false,shortDetail:'2nd set'}},competitors:[{homeAway:'away',athlete:{shortName:'A. Player'},linescores:[{value:6},{value:2}]},{homeAway:'home',athlete:{shortName:'B. Player'},linescores:[{value:4},{value:3}]}]};const board={events:[{id:'tournament',status:{type:{state:'post',completed:true}},groupings:[{competitions:[match]}]}]};const rows=liveGames(board,'ATP');assert.equal(rows.length,1);assert.equal(rows[0].awayScore,'6, 2');assert.equal(rows[0].home,'B. Player');match.status.type.state='post';match.status.type.completed=true;assert.equal(liveGames(board,'ATP').length,0);});
 test('golf shows tournament status without fabricated head-to-head scores',()=>{const e=event('golf');e.name='Test Championship';e.competitions[0].competitors=[];const r=liveGames({events:[e]},'PGA')[0];assert.equal(r.tournament,true);assert.equal(r.away,'Test Championship');assert.equal(r.awayScore,null);});


test('sport filtering keeps NFL and NCAA football separate; All restores both',()=>{
 const {snapshotFor}=require('../js/picks-scores.js');
 const docs=[{league:'nfl',events:[event('nfl-live')]},{league:'cfb',events:[event('college-live')]},{league:'nba',events:[event('nba-live')]}];
 assert.deepEqual(snapshotFor(docs,'NFL').groups.flatMap(g=>g.games.map(e=>e.id)),['nfl-live']);
 assert.deepEqual(snapshotFor(docs,'NCAAF').groups.flatMap(g=>g.games.map(e=>e.id)),['college-live']);
 assert.equal(snapshotFor(docs,'').groups.length,3);
});
test('upcoming fallback is selected-sport specific even when other sports are live',()=>{
 const {snapshotFor}=require('../js/picks-scores.js');const now=new Date('2026-10-23T15:00:00Z');
 const docs=[{league:'nba',events:[event('nba-live')]},{league:'cfb',events:[event('cfb-next','pre',{date:'2026-10-23T20:00:00Z'})]}];
 const result=snapshotFor(docs,'NCAAF',now);assert.equal(result.upcoming,true);assert.equal(result.groups[0].games[0].id,'cfb-next');
 assert.deepEqual(snapshotFor(docs,'NFL',now).groups,[]);
});
test('normalized tennis snapshots keep match data and do not leak into football',()=>{
 const {snapshotFor}=require('../js/picks-scores.js');
 const match=event('tennis');match.competitions[0].competitors.forEach((c,i)=>{delete c.team;c.athlete={displayName:'Player '+i};c.linescores=[{value:i+1}];});
 const docs=[{league:'atp',events:[match]}];
 assert.equal(snapshotFor(docs,'Tennis').groups[0].games[0].id,'tennis');assert.deepEqual(snapshotFor(docs,'NFL').groups,[]);
});
