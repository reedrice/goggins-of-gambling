// Dig deeper: position -> stats map + pure helpers (HANDOFF §57)
const assert = require('assert'), D = require('../js/dig-deeper.js');
const keys = (lg, pos, names) => D.statsFor(lg, pos, names).map(x => x.key);
const nhlSk = ['goals', 'assists', 'points', 'shotsTotal', 'timeOnIcePerGame', 'powerPlayGoals', 'powerPlayAssists'];
const nhlG = ['saves', 'savePct', 'goalsAgainst', 'shotsAgainst'];
assert.ok(!keys('nhl', 'C', nhlSk.concat(nhlG)).some(k => ['saves', 'svp', 'ga', 'sa'].includes(k)));   // skaters never see goalie stats
assert.ok(!keys('nhl', 'D', nhlSk.concat(nhlG)).includes('svp'));
assert.deepStrictEqual(keys('nhl', 'G', nhlSk.concat(nhlG)), ['saves', 'svp', 'ga', 'sa']);
assert.strictEqual(D.posGroup('nfl', 'QB'), 'QB'); assert.strictEqual(D.posGroup('nfl', 'TE'), 'TE'); assert.strictEqual(D.posGroup('nfl', 'PK'), 'K'); assert.strictEqual(D.posGroup('nfl', 'LB'), 'DEF');
const wr = keys('nfl', 'WR', ['receptions', 'receivingTargets', 'receivingYards', 'receivingTouchdowns', 'rushingYards', 'passingYards']);
assert.ok(wr.includes('tgt') && !wr.includes('passYd'));
assert.ok(keys('nfl', 'QB', ['passingYards', 'rushingYards']).includes('passYd'));
assert.strictEqual(D.posGroup('mlb', 'SP'), 'P'); assert.strictEqual(D.posGroup('mlb', 'RF'), 'H');
assert.ok(!keys('mlb', 'RF', ['hits', 'strikeouts', 'innings', 'pitches']).includes('outs'));
assert.strictEqual(D.posGroup('nba', 'PG'), 'G'); assert.strictEqual(D.posGroup('nba', 'C'), 'C'); assert.strictEqual(D.posGroup('nba', 'F'), 'F');
const log = { names: ['minutes', 'fieldGoalsMade-fieldGoalsAttempted', 'points', 'timeOnIcePerGame'], events: { 1: { gameDate: '2026-10-01', opponent: { abbreviation: 'NY' }, atVs: '@' } },
  seasonTypes: [{ displayName: '2026-27 Regular Season', categories: [{ events: [{ eventId: 1, stats: ['34', '9-20', '25', '18:30'] }] }] }] };
assert.strictEqual(D.rows(log, 'fga')[0].value, 20); assert.strictEqual(D.rows(log, 'toi')[0].value, 18.5); assert.strictEqual(D.rows(log, 'pts')[0].home, false);
const sh = D.shares([{ name: 'A', targets: 6 }, { name: 'B', targets: 3 }, { name: 'A', targets: 3 }, { name: 'C', targets: 3 }]);
assert.deepStrictEqual(sh.map(x => [x.name, Math.round(x.share * 100)]), [['A', 60], ['B', 20], ['C', 20]]);
console.log('dig-deeper ok');
