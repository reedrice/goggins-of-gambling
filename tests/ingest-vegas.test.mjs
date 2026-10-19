/** tests/ingest-vegas.test.mjs — exact-line matching for hand-read odds (scripts/ingest-vegas.mjs). */
import assert from 'node:assert';
import { match, validAmerican } from '../scripts/ingest-vegas.mjs';
const ev = { markets: [
  { id: 'int-1', type: 'prop', smt: 'football_player_interceptions_thrown', player: 'Brock Purdy', line: 1 },
  { id: 'py-250', type: 'prop', smt: 'football_player_passing_yards', player: 'Brock Purdy', line: 250 },
  { id: 'hit-1', type: 'prop', smt: 'baseball_player_hits', player: 'José Ramírez', line: 1 }] };
const meta = { book: 'bovada', at: '2026-10-19T17:40:00.000Z', src: 'bovada-manual' };
const r = match([
  { game: 'g', player: 'Brock Purdy', stat: 'football_player_interceptions_thrown', ou: 0.5, over: '+110', under: '-145' },
  { game: 'g', player: 'Brock Purdy', stat: 'football_player_passing_yards', ou: 252.5, over: '-115', under: '-115' },   // 253+ doesn't exist
  { game: 'g', player: 'Jose Ramirez', stat: 'baseball_player_hits', plus: 1, yes: '-176' },
  { game: 'g', player: 'Brock Purdy', stat: 'football_player_interceptions_thrown', ou: 1, over: '+110' },               // not .5
  { game: 'g', player: 'Brock Purdy', stat: 'football_player_interceptions_thrown', ou: 0.5, over: '110' }], () => ev, meta);
assert.deepStrictEqual(Object.keys(r.lines).sort(), ['hit-1|yes', 'int-1|no', 'int-1|yes']);
assert.deepStrictEqual(r.lines['int-1|yes'], { p: '+110', b: 'bovada', n: 1, at: meta.at, src: 'bovada-manual' });
assert.ok(!r.lines['hit-1|no'], 'Yes-only has no No price');
assert.strictEqual(r.unmatched.length, 1); assert.strictEqual(r.bad.length, 2);
assert.ok(validAmerican('-105') && !validAmerican('+99') && !validAmerican('110'));
console.log('ok ingest-vegas: exact lines only, Yes-only, accents, bad odds');
