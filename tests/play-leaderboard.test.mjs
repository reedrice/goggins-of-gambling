// node tests/play-leaderboard.test.mjs — leaderboard builder on MADE-UP TEST issues (no network: results come from a stubbed fetch).
import assert from 'node:assert';
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../js/play.js');
const closed = (slug, longPrice) => ({ slug, closed: true, marketSides: [{ long: true, price: longPrice }, { long: false, price: longPrice === '1' ? '0' : '1' }] });
globalThis.fetch = async url => ({ ok: true, json: async () => ({ event: { markets: [closed('aec-nfl-dal-gb-2026-10-18', '0'), closed('aec-nba-phi-ny-2026-10-20', '1')] } }) });
const { build } = await import('../scripts/play-leaderboard.mjs');
const L = (marketId, side, c) => ({ marketId, side, c, desc: 'TEST ' + marketId });
const sub = (name, bets) => P.ISSUE_PREFIX + name + '\n```json\n' + JSON.stringify(P.submission(name, bets)) + '\n```';
const issues = [
  { title: 'Play score: Amy', user: { login: 'amy' }, created_at: '2026-10-21T00:00:00Z', body: sub('Amy', [
    { id: '1', at: '2026-10-18T10:00:00Z', stake: 100, legs: [L('aec-nfl-dal-gb-2026-10-18', 'no', 50)], status: 'lost' },        // GB won -> win (status typed as lost is ignored)
    { id: '2', at: '2026-10-18T11:00:00Z', stake: 100, legs: [L('aec-nfl-dal-gb-2026-10-18', 'yes', 40)] } ]) },                   // loss
  { title: 'Play score: Amy old', user: { login: 'amy' }, created_at: '2026-10-19T00:00:00Z', body: sub('Amy old', []) },          // older, ignored
  { title: 'Play score: Bo', user: { login: 'bo' }, created_at: '2026-10-20T00:00:00Z', body: sub('Bo', [
    { id: '3', at: '2026-10-18T10:00:00Z', stake: 200, legs: [L('aec-nfl-dal-gb-2026-10-18', 'no', 50), L('aec-nba-phi-ny-2026-10-20', 'yes', 50)] } ]) },
  { title: 'Bug report', user: { login: 'cy' }, body: 'not a score' },
  { title: 'Play score: <script>', user: { login: 'dee' }, body: '```json\n{"v":1,"name":"<script>","bets":[]}\n```' } ];
const doc = await build(issues.filter(i => i.title.startsWith(P.ISSUE_PREFIX)));
assert.deepStrictEqual(doc.rows.map(r => [r.name, r.points, r.w, r.l]), [['Bo', 1600, 1, 0], ['Amy', 1000, 1, 1]]);
assert.strictEqual(doc.rows[1].roi, 0); assert.strictEqual(doc.rows[0].best.odds, '+300');
assert.doesNotMatch(JSON.stringify(doc), /[$¢]/);
console.log('ok leaderboard re-settles from real results, newest issue per user, junk dropped');
