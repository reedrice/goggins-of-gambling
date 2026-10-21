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
