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
{ const p = V.parseProp({ question: 'Will Jayson Tatum record at least 25 points in A?', eventSlug: 'nba-bos-det-2026-10-20' });
  const mk = (id, q, b, a, t = 'basketball_player_points') => ({ id, slug: 's' + id, sportsMarketType: t, active: true, closed: false, question: q, bestBidQuote: { value: b }, bestAskQuote: { value: a } });
  const ev = { markets: [mk(1, 'Will Jayson Tatum record at least 30 points in A?', '0.35', '0.38'), mk(2, 'Will Jayson Tatum record at least 25 points in A?', '0.6', '0.62'),
    mk(3, 'Will Jayson Tatum record at least 8 total rebounds in A?', '0.6', '0.62', 'basketball_player_rebounds'), mk(4, 'Will Jaylen Brown record at least 25 points in A?', '0.5', '0.52'),
    mk(5, 'Will Jayson Tatum record at least 30 combined points, rebounds and assists in A?', '0.7', '0.72', 'basketball_player_points_rebounds_assists')] };
  const L = V.siblingLines(ev, p);
  assert.deepStrictEqual(L.map(x => x.n), [25, 30]);            // same player + stat only, sorted
  assert.strictEqual(Math.round(L[1].yesBuy), 38); assert.strictEqual(Math.round(L[1].noBuy), 65);
  console.log('viz lines ok'); }
{ const V = require('../js/viz.js'); const assert = require('assert');
  const j = { history: [{ timestamp: 100, longPrice: 0.61, shortPrice: 0.41 }, { timestamp: 200, longPrice: 0, shortPrice: 1 }] };
  assert.deepStrictEqual(V.pmHistory(j, 0), [{ t: 100000, chance: 61 }]);
  assert.strictEqual(Math.round(V.pmHistory(j, 1)[0].chance), 41);
  console.log('pmHistory ok'); }
