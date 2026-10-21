// node --test tests/live-watch.test.mjs
// Tests for scripts/live-watch.mjs using TEST DATA in tests/fixtures/live-watch-sample.json
// (made-up prices, no network).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { american, pays, quote, liquid, findMoves, appendAlerts, gameOver, selectMarkets, sportOf, tagOf, lineInfo, describe, tierOf, buildLive, openFromPublished, mergeOpen, liveAlerts, ALERT_CAP, ODDS_LIMIT, MIN_CHANCE, MAX_CHANCE, withinOddsLimit } from '../scripts/live-watch.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures/live-watch-sample.json', import.meta.url), 'utf8'));

test('american odds', () => {
  assert.strictEqual(american(40), '+150');
  assert.strictEqual(american(60), '-150');
  assert.strictEqual(american(0), '—');
});

test('$10 pays: whole dollars, rounded down', () => { assert.strictEqual(pays(40), '25'); assert.strictEqual(pays(30), '33'); assert.strictEqual(pays(51), '19'); });

test('even odds show +100', () => { assert.strictEqual(american(50), '+100'); assert.strictEqual(american(50.1), '-100'); });

test('thin markets are skipped', () => {
  const thin = F.event.markets.find(m => m.id === 'thin');
  assert.strictEqual(liquid(quote(thin)), false);
});

test('only big moves alert, biggest first, no cents', () => {
  const r = findMoves(F.open, {}, F.event);
  assert.strictEqual(r.watched, 3);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(r.alerts.length, 2);            // ml and tot moved 11 pts; calm moved 2
  for (const a of r.alerts) { assert.match(a.text, /\$10 pays \$/); assert.doesNotMatch(a.text, /¢/); }
  assert.match(r.alerts.find(a => a.text.includes('AAA win')).text, /now \+150/);   // AAA got cheaper
  assert.match(r.alerts.find(a => a.text.includes('Under')).text, /Under 40\.5/);    // Over rose -> Under cheaper
});

test('step-only alert names the side that just got cheaper, signs from that side', () => {
  // Calm vs open (+2), but last check had the spread Yes at 60 -> Yes just dropped 8.
  const r = findMoves(F.open, { calm: 60 }, F.event);
  const a = r.alerts.find(x => x.text.includes('Main spread'));
  assert.strictEqual(a.side, 'AAA +1.5');
  assert.match(a.text, /-8 since last check/);
});

test('open and now are both buy prices', () => {
  const open = { ...F.open, markets: F.open.markets.map(m => ({ ...m, yesBuy: 51, noBuy: 51 })) };
  const a = findMoves(open, {}, F.event).alerts.find(x => x.side === 'AAA win');
  assert.strictEqual(a.openP, 51);   // open buy price, not the 50 mid
  assert.strictEqual(a.nowP, 40);    // now ask
  assert.match(a.text, /-11 pts from open/);
});

test('appendAlerts saves prices only (no $) and appends across checks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-'));
  const { alerts } = findMoves(F.open, {}, F.event);
  appendAlerts(dir, 'test-slug', alerts); const f = appendAlerts(dir, 'test-slug', alerts);
  const raw = fs.readFileSync(f, 'utf8'), j = JSON.parse(raw);
  assert.strictEqual(j.alerts.length, 4);
  assert.doesNotMatch(raw, /\$|¢/);
  assert.match(j.alerts[0].now_odds, /^[+-]\d+$/);
});

test('gameOver', () => {
  assert.strictEqual(gameOver(F.event), false);
  assert.strictEqual(gameOver({ markets: [{ closed: true }] }), true);
});

test('snapshot file tag keeps the date', () => assert.strictEqual(tagOf('nfl-was-sf-2026-10-19'), 'was-sf-2026-10-19'));

