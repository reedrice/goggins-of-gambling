/**
 * tests/live-bets.test.js — helpers in js/live-bets.js + the published data shape.
 * Run: node tests/live-bets.test.js
 */
const assert = require('assert');
const fs = require('fs');
const LB = require('../js/live-bets.js');

assert.strictEqual(LB.pays10(40), '25');             // $10 at +150 returns 25
assert.strictEqual(LB.pays10(30), '33');             // 33.33 rounds DOWN, no cents
assert.strictEqual(LB.pays10(0), null);
assert.strictEqual(LB.safeUrl('https://polymarket.us/x'), 'https://polymarket.us/x');
assert.strictEqual(LB.safeUrl('javascript:alert(1)'), null);
assert.deepStrictEqual(LB.sortEdges([{ edge: 5 }, { edge: 12, status: 'gone' }, { edge: 11 }]).map(e => e.edge), [11, 5, 12]);
assert.match(LB.statusText({ status: 'pregame', start_time: '2026-10-20T00:15:00Z', game_context: { available: true, game_state: 'pre', away: {}, home: {} } }), /kickoff 7:15 PM CT/);

// The real published file the view reads: right shape, no cents, no dollar figures.
const raw = fs.readFileSync(`${__dirname}/../data/live/${LB.SLUG}.json`, 'utf8'), d = JSON.parse(raw);
for (const k of ['slug', 'game', 'url', 'start_time', 'status', 'updated', 'open', 'edges']) assert.ok(k in d, k);
assert.strictEqual(d.slug, LB.SLUG);
assert.ok(['pregame', 'live', 'final'].includes(d.status));
assert.ok(d.open.length > 0 && d.open.every(o => o.sides && o.sides.length === 2));
for (const e of d.edges) {
  assert.ok(['big', 'slight'].includes(e.tier) && ['open', 'gone'].includes(e.status));
  assert.match(e.now_odds, /^[+-]\d+$/);
}
assert.doesNotMatch(raw, /\$|¢/);
assert.ok(LB.safeUrl(d.url));

// Grouping + cap (TEST DATA): props never push game lines out, each group capped.
const E = (id, group, edge, cls = 'edge', status = 'open') => ({ key: id, group, edge, class: cls, status, market: group === 'prop' ? 'Player prop' : 'Alt total' });
const edges = [
  ...Array.from({ length: 9 }, (_, i) => E('p' + i, 'prop', 4 + i)),          // 9 props, edges 4..12
  E('g1', 'game', 6), E('g2', 'game', 15), E('g3', 'game', 11, 'edge', 'gone'),
  E('s1', 'game', 20, 'score'), E('i1', 'prop', 8, 'injury'), E('n1', 'game', 30, 'news'), E('u1', 'game', 9, 'unverified'),
];
const g = LB.groupEdges(edges);
assert.strictEqual(LB.CAP, 5);
assert.deepStrictEqual(g.prop.shown.map(e => e.key), ['p8', 'p7', 'p6', 'p5', 'p4']);   // top 5, big to small
assert.strictEqual(g.prop.more.length, 4); assert.strictEqual(g.prop.total, 9);
assert.deepStrictEqual(g.game.shown.map(e => e.key), ['g2', 'u1', 'g1', 'g3']);          // gone last; unverified stays in main
assert.deepStrictEqual(g.reasons.map(e => e.key), ['n1', 's1']);                        // score + news only
assert.ok(![...g.game.shown, ...g.prop.shown, ...g.prop.more, ...g.reasons].some(e => e.class === 'injury'));   // injury edges dropped
assert.strictEqual(g.prop.total, 9);
assert.deepStrictEqual(LB.groupEdges(edges, 2).game.more.map(e => e.key), ['g1', 'g3']);
// Score header from ESPN-shaped context (TEST DATA).
const sb = LB.scoreboard({ game_context: { available: true, game_state: 'in', period: 2, clock: '9:14', possession: 'WSH', away: { abbr: 'WSH', score: 10 }, home: { abbr: 'SF', score: 17 } } });
assert.deepStrictEqual(sb, { score: 'WSH 10 – SF 17', status: 'Q2 9:14 · WSH ball' });
assert.match(LB.scoreboard({ game_context: { available: false }, status: 'live' }).status, /unavailable/);
// Alerts: highlight only entries newer than the last refresh; first visit highlights none.
const al = [{ at: '2026-10-20T01:10:00Z' }, { at: '2026-10-20T01:05:00Z' }, { at: '2026-10-20T01:00:00Z' }];
assert.deepStrictEqual(LB.markNew(al, '2026-10-20T01:05:00Z'), [true, false, false]);
assert.deepStrictEqual(LB.markNew(al, null), [false, false, false]);
assert.ok(Array.isArray(d.alerts) && d.alerts.length <= 50, 'data file has an alerts feed');
// Odds limit safety net in the view (TEST DATA).
assert.strictEqual(LB.ODDS_LIMIT, 500);
assert.ok(LB.inLimit(50) && LB.inLimit(16.7) && !LB.inLimit(16.6) && !LB.inLimit(83.4));
const lim = LB.groupEdges([E('ok', 'game', 8), { ...E('far', 'game', 12), now_chance: 10 }, { ...E('fav', 'prop', 6), now_chance: 90 }, { ...E('farnews', 'game', 30, 'news'), now_chance: 12 }]);
assert.deepStrictEqual([lim.game.total, lim.prop.total, lim.reasons.length], [1, 0, 0]);
// First visit (option C): unset key -> now - 30 min (ISO, like alert `at`); set key is never changed.
const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const st = mem(), now = Date.parse('2026-10-20T01:30:00.000Z');
assert.strictEqual(LB.seedSeen(st, now), '2026-10-20T01:00:00.000Z');
assert.strictEqual(st.m[LB.SEEN_KEY], '2026-10-20T01:00:00.000Z');
assert.strictEqual(LB.SEEN_KEY, 'liveBets.alertsSeen.' + LB.SLUG);
assert.strictEqual(LB.seedSeen(st, now + 3600e3), '2026-10-20T01:00:00.000Z');          // already set: untouched
// Only alerts in the last 30 minutes count as new for a first-time visitor.
assert.deepStrictEqual(LB.markNew([{ at: '2026-10-20T01:20:00.000Z' }, { at: '2026-10-20T00:50:00.000Z' }], st.m[LB.SEEN_KEY]), [true, false]);
assert.strictEqual(LB.seedSeen({ getItem: () => { throw new Error('blocked'); } }, now), null);
console.log('ok live-bets helpers + data shape + grouping/cap + alerts + odds limit + first-visit seed');

