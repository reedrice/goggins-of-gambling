// node --test tests/live-context.test.mjs
// Classification rules in scripts/live-context.mjs. Uses TEST DATA only: an
// ESPN-summary-shaped object with made-up scores (field names match the real API).
import test from 'node:test';
import assert from 'node:assert';
import { parseSummary, classify, clockText, contextLine, findEspnEvent } from '../scripts/live-context.mjs';

// TEST DATA: WSH trails SF 10-17 in Q2 9:14. Pregame report: Evans questionable.
// In-game: J.Daniels hurt (not back), A.Smith hurt then returned.
const summary = (o = {}) => ({
  header: { competitions: [{ status: { period: o.period ?? 2, displayClock: o.clock ?? '9:14', type: { state: o.state ?? 'in', name: o.name ?? 'STATUS_IN_PROGRESS' } },
    competitors: [
      { homeAway: 'home', score: String(o.sf ?? 17), team: { id: '25', abbreviation: 'SF', name: '49ers', displayName: 'San Francisco 49ers' } },
      { homeAway: 'away', score: String(o.was ?? 10), team: { id: '28', abbreviation: 'WSH', name: 'Commanders', displayName: 'Washington Commanders' } }] }] },
  situation: { possession: '28' },
  injuries: [{ team: { abbreviation: 'SF' }, injuries: [{ status: 'Questionable', athlete: { displayName: 'Mike Evans', shortName: 'M. Evans', position: { abbreviation: 'WR' } } }] }],
  leaders: [{ team: { abbreviation: 'WSH' }, leaders: [{ leaders: [{ athlete: { displayName: 'Jayden Daniels', shortName: 'J. Daniels', position: { abbreviation: 'QB' } } }] }] }],
  drives: { previous: [{ plays: [
    { text: 'J.Daniels sacked. WAS-J.Daniels was injured during the play.', period: { number: 2 }, clock: { displayValue: '10:02' } },
    { text: 'Run. SF-A.Smith was injured during the play.', period: { number: 1 }, clock: { displayValue: '3:00' } },
    { text: '** Injury Update: SF-A.Smith has returned to the game.', period: { number: 2 }, clock: { displayValue: '12:00' } }] }] },
  ...(o.noDaniels ? { drives: { previous: [] } } : {}),
});
const ctx = (o) => parseSummary(summary(o), 'TEST');
const M = (o) => ({ group: 'game', period: 'full_game', ...o });

test('parseSummary reads score, clock, possession, injuries', () => {
  const c = ctx();
  assert.strictEqual(c.away.score, 10); assert.strictEqual(c.home.score, 17);
  assert.strictEqual(c.possession, 'WSH');
  assert.strictEqual(c.regulation_secs_left, 2 * 900 + 554);
  assert.strictEqual(clockText(c), 'Q2 9:14');
  assert.deepStrictEqual(c.in_game_injuries.map(x => [x.player, x.returned]), [['J.Daniels', false], ['A.Smith', true]]);
});

test('trailing team moneyline drifting = explained by score', () => {
  const ml = M({ mtype: 'winner', sides: ['Commanders win', '49ers win'], teams: ['Commanders', '49ers'] });
  const r = classify(ctx({ noDaniels: true }), ml, 0, 12);
  assert.strictEqual(r.class, 'score'); assert.match(r.reason, /WSH trailing by 7/);
  assert.strictEqual(r.context, 'WSH down 7, Q2 9:14');
  // The LEADING team getting cheaper has no score excuse -> real edge.
  assert.strictEqual(classify(ctx({ noDaniels: true }), ml, 1, 12).class, 'edge');
});

test('QB hurt in-game (not back) = explained by injury for his team', () => {
  const ml = M({ mtype: 'winner', sides: ['Commanders win', '49ers win'], teams: ['Commanders', '49ers'] });
  const r = classify(ctx(), ml, 0, 12);
  assert.strictEqual(r.class, 'injury'); assert.match(r.reason, /J\.Daniels hurt in-game \(Q2 10:02\)/);
  assert.doesNotMatch(r.context, /injur|hurt|Daniels/i);   // card context never shows injuries
});