test('per-sport market types pick ML, main spread/total and named-player props', () => {
  assert.throws(() => sportOf('xyz-a-b-2099-01-01'));
  const q = (b, a) => ({ active: true, closed: false, status: 'MARKET_STATUS_OPEN', bestBidQuote: { value: b }, bestAskQuote: { value: a } });
  // TEST DATA: made-up NHL event (type names match the real API).
  const ev = { markets: [
    { id: 1, sportsMarketType: 'hockey_team_full_game_winner', marketSides: [], ...q('0.55', '0.57') },
    { id: 2, sportsMarketType: 'hockey_team_full_game_total', line: 5.5, ...q('0.48', '0.50') },
    { id: 3, sportsMarketType: 'hockey_team_full_game_total', line: 6.5, ...q('0.30', '0.32') },
    { id: 4, sportsMarketType: 'hockey_player_goals', question: 'Will Test Player score?', ...q('0.30', '0.33') },
    { id: 5, sportsMarketType: 'football_team_full_game_winner', ...q('0.50', '0.52') },
  ] };
  const got = selectMarkets(ev, sportOf('nhl-aaa-bbb-2099-01-01'), ['test player']);
  assert.deepStrictEqual(got.map(m => m.id), [1, 2, 3, 4]);          // alt total 6.5 is a game line too
  assert.deepStrictEqual(got.map(m => m.kind), ['Moneyline', 'Main total', 'Alt total', 'Player prop']);
  assert.deepStrictEqual(got.map(m => m.group), ['game', 'game', 'game', 'prop']);
  assert.deepStrictEqual(got[1].sides, ['Over 5.5', 'Under 5.5']);
  assert.strictEqual(got[3].player, 'Test Player');
});

test('edge tiers: 10+ big, 4-9 slight, under 4 none', () => {
  assert.strictEqual(tierOf(10), 'big'); assert.strictEqual(tierOf(9.9), 'slight');
  assert.strictEqual(tierOf(4), 'slight'); assert.strictEqual(tierOf(3.9), null); assert.strictEqual(tierOf(-12), null);
});

test('buildLive JSON shape, sorting, first_seen and gone', () => {
  const open = { ...F.open, start_time: '2099-01-01T00:00:00Z', taken_at: 'T0',
    markets: F.open.markets.map(m => ({ ...m, yesBuy: 51, noBuy: 51 })) };
  const prev = { edges: [{ key: 'old:0', side: 'X', edge: 5, tier: 'slight', first_seen: 'T-1', status: 'open' }] };
  const j = buildLive(open, F.event, prev, '2026-10-19T20:00:00Z');
  for (const k of ['slug', 'game', 'url', 'updated', 'status', 'open', 'edges']) assert.ok(k in j, k);
  assert.strictEqual(j.status, 'pregame');
  const live = j.edges.filter(e => e.status === 'open');
  // AAA win: 51 -> 40 (11 cheaper, big). Under: 51 -> 39 (12, big). Thin skipped. Calm: no edge.
  assert.deepStrictEqual(live.map(e => [e.side, e.edge, e.tier]), [['Under 40.5 points', 12, 'big'], ['AAA win', 11, 'big']]);
  for (const e of live) { assert.match(e.now_odds, /^[+-]\d+$/); assert.ok(e.first_seen); }
  assert.strictEqual(j.edges.at(-1).status, 'gone');
  assert.strictEqual(j.edges.at(-1).first_seen, 'T-1');
  assert.doesNotMatch(JSON.stringify(j), /\$|¢/);
});

test('published file round-trips back to the same opening prices', () => {
  const open = { ...F.open, start_time: '2099-01-01T00:00:00Z', taken_at: 'T0', markets: F.open.markets.map(m => ({ ...m, yesBuy: 51, noBuy: 51 })) };
  const j = buildLive(open, F.event, null, '2026-10-19T20:00:00Z');
  assert.deepStrictEqual(buildLive(openFromPublished(j), F.event, null, '2026-10-19T20:00:00Z'), j);
});

