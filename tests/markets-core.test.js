/**
 * tests/markets-core.test.js — team display names (fullName) for every
 * league, incl. the NBA ("76ers" + "Philadelphia"), and the NBA prop
 * buckets used by the Build-a-bet filters. Run: node tests/markets-core.test.js
 */
const assert = require('assert');
const M = require('../js/markets-core.js');
const PF = require('../js/picker-filters.js');
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

test('fullName joins city + nickname when Polymarket splits them (NBA)', () => {
  assert.strictEqual(M.fullName({ name: '76ers', safeName: 'Philadelphia', abbreviation: 'phi' }), 'Philadelphia 76ers');
  assert.strictEqual(M.fullName({ name: 'Lakers', safeName: 'Los Angeles L', abbreviation: 'lal' }), 'Los Angeles Lakers');
  assert.strictEqual(M.fullName({ name: 'Celtics', safeName: 'Boston', abbreviation: 'bos' }), 'Boston Celtics');
});
test('fullName keeps names that are already complete', () => {
  assert.strictEqual(M.fullName({ name: 'San Francisco 49ers', safeName: '49ers', abbreviation: 'sf' }), 'San Francisco 49ers');
  assert.strictEqual(M.fullName({ name: 'San Jose', safeName: 'San Jose Sharks', abbreviation: 'sj' }), 'San Jose Sharks');
  assert.strictEqual(M.fullName({ name: 'Golden State', abbreviation: 'gsv' }), 'Golden State');
  assert.strictEqual(M.fullName(null), '');
});
test('NBA props land in their own categories', () => {
  const b = smt => PF.propBucket({ type: 'prop', smt });
  assert.strictEqual(b('basketball_player_points'), 'points');
  assert.strictEqual(b('basketball_player_rebounds'), 'rebounds');
  assert.strictEqual(b('basketball_player_threes'), 'threes');
  assert.strictEqual(b('basketball_player_points_rebounds_assists'), 'combos');
  assert.strictEqual(b('basketball_player_double_double'), 'combos');
  assert.strictEqual(b('basketball_player_assists'), 'assists');
  assert.strictEqual(b('basketball_player_blocks'), 'defense');
});

console.log(fails ? `${fails} failing` : 'all passed');
process.exit(fails ? 1 : 0);