{ const LB = require('../js/live-bets.js'); const assert = require('assert');
  const now = Date.parse('2026-10-20T01:00:00Z');
  assert.strictEqual(LB.freshness({ status: 'live', updated: '2026-10-20T00:30:00Z' }, now).stale, true);
  assert.strictEqual(LB.freshness({ status: 'live', updated: '2026-10-20T00:50:00Z' }, now).stale, false);
  assert.strictEqual(LB.freshness({ status: 'pregame', start_time: '2026-10-20T00:15:00Z', updated: '2026-10-19T20:39:00Z' }, now).stale, true);
  assert.strictEqual(LB.freshness({ status: 'final', updated: '2026-10-19T20:39:00Z' }, now).stale, false);
  assert.strictEqual(LB.pickGame([{ slug: 'x', status: 'final', start_time: '2' }, { slug: 'y', status: 'live', start_time: '1' }]), 'y');
  console.log('live-bets freshness/pickGame ok'); }

// Aggregation keeps overlapping market keys attached to the right game and URL.
{
 const first={slug:'nba-a-b',game:'A vs B',url:'https://example.com/a',status:'pregame',start_time:'2099-01-01T00:00:00Z',updated:'2026-10-20T22:00:00Z',edges:[{key:'same',group:'game',edge:5}],alerts:[{at:'2026-10-20T22:00:00Z',text:'First'}]};
 const second={...first,slug:'nhl-c-d',game:'C vs D',url:'https://example.com/b',updated:'2026-10-20T22:10:00Z',edges:[{key:'same',group:'game',edge:10}],alerts:[{at:'2026-10-20T22:10:00Z',text:'Second'}]};
 const combined=LB.combineGames([first,second,{...first,status:'final'}],1);
 assert.strictEqual(combined.game_count,2);
 assert.strictEqual(combined.failed,1);
 assert.strictEqual(combined.updated,first.updated);
 assert.deepStrictEqual(LB.groupEdges(combined.edges).game.shown.map(e=>[e.event_slug,e.event_url]),[['nhl-c-d',second.url],['nba-a-b',first.url]]);
 assert.strictEqual(combined.alerts[0].text,'C vs D | Second');
 assert.strictEqual(first.edges[0].event_slug,undefined);
 assert.strictEqual(LB.combineGames([]).game_count,0);
 console.log('all-games source attribution, sorting, partial failures and final exclusion ok');
}

// Sandbox Option 1 navigation preserves eligibility and per-game identity.
{
 const since='2026-10-20T20:00:00Z';
 const edge=(key,tier,first_seen,status='open',cls='edge',group='game')=>({key,tier,first_seen,status,class:cls,group,edge:tier==='big'?12:6,now_chance:50});
 const rows=[edge('old','big','2026-10-20T19:00:00Z'),edge('new','slight','2026-10-20T21:00:00Z'),edge('gone','big','2026-10-20T21:00:00Z','gone'),edge('reason','big','2026-10-20T21:00:00Z','open','score'),edge('injury','big','2026-10-20T21:00:00Z','open','injury'),{...edge('limit','big','2026-10-20T21:00:00Z'),now_chance:1}];
 const selection=LB.edgeSelection(rows,'all',since);
 assert.deepStrictEqual(selection.counts,{all:2,big:1,slight:1,new:1});
 assert.deepStrictEqual(LB.edgeSelection(rows,'new',since).edges.map(e=>e.key),['new']);
 assert.deepStrictEqual(LB.edgeSelection(rows,'big',since).edges.map(e=>e.key),['old']);
 assert.deepStrictEqual(selection.past.map(e=>e.key),['gone']);assert.strictEqual(selection.reasons.length,1);
 assert.strictEqual(LB.edgeSelection(rows,'new',null).counts.new,0);
 assert.strictEqual(LB.edgeSelection([{...rows[1],first_seen:since}],'new',since).edges.length,0);
 const repeated=[{...rows[1],event_slug:'one'},{...rows[1],event_slug:'two'}];
 assert.deepStrictEqual(LB.edgeSelection(repeated,'new',since).edges.map(e=>e.event_slug),['one','two']);
 assert.strictEqual(LB.edgeTitle({group:'prop',side:'No: Joel Embiid record at least 10 total rebounds in PHI 76ers vs. NY Knicks'}),'No: Joel Embiid 10+ rebounds');
 assert.strictEqual(LB.edgeTitle({group:'game',side:'Under 108.5'}),'Under 108.5');
 console.log('Option 1 edge filters, New boundary, safety exclusions, identity and compact titles ok');
}