test('game-line types: periods, team totals, and side names (shapes from the real gateway)', () => {
  assert.deepStrictEqual(lineInfo('football_team_first_half_spread', 'football'), { mtype: 'spread', period: 'first_half', periodLabel: '1st half' });
  assert.strictEqual(lineInfo('football_game_fourth_quarter_total', 'football').period, 'fourth_quarter');
  assert.strictEqual(lineInfo('football_team_points_full_game_total', 'football').mtype, 'team_total');
  assert.strictEqual(lineInfo('football_game_exact_margin', 'football'), null);
  assert.strictEqual(lineInfo('football_player_receptions', 'football'), null);
  // TEST DATA shaped like real markets.
  const S = (alias, desc, long) => ({ long, description: desc, team: alias ? { alias } : undefined });
  const half = { sportsMarketType: 'football_team_first_half_winner', question: 'Will San Francisco 49ers win the first half?', marketSides: [S('49ers', 'Yes', true), S('49ers', 'No', false)] };
  assert.deepStrictEqual(describe(half, lineInfo(half.sportsMarketType, 'football')).sides, ['Yes: San Francisco 49ers win the first half', 'No: San Francisco 49ers win the first half']);
  const tt = { sportsMarketType: 'football_team_points_full_game_total', line: 13.5, marketSides: [S('Commanders', 'Over', true), S('Commanders', 'Under', false)] };
  assert.deepStrictEqual(describe(tt, lineInfo(tt.sportsMarketType, 'football')), { sides: ['Commanders Over 13.5 points', 'Commanders Under 13.5 points'], teams: ['Commanders', 'Commanders'] });
  const q1 = { sportsMarketType: 'football_team_first_quarter_spread', marketSides: [S('Commanders', '+1.50', true), S('49ers', '-1.50', false)] };
  assert.deepStrictEqual(describe(q1, lineInfo(q1.sportsMarketType, 'football')).sides, ['Commanders +1.50 (Q1)', '49ers -1.50 (Q1)']);
});

test('buildLive stores game_context and classifies every edge (unverified when ESPN is missing)', () => {
  const open = { ...F.open, start_time: '2099-01-01T00:00:00Z', taken_at: 'T0', markets: F.open.markets.map(m => ({ ...m, yesBuy: 51, noBuy: 51 })) };
  const j = buildLive(open, F.event, null, '2026-10-19T20:00:00Z', { available: false, error: 'test' });
  assert.strictEqual(j.game_context.available, false);
  for (const e of j.edges) { assert.strictEqual(e.class, 'unverified'); assert.ok(e.context); }
});

test('mergeOpen never overwrites an opening price and stamps each market', () => {
  const old = [{ id: 'a', kind: 'old', mid: 40, yesBuy: 41, noBuy: 61, taken_at: 'T1' }, { id: 'gone', mid: 30, yesBuy: 31, noBuy: 71 }];
  const fresh = [{ id: 'a', kind: 'Moneyline', group: 'game', mid: 55, yesBuy: 56, noBuy: 46 }, { id: 'b', kind: 'Alt total', group: 'game', mid: 20, yesBuy: 21, noBuy: 81 }];
  const m = Object.fromEntries(mergeOpen(old, fresh, 'T2', 'T0').map(x => [x.id, x]));
  assert.deepStrictEqual([m.a.yesBuy, m.a.taken_at, m.a.kind], [41, 'T1', 'Moneyline']);   // price kept, label refreshed
  assert.deepStrictEqual([m.b.yesBuy, m.b.taken_at], [21, 'T2']);                         // new market stamped now
  assert.deepStrictEqual([m.gone.yesBuy, m.gone.taken_at], [31, 'T0']);                   // old-only kept
});

