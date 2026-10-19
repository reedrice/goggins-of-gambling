/**
 * tests/positions.test.js — player-name matching and position lookup
 * (js/positions.js). Run: node tests/positions.test.js
 * Covers accents, Jr./III, initials (C.J. / CJ / "J. Smith"), hyphens and
 * apostrophes, and the "never guess" rule (ambiguous or unknown = no badge).
 */
const assert = require('assert');
const P = require('../js/positions.js');
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

test('normName folds accents, suffixes, initials, punctuation', () => {
  const eq = (a, b) => assert.strictEqual(P.normName(a), P.normName(b), `${a} vs ${b}`);
  eq('Luka Dončić', 'Luka Doncic');
  eq('Ronald Acuña Jr.', 'Ronald Acuna');
  eq('Marvin Harrison Jr.', 'Marvin Harrison');
  eq('Kenneth Walker III', 'Kenneth Walker');
  eq('C.J. Stroud', 'CJ Stroud');
  eq('A. J. Brown', 'AJ Brown');
  eq("De'Aaron Fox", 'DeAaron Fox');
  eq('Karl-Anthony Towns', 'Karl Anthony Towns');
  eq('Jesperi Kotkaniemi', '  JESPERI   kotkaniemi ');
  eq('Martin Ødegaard', 'Martin Odegaard');
  assert.strictEqual(P.normName('Brock Purdy'), 'brock purdy');
  assert.strictEqual(P.normName(''), '');
  assert.strictEqual(P.normName(null), '');
});

const sf = [{ name: 'Brock Purdy', pos: 'QB' }, { name: 'Christian McCaffrey', pos: 'RB' }, { name: 'George Kittle', pos: 'TE' },
  { name: 'Mac Jones', pos: 'QB' }, { name: 'Jauan Jennings', pos: 'WR' }, { name: 'Ricky Pearsall', pos: 'WR' }];
const was = [{ name: 'Jayden Daniels', pos: 'QB' }, { name: 'Terry McLaurin', pos: 'WR' }, { name: 'Brian Robinson Jr.', pos: 'RB' }];
const league = sf.concat(was, [{ name: 'Josh Allen', pos: 'QB' }, { name: 'Josh Allen', pos: 'LB' }, { name: 'Mike Smith', pos: 'WR' }, { name: 'Mike Smith', pos: 'TE' }]);

test('exact match on the team', () => {
  assert.deepStrictEqual(P.matchName('Brock Purdy', sf, league), { pos: 'QB', how: 'team' });
  assert.deepStrictEqual(P.matchName('Brian Robinson', was, league), { pos: 'RB', how: 'team' }, 'Jr. dropped on one side');
});
test('traded player: unique exact match in the league', () => {
  assert.deepStrictEqual(P.matchName('Terry McLaurin', sf, league), { pos: 'WR', how: 'league' });
});
test('first initial + last name', () => {
  assert.deepStrictEqual(P.matchName('B. Purdy', sf, league), { pos: 'QB', how: 'initial' });
  assert.deepStrictEqual(P.matchName('J. Jennings', sf, league), { pos: 'WR', how: 'initial' });
});
test('short / long first name', () => {
  assert.deepStrictEqual(P.matchName('Chris McCaffrey', sf, league), { pos: 'RB', how: 'nickname' });
  assert.deepStrictEqual(P.matchName('Rick Pearsall', sf, league), { pos: 'WR', how: 'nickname' });
});
test('never guesses', () => {
  assert.strictEqual(P.matchName('Josh Allen', [], league), null, 'two Josh Allens with different positions');
  assert.strictEqual(P.matchName('Mike Smith', [], league), null);
  assert.strictEqual(P.matchName('Nobody Here', sf, league), null);
  assert.strictEqual(P.matchName('Purdy', sf, league), null, 'last name alone is not enough');
  assert.strictEqual(P.matchName('Bo Purdy', sf, league), null, 'different first name');
  assert.strictEqual(P.matchName('', sf, league), null);
  const two = [{ name: 'Tyler Smith', pos: 'C' }, { name: 'Tom Smith', pos: 'D' }];
  assert.strictEqual(P.matchName('T. Smith', two, two), null, 'ambiguous initial');
});
test('same name twice with the same position still matches', () => {
  const dup = [{ name: 'Will Smith', pos: 'C' }, { name: 'Will Smith', pos: 'C' }];
  assert.deepStrictEqual(P.matchName('Will Smith', dup, dup), { pos: 'C', how: 'team' });
});

const doc = { leagues: {
  nfl: { names: { QB: 'Quarterback' }, players: { [P.key('sf', 'Brock Purdy')]: 'QB' } },
  mlb: { names: { SP: 'Starting Pitcher', RP: 'Relief Pitcher' }, players: { [P.key('tb', 'Shane McClanahan')]: 'SP', [P.key('tb', 'Pete Fairbanks')]: 'RP' } },
  nba: { names: { PG: 'Point Guard' }, players: { [P.key('nyk', 'Jalen Brunson')]: 'PG' } },
  xyz: { names: { ZZ: 'Zone Zapper' }, players: { [P.key('aa', 'Ann Able')]: 'ZZ' } }
} };
test('lookup works for any league from the data alone', () => {
  assert.deepStrictEqual(P.lookup(doc, 'nfl', 'sf', 'Brock Purdy'), { abbr: 'QB', name: 'Quarterback' });
  assert.deepStrictEqual(P.lookup(doc, 'NBA', 'NYK', 'Jalen Brunson'), { abbr: 'PG', name: 'Point Guard' });
  assert.deepStrictEqual(P.lookup(doc, 'mlb', 'tb', 'Pete Fairbanks'), { abbr: 'RP', name: 'Relief Pitcher' });
  assert.deepStrictEqual(P.lookup(doc, 'xyz', 'aa', 'Ann Able'), { abbr: 'ZZ', name: 'Zone Zapper' }, 'made-up future sport');
  assert.deepStrictEqual(P.lookup(doc, 'nfl', '', 'Brock Purdy'), { abbr: 'QB', name: 'Quarterback' }, 'unique name, no team');
  assert.strictEqual(P.lookup(doc, 'nfl', 'sf', 'Nobody'), null);
  assert.strictEqual(P.lookup(doc, 'nhl', 'sj', 'Brock Purdy'), null);
  assert.strictEqual(P.lookup(null, 'nfl', 'sf', 'Brock Purdy'), null);
});
test('badge / label / inText escape and place the badge', () => {
  P.doc = doc;
  assert.strictEqual(P.label('nfl', 'sf', 'Brock Purdy'), 'Brock Purdy · QB');
  assert.strictEqual(P.label('nfl', 'sf', 'Nobody'), 'Nobody');
  assert.match(P.badge('nfl', 'sf', 'Brock Purdy'), /class="pos-badge".*data-tip-text="QB = Quarterback".*>QB<\/button>$/);
  assert.strictEqual(P.badge('nfl', 'sf', 'Nobody'), '');
  const h = P.inText('Brock Purdy 250+ <b>yards</b>', 'nfl', 'sf', 'Brock Purdy');
  assert.match(h, /^Brock Purdy <button[^>]*>QB<\/button> 250\+ &lt;b&gt;yards/);
  assert.strictEqual(P.inText('Nobody <x>', 'nfl', 'sf', 'Nobody'), 'Nobody &lt;x&gt;');
  P.doc = null;
});

console.log(fails ? `${fails} failing` : 'all passed');
process.exit(fails ? 1 : 0);
