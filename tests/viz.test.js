// node tests/viz.test.js — pure helpers in js/viz.js (made-up data, no network).
const assert = require('assert');
const V = require('../js/viz.js');
const p = V.parseProp({ question: 'Will Jayson Tatum record at least 15 points in BOS Celtics vs. DET Pistons?', eventSlug: 'nba-bos-det-2026-10-20' });
assert.deepStrictEqual([p.player, p.league, p.n, p.stat.key, p.away, p.home], ['Jayson Tatum', 'nba', 15, 'pts', 'bos', 'det']);
assert.strictEqual(V.parseProp({ text: 'Cutter Gauthier 1+ points — YES', marketSlug: 'astatc-nhl-ana-nyr-2026-10-19-pts-cutgau-gte1' }).league, 'nhl');
assert.strictEqual(V.parseProp({ question: 'Will X Y record at least 30 combined points, rebounds and assists in A?', eventSlug: 'nba-a-b-2026-10-20' }).stat.key, 'pra');
assert.strictEqual(V.parseProp({ question: 'Will X Y record at least 2 three-point field goals made in A?', eventSlug: 'nba-a-b-2026-10-20' }).stat.key, 'threes');
assert.strictEqual(V.parseProp({ text: 'Under 51.5', eventSlug: 'nfl-was-sf-2026-10-19' }), null);
const log = { names: ['points', 'totalRebounds'], events: { 1: { gameDate: '2026-01-01', opponent: { abbreviation: 'DET' }, team: { abbreviation: 'BOS' } }, 2: { gameDate: '2026-01-03', opponent: { abbreviation: 'NY' } }, 3: { gameDate: '2025-10-01' } },
  seasonTypes: [{ displayName: '2025-26 Regular Season', categories: [{ events: [{ eventId: '1', stats: ['20', '5'] }, { eventId: '2', stats: ['10', '7'] }] }] },
                { displayName: '2025-26 Preseason', categories: [{ events: [{ eventId: '3', stats: ['40', '1'] }] }] }] };
const g = V.gamesFromLog(log, V.statOf('points'));
assert.deepStrictEqual(g.map(x => x.value), [10, 20]);           // newest first, preseason dropped
assert.deepStrictEqual(V.summary(g, 15), { hits: 1, total: 2, avg: 15 });
assert.strictEqual(V.pickGames(g, 'H2H', 'det').length, 1);
assert.strictEqual(V.pickGames(g, 'L5').length, 2);
const h = { t0: '2026-10-20T18:00:00Z', ids: { s1: '9' }, marks: [[30, 'Q2 · A 1–B 2']], m: { 9: [[0, 40], [10, 45]] } };
const s = V.seriesFor(h, { marketSlug: 's1' }, 1);
assert.deepStrictEqual(s.points.map(x => x.chance), [60, 55]);
assert.strictEqual(s.marks.length, 1);
assert.strictEqual(V.american(40), '+150');
assert.strictEqual(V.slugFromUrl('https://polymarket.us/sports/nba/nba-bos-det-2026-10-20'), 'nba-bos-det-2026-10-20');
console.log('viz ok');
