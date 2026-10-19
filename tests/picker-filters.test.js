/**
 * tests/picker-filters.test.js — rules of the Build-a-bet filter tree
 * (js/picker-filters.js). Run: node tests/picker-filters.test.js
 * Uses the real 49ers game snapshot when present, plus small fixtures.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../js/picker-filters.js');

let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

const ev = {
  slug: 'nfl-was-sf-2026-10-19', date: '2026-10-19', sport: 'NFL', league: 'nfl',
  teams: [{ abbr: 'was', short: 'Commanders' }, { abbr: 'sf', short: '49ers' }],
  players: [['Brock Purdy', 'sf'], ['Jayden Daniels', 'was'], ['George Kittle', 'sf']],
  markets: [
    { id: 'ml', group: 'lines', type: 'moneyline', smt: 'football_team_full_game_winner' },
    { id: 'sp', group: 'lines', type: 'spread', smt: 'football_team_full_game_spread' },
    { id: 'tot', group: 'lines', type: 'total', smt: 'football_game_full_game_total' },
    { id: 'h1', group: 'other', type: 'spread', smt: 'football_team_first_half_spread' },
    { id: 'pint', group: 'props', type: 'prop', smt: 'football_player_interceptions_thrown', player: 'Brock Purdy', team: 'sf' },
    { id: 'pyds', group: 'props', type: 'prop', smt: 'football_player_passing_yards', player: 'Brock Purdy', team: 'sf' },
    { id: 'krec', group: 'props', type: 'prop', smt: 'football_player_receptions', player: 'George Kittle', team: 'sf' },
    { id: 'dtd', group: 'props', type: 'prop', smt: 'football_player_passing_touchdowns', player: 'Jayden Daniels', team: 'was' }
  ]
};
const pass = f => ev.markets.filter(m => F.eventPasses(ev, f) && F.marketPasses(ev, m, f)).map(m => m.id);
const st = o => Object.assign(F.defaults('2026-10-19'), o);

test('defaults pass everything and are not narrowed', () => {
  assert.strictEqual(pass(st({})).length, ev.markets.length);
  assert.strictEqual(F.isNarrowed(st({})), false);
});
test('day and sport filter the game', () => {
  assert.deepStrictEqual(pass(st({ day: '2026-10-20' })), []);
  assert.deepStrictEqual(pass(st({ sport: 'NHL' })), []);
  assert.strictEqual(pass(st({ day: '*' })).length, ev.markets.length);
});
test('team sub-types', () => {
  assert.strictEqual(F.teamSub(ev.markets[3]), 'other', 'first-half spread is "other"');
  assert.deepStrictEqual(pass(st({ propOn: false, teamOff: ['other', 'total'] })), ['ml', 'sp']);
});
test('prop buckets', () => {
  const b = id => F.propBucket(ev.markets.find(m => m.id === id));
  assert.strictEqual(b('pint'), 'passing');
  assert.strictEqual(b('pyds'), 'yards');
  assert.strictEqual(b('krec'), 'receptions');
  assert.strictEqual(b('dtd'), 'tds');
  assert.strictEqual(F.propBucket({ smt: 'baseball_player_hits_allowed' }), 'pitching');
  assert.strictEqual(F.propBucket({ smt: 'baseball_player_hits' }), 'hits');
  assert.strictEqual(F.propBucket({ smt: 'hockey_player_goals' }), 'goals');
  assert.strictEqual(F.propBucket({ smt: 'curling_player_stones' }), 'other');
});
test('team: game bets of that game + only that team\'s player props', () => {
  assert.deepStrictEqual(pass(st({ team: 'nfl:sf' })), ['ml', 'sp', 'tot', 'h1', 'pint', 'pyds', 'krec']);
  assert.deepStrictEqual(pass(st({ team: 'nfl:sf', teamOn: false })), ['pint', 'pyds', 'krec']);
  assert.deepStrictEqual(pass(st({ team: 'nhl:sf' })), [], 'league is part of the team key');
});
test('player: only that player\'s props', () => {
  assert.deepStrictEqual(pass(st({ team: 'nfl:sf', player: 'Brock Purdy' })), ['pint', 'pyds']);
  assert.deepStrictEqual(pass(st({ team: 'nfl:sf', player: 'Brock Purdy', propOff: ['yards'] })), ['pint']);
});
test('dropdown options', () => {
  assert.deepStrictEqual(F.teamOptions([ev]).map(t => t.key), ['nfl:sf', 'nfl:was']);
  assert.deepStrictEqual(F.playerOptions([ev], 'nfl:sf'), ['Brock Purdy', 'George Kittle']);
});
test('sub counts ignore the checkboxes but respect team', () => {
  const c = F.subCounts([ev], st({ team: 'nfl:sf', propOn: false }));
  assert.deepStrictEqual(c.prop, { passing: 1, yards: 1, receptions: 1 });
  assert.strictEqual(c.team.moneyline, 1);
});
test('sanitize drops bad or stale saved state', () => {
  const s = F.sanitize({ day: '2020-01-01', sport: 5, teamOff: ['x', 7], propOn: false }, ['2026-10-19'], '2026-10-19');
  assert.strictEqual(s.day, '2026-10-19'); assert.strictEqual(s.sport, ''); assert.deepStrictEqual(s.teamOff, ['x']); assert.strictEqual(s.propOn, false);
  assert.deepStrictEqual(F.sanitize(null, [], 'd'), F.defaults('d'));
});
const real = path.join(__dirname, '../data/markets/events/nfl-was-sf-2026-10-19.json');
if (fs.existsSync(real)) test('real snapshot: 49ers props exist and pass the 49ers + props filter', () => {
  const e = JSON.parse(fs.readFileSync(real, 'utf8'));
  const f = st({ day: e.date, team: 'nfl:sf', teamOn: false });
  const got = e.markets.filter(m => F.marketPasses(e, m, f));
  assert.ok(got.length > 50, 'expected many 49ers props, got ' + got.length);
  assert.ok(got.every(m => m.team === 'sf' && m.player));
});

console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
