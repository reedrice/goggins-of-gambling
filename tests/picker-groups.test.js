/**
 * tests/picker-groups.test.js — grouping of Build-a-bet results
 * (js/picker-groups.js): Game -> Game bets (type) / Player props
 * (stat category -> player), counts, line order, default open state, speed.
 * Run: node tests/picker-groups.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const F = require('../js/picker-filters.js');
const G = require('../js/picker-groups.js');
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

const nfl = { slug: 'nfl-was-sf-2026-10-19', league: 'nfl', sport: 'NFL', start_time: '2026-10-20T00:15:00Z', teams: [{ abbr: 'was' }, { abbr: 'sf' }] };
const mlb = { slug: 'mlb-cle-tb-2026-10-19', league: 'mlb', sport: 'MLB', start_time: '2026-10-20T00:08:00Z', teams: [{ abbr: 'cle' }, { abbr: 'tb' }] };
const prop = (player, team, stat, line) => ({ id: `${player}-${stat}-${line}`, group: 'props', type: 'prop', smt: `football_player_${stat}`, player, team, line, label: `${player} ${line}+ ${stat}` });
const M = {
  ml: { id: 'ml', group: 'lines', type: 'moneyline', smt: 'x_full_game_winner', label: 'Who wins' },
  sp35: { id: 'sp35', group: 'lines', type: 'spread', line: -3.5, label: 'SF -3.5' },
  sp15: { id: 'sp15', group: 'lines', type: 'spread', line: 1.5, label: 'SF +1.5' },
  tot: { id: 'tot', group: 'lines', type: 'total', line: 44.5, label: 'Over 44.5' },
  h1: { id: 'h1', group: 'other', type: 'spread', line: 2.5, label: '1st half' },
  p225: prop('Brock Purdy', 'sf', 'passing_yards', 225), p175: prop('Brock Purdy', 'sf', 'passing_yards', 175), p200: prop('Brock Purdy', 'sf', 'passing_yards', 200),
  d200: prop('Jayden Daniels', 'was', 'passing_yards', 200), prush: prop('Brock Purdy', 'sf', 'rushing_yards', 10), krec: prop('George Kittle', 'sf', 'receptions', 4)
};
const hitsNfl = Object.values(M).map(m => ({ ev: nfl, m, s: 1 }));
const under = { id: 'under', group: 'lines', type: 'total', line: 6.5, label: 'Under 6.5' };

test('games first, in start-time order, with counts', () => {
  const t = G.build(hitsNfl.concat([{ ev: mlb, m: under, s: 1 }]));
  assert.deepStrictEqual(t.games.map(g => g.key), ['mlb-cle-tb-2026-10-19', 'nfl-was-sf-2026-10-19']);
  assert.strictEqual(t.total, 12); assert.strictEqual(t.games[1].count, 11);
});
test('search: best-matching game first', () => {
  const t = G.build([{ ev: mlb, m: under, s: 1 }, { ev: nfl, m: M.ml, s: 5 }], { searching: true });
  assert.strictEqual(t.games[0].key, nfl.slug);
});
test('game bets: Who wins / Spread / Total / Other, in that order; spreads by size of line', () => {
  const g = G.build(hitsNfl).games[0];
  const team = g.children[0];
  assert.strictEqual(team.kind, 'team'); assert.strictEqual(team.count, 5);
  assert.deepStrictEqual(team.children.map(c => c.key + ':' + c.count), ['moneyline:1', 'spread:2', 'total:1', 'other:1']);
  assert.deepStrictEqual(team.children[1].items.map(m => m.id), ['sp15', 'sp35']);
});
test('player props: one dropdown per stat category, then players, lines low to high', () => {
  const pr = G.build(hitsNfl).games[0].children[1];
  assert.strictEqual(pr.kind, 'prop'); assert.strictEqual(pr.count, 6);
  assert.deepStrictEqual(pr.children.map(c => c.key + ':' + c.count), ['passing_yards:4', 'rushing_yards:1', 'receptions:1']);
  const py = pr.children[0];
  assert.deepStrictEqual(py.children.map(p => p.player), ['Brock Purdy', 'Jayden Daniels']);
  assert.deepStrictEqual(py.children[0].items.map(m => m.line), [175, 200, 225]);
  assert.strictEqual(py.children[0].team, 'sf');
});
test('player filter keeps categories, only that player', () => {
  const f = Object.assign(F.defaults('*'), { team: 'nfl:sf', player: 'Brock Purdy' });
  const hits = hitsNfl.filter(h => F.marketPasses(nfl, h.m, f));
  const t = G.build(hits);
  const pr = t.games[0].children;
  assert.strictEqual(pr.length, 1); assert.strictEqual(pr[0].kind, 'prop');
  assert.deepStrictEqual(pr[0].children.map(c => c.key), ['passing_yards', 'rushing_yards']);
  assert.ok(pr[0].children.every(c => c.children.length === 1 && c.children[0].player === 'Brock Purdy'));
  assert.strictEqual(G.defaultOpen(t, f).size, t.index.size, 'player filter opens everything');
});
test('default open: few results open everything; many results stay folded', () => {
  const small = G.build(hitsNfl);
  assert.strictEqual(G.defaultOpen(small, F.defaults('*')).size, small.index.size);
  const many = [];
  for (let i = 0; i < 6; i++) {
    const ev = Object.assign({}, nfl, { slug: 'nfl-g' + i + '-x-2026-10-19', start_time: '2026-10-2' + i + 'T00:00:00Z' });
    for (let j = 0; j < 80; j++) many.push({ ev, m: prop('P' + (j % 9), 'sf', j % 2 ? 'receptions' : 'rushing_yards', j), s: 1 });
  }
  const t = G.build(many);
  assert.strictEqual(G.defaultOpen(t, F.defaults('*')).size, 0, '6 games x 80 bets: all closed');
  const withTeam = G.defaultOpen(t, Object.assign(F.defaults('*'), { team: 'nfl:sf' }));
  assert.ok(t.games.every(g => withTeam.has(g.id) && withTeam.has(g.children[0].id)), 'team filter opens games + sections');
});
test('ids are stable and unique', () => {
  const a = G.build(hitsNfl), b = G.build(hitsNfl.slice().reverse());
  assert.deepStrictEqual([...a.index.keys()].sort(), [...b.index.keys()].sort());
  assert.ok(a.index.has('g|nfl-was-sf-2026-10-19|prop|passing_yards|Brock Purdy'));
});
const real = path.join(__dirname, '../data/markets/events/nfl-was-sf-2026-10-19.json');
if (fs.existsSync(real)) test('real ~700-bet game groups in well under 50 ms', () => {
  const ev = JSON.parse(fs.readFileSync(real, 'utf8'));
  const hits = ev.markets.map(m => ({ ev, m, s: 1 }));
  const t0 = process.hrtime.bigint();
  const t = G.build(hits);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 50, 'took ' + ms.toFixed(1) + ' ms');
  assert.strictEqual(t.games[0].count, ev.markets.length);
  const sum = n => (n.items ? n.items.length : n.children.reduce((a, c) => a + sum(c), 0));
  assert.strictEqual(sum(t.games[0]), ev.markets.length, 'every market lands in exactly one leaf');
});
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