test('prop player questionable = explained by injury', () => {
  const prop = { group: 'prop', mtype: 'prop', player: 'Mike Evans', sides: ['Yes: Mike Evans record 50+ receiving yards', 'No: ...'], teams: ['49ers', '49ers'] };
  assert.strictEqual(classify(ctx(), prop, 0, 6).class, 'injury');
  const other = { ...prop, player: 'Brock Purdy' };
  assert.strictEqual(classify(ctx(), other, 0, 6).class, 'edge');       // props aren't explained by score
});

test('spread: not covering = score; covering = edge', () => {
  const sp = M({ mtype: 'spread', sides: ['Commanders +3.50', '49ers -3.50'], teams: ['Commanders', '49ers'] });
  assert.strictEqual(classify(ctx({ noDaniels: true }), sp, 0, 8).class, 'score');   // -7 + 3.5 < 0
  const sp2 = M({ mtype: 'spread', sides: ['Commanders +10.50', '49ers -10.50'], teams: ['Commanders', '49ers'] });
  assert.strictEqual(classify(ctx({ noDaniels: true }), sp2, 0, 8).class, 'edge');   // -7 + 10.5 > 0
});

test('totals pace rule', () => {
  // 27 pts with 2354 s left: pace for 51.5 = 51.5 * (1 - 0.654) = 17.8 -> above pace.
  const tot = M({ mtype: 'total', line: 51.5, sides: ['Over 51.5', 'Under 51.5'], teams: [null, null] });
  assert.strictEqual(classify(ctx({ noDaniels: true }), tot, 1, 8).class, 'score');  // Under cheaper, scoring fast
  assert.strictEqual(classify(ctx({ noDaniels: true }), tot, 0, 8).class, 'edge');   // Over cheaper while scoring fast = edge
});

test('period lines: explained once the period has started', () => {
  const q1 = M({ mtype: 'spread', period: 'first_quarter', sides: ['Commanders +1.50 (Q1)', '49ers -1.50 (Q1)'], teams: ['Commanders', '49ers'] });
  const q4 = { ...q1, period: 'fourth_quarter' };
  assert.strictEqual(classify(ctx({ noDaniels: true }), q1, 0, 8).class, 'score');
  assert.strictEqual(classify(ctx({ noDaniels: true }), q4, 0, 8).class, 'edge');
});

test('25+ points unexplained = likely news; tiers 4-9 slight, 10-24 big', () => {
  const ml = M({ mtype: 'winner', sides: ['Commanders win', '49ers win'], teams: ['Commanders', '49ers'] });
  const c = ctx({ noDaniels: true });
  assert.deepStrictEqual([classify(c, ml, 1, 30).class, classify(c, ml, 1, 24).tier, classify(c, ml, 1, 9).tier, classify(c, ml, 1, 10).tier], ['news', 'big', 'slight', 'big']);
});

test('pregame: nothing is explained by score', () => {
  const ml = M({ mtype: 'winner', sides: ['Commanders win', '49ers win'], teams: ['Commanders', '49ers'] });
  const c = ctx({ state: 'pre', name: 'STATUS_SCHEDULED', period: 0, noDaniels: true });
  const r = classify(c, ml, 0, 12);
  assert.strictEqual(r.class, 'edge'); assert.strictEqual(r.context, 'Pregame');
});

test('ESPN unavailable -> unverified, nothing invented', () => {
  const r = classify({ available: false }, M({ mtype: 'winner', sides: ['A', 'B'], teams: ['A', 'B'] }), 0, 12);
  assert.strictEqual(r.class, 'unverified');
  assert.strictEqual(contextLine({ available: false }, {}, 0), 'Game info unavailable, not checked');
});

test('findEspnEvent matches by both team names in the Polymarket title', () => {
  const sb = { events: [{ id: 'X', competitions: [{ competitors: [{ team: { name: 'Texans' } }, { team: { name: 'Jaguars' } }] }] },
    { id: 'Y', competitions: [{ competitors: [{ team: { name: '49ers' } }, { team: { name: 'Commanders' } }] }] }] };
  assert.strictEqual(findEspnEvent(sb, 'WAS Commanders vs. SF 49ers'), 'Y');
});