test('alerts: new edge, tier up, gone, news, injury removal; deduped, newest first, capped', () => {
  const E = (key, o = {}) => ({ key, side: 'S' + key, market: 'Moneyline', tier: 'slight', class: 'edge', status: 'open', edge: 6, now_odds: '+150', now_chance: 40, first_seen: 'F', ...o });
  // Pregame: nothing.
  assert.deepStrictEqual(liveAlerts(null, [E('a')], 'pregame', 'T0', 'https://x').alerts, []);
  const r1 = liveAlerts(null, [E('a'), E('n', { class: 'news', edge: 30 }), E('i', { class: 'injury' })], 'live', 'T1', 'https://x');
  assert.deepStrictEqual(r1.alerts.map(a => a.type).sort(), ['new_edge', 'news']);          // never-shown injury edge: no alert
  // Same state 2 minutes later: no repeats.
  const p1 = { alerts: r1.alerts, alert_seen: r1.seen, edges: [E('a'), E('n', { class: 'news', edge: 30 }), E('b')] };
  const r2 = liveAlerts(p1, [E('a'), E('n', { class: 'news', edge: 30 })], 'live', 'T2', 'https://x');
  assert.strictEqual(r2.alerts.length, 2);
  // a goes big, b gone, then a becomes injury-explained.
  const r3 = liveAlerts(p1, [E('a', { tier: 'big', edge: 12 }), E('b', { status: 'gone' })], 'live', 'T3', 'https://x');
  assert.deepStrictEqual(r3.alerts.slice(0, 2).map(a => a.type).sort(), ['gone', 'new_edge']);
  assert.match(r3.alerts.find(a => a.type === 'new_edge').text, /^New big edge: Sa \(Moneyline\), 12 points cheaper/);
  const r4 = liveAlerts({ ...p1, alerts: r3.alerts, alert_seen: r3.seen }, [E('a', { class: 'injury' })], 'live', 'T4', 'https://x');
  assert.strictEqual(r4.alerts[0].type, 'removed'); assert.strictEqual(r4.alerts[0].text, 'Sa (Moneyline) removed from list.');
  assert.doesNotMatch(JSON.stringify(r4.alerts), /\$|¢|injur/i);
  // Cap.
  const many = Array.from({ length: 60 }, (_, i) => E('m' + i));
  assert.strictEqual(liveAlerts(null, many, 'live', 'T5', 'https://x').alerts.length, ALERT_CAP);
});

test('odds limit: +500 / -500 is the edge of what we track', () => {
  assert.strictEqual(ODDS_LIMIT, 500);
  assert.strictEqual(american(MIN_CHANCE), '+500'); assert.strictEqual(american(MAX_CHANCE), '-500');
  assert.ok(withinOddsLimit(MIN_CHANCE) && withinOddsLimit(MAX_CHANCE) && withinOddsLimit(50));
  assert.ok(!withinOddsLimit(16.6) && !withinOddsLimit(83.4));
});

test('odds limit: long/short sides never become edges; crossing it drops quietly (no gone, alert removed)', () => {
  // TEST DATA: one market whose Yes side is now 14-15 (about +600): Yes cheaper by 30+, but out of limit.
  const ev = { markets: [{ id: 'far', active: true, closed: false, status: 'MARKET_STATUS_OPEN', bestBidQuote: { value: '0.14' }, bestAskQuote: { value: '0.15' } }] };
  const open = { slug: 's', title: 't', url: 'https://polymarket.us/x', start_time: '2000-01-01T00:00:00Z',
    markets: [{ id: 'far', kind: 'Moneyline', group: 'game', sides: ['A win', 'B win'], teams: [null, null], mid: 50, yesBuy: 51, noBuy: 51 }] };
  const prev = { edges: [{ key: 'far:0', side: 'A win', market: 'Moneyline', class: 'edge', tier: 'big', edge: 12, status: 'open', first_seen: 'T0', now_chance: 39 }],
    alerts: [{ id: 'new_edge:far:0:big', key: 'far:0', at: 'T0', type: 'new_edge', now_chance: 39, text: 'x' }], alert_seen: ['new_edge:far:0:big'] };
  const j = buildLive(open, ev, prev, '2026-10-20T01:00:00Z', { available: false });
  assert.deepStrictEqual(j.edges, []);          // not an edge, not "gone"
  assert.deepStrictEqual(j.alerts, []);         // earlier alert removed, no new "gone" alert
});

test('tick: shouldTick + buildIndex', async () => {
  const { shouldTick, buildIndex } = await import('../scripts/live-tick.mjs');
  const now = Date.parse('2026-10-20T20:00:00Z');
  assert.strictEqual(shouldTick({ start: '2026-10-20T20:20:00Z' }, now), true);
  assert.strictEqual(shouldTick({ start: '2026-10-20T21:00:00Z' }, now, 30), false);
  assert.strictEqual(shouldTick({ start: '2026-10-20T18:00:00Z', status: 'live' }, now), true);
  assert.strictEqual(shouldTick({ start: '2026-10-20T18:00:00Z', status: 'final' }, now), false);
  assert.strictEqual(buildIndex([{ slug: 'a', start_time: '1' }, { slug: 'b', start_time: '2' }]).games[0].slug, 'b');
});

test('players "all" keeps every liquid prop', () => {
  const ev = { markets: [1, 2].map(i => ({ id: 'p' + i, active: true, closed: false, status: 'MARKET_STATUS_OPEN', sportsMarketType: 'basketball_player_points',
    question: `Will Player ${i} score 20+ points?`, bestBidQuote: { value: '0.48' }, bestAskQuote: { value: '0.50' }, marketSides: [] })) };
  assert.strictEqual(selectMarkets(ev, sportOf('nba-a-b-2026-10-20'), ['all']).length, 2);
  assert.strictEqual(selectMarkets(ev, sportOf('nba-a-b-2026-10-20'), []).length, 0);
});

test('appendHistory: change-only points + period marks', async () => {
  const { appendHistory } = await import('../scripts/live-watch.mjs');
  const mk = b => ({ markets: [{ id: 'a', slug: 'sa', active: true, closed: false, status: 'MARKET_STATUS_OPEN', bestBidQuote: { value: String(b) }, bestAskQuote: { value: String(b + 0.02) } }] });
  const open = { slug: 'nba-x-y-2026-10-20', markets: [{ id: 'a' }] };
  let h = appendHistory(null, open, mk(0.40), null, '2026-10-20T18:00:00Z');
  h = appendHistory(h, open, mk(0.401), { available: true, game_state: 'in', period: 1, away: { abbr: 'X', score: 2 }, home: { abbr: 'Y', score: 0 } }, '2026-10-20T18:10:00Z');
  h = appendHistory(h, open, mk(0.45), { available: true, game_state: 'in', period: 1, away: { abbr: 'X', score: 4 }, home: { abbr: 'Y', score: 0 } }, '2026-10-20T18:20:00Z');
  assert.deepStrictEqual(h.m.a, [[0, 41], [20, 46]]);
  assert.strictEqual(h.marks.length, 1);
  assert.strictEqual(h.ids.sa, 'a');
});

test('tick: Chicago slate, DST and real two-team games', async () => {
 const {shouldTick,isTeamGame,buildIndex}=await import('../scripts/live-tick.mjs');
 const now=Date.parse('2026-10-20T22:00:00Z');
 assert.strictEqual(shouldTick({start:'2026-10-21T02:30:00Z'},now),true);
 assert.strictEqual(shouldTick({start:'2026-10-21T05:00:00Z'},now),true);
 assert.strictEqual(shouldTick({start:'2026-11-02T05:30:00Z'},Date.parse('2026-11-01T20:00:00Z')),true);
 assert.strictEqual(shouldTick({start:'2026-11-02T06:00:00Z'},Date.parse('2026-11-01T20:00:00Z')),true);
 assert.strictEqual(isTeamGame({slug:'nba-phi-ny-2026-10-20',teams:[{},{}]}),true);
 assert.strictEqual(isTeamGame({slug:'nba-lead-pts-2026-10-20',teams:[]}),false);
 assert.strictEqual(buildIndex([{slug:'leader',is_game:false},{slug:'game'}]).games.length,1);
});

 test('expanded slate: tomorrow included, day after excluded, tennis and soccer market types distinct', async()=>{
 const {shouldTick,isTeamGame}=await import('../scripts/live-tick.mjs');
 const now=Date.parse('2026-10-21T05:00:00Z');
 assert.equal(shouldTick({start:'2026-10-23T04:59:00Z'},now),true);
 assert.equal(shouldTick({start:'2026-10-23T05:00:00Z'},now),false);
 for(const league of ['atp','wta','cfb','cbb','ucl'])assert.equal(isTeamGame({slug:league+'-a-b-2026-10-21',teams:[{},{}]}),true);
 assert.equal(isTeamGame({slug:'pga-future-2026-10-21',teams:[]}),false);
 assert.equal(lineInfo('tennis_match_winner','tennis').mtype,'winner');
 assert.equal(lineInfo('tennis_match_games_spread','tennis').periodLabel,'Games');
 assert.equal(lineInfo('tennis_match_sets_spread','tennis').periodLabel,'Sets');
 assert.equal(lineInfo('soccer_team_full_time_winner','soccer').mtype,'winner');
 });
