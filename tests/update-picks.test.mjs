/**
 * tests/update-picks.test.mjs: next-day picks in scripts/update-picks.mjs.
 * Run: node tests/update-picks.test.mjs
 * Covers per-pick slate_date / start_time validation and carryOver(), the
 * rule `picks <file>` uses to keep tomorrow's picks when today's slate is
 * replaced (same id = replaced, --drop = removed, earlier days = dropped).
 */
import assert from 'assert';
import { carryOver, validatePicks } from '../scripts/update-picks.mjs';
let fails = 0;
function test(name, fn) { try { fn(); console.log('ok', name); } catch (e) { fails++; console.log('FAIL', name, '-', e.message); } }

// A minimal valid single on a given day (slate_date omitted = file's day).
const single = (id, day) => Object.assign({ id, sport: 'NBA', event: 'A @ B', market: 'Moneyline', side: 'B', platform: 'Polymarket US', price: 50, stake_units: 0.25, action: 'bet' }, day ? { slate_date: day } : {});
const doc = (slate, singles) => ({ schema_version: 1, slate_date: slate, updated_at: '2026-10-19T08:00:00Z', sections: { singles } });

test('old file: earlier-day picks dropped, later-day kept with explicit day', () => {
  const old = doc('2026-10-19', [single('a'), single('b', '2026-10-20'), single('c', '2026-10-21')]);
  const kept = carryOver(old, doc('2026-10-20', []));
  assert.deepStrictEqual(kept.map(k => k.pick.id), ['b', 'c']);
  assert.strictEqual(kept[0].pick.slate_date, '2026-10-20');
});
test('same id in the new file replaces the carried pick', () => {
  const old = doc('2026-10-19', [single('b', '2026-10-20')]);
  assert.strictEqual(carryOver(old, doc('2026-10-20', [single('b')])).length, 0);
});
test('--drop removes a carried pick', () => {
  const old = doc('2026-10-19', [single('b', '2026-10-20'), single('c', '2026-10-20')]);
  assert.deepStrictEqual(carryOver(old, doc('2026-10-20', []), ['b']).map(k => k.pick.id), ['c']);
});
test('pick with no own day takes the old file day', () => {
  const old = doc('2026-10-20', [single('x')]);
  assert.strictEqual(carryOver(old, doc('2026-10-20', [])).length, 1);
  assert.strictEqual(carryOver(old, doc('2026-10-21', [])).length, 0);
});
// Lineup notes (HANDOFF §34): status from a fixed list, source required, ISO checked_at.
test('validator: lineup_note shape', () => {
  const ok = { status: 'confirmed', text: 'He is in the lineup.', source: 'Daily Faceoff', source_url: 'https://www.dailyfaceoff.com/teams', checked_at: '2026-10-19T21:00:00Z' };
  assert.deepStrictEqual(validatePicks(doc('2026-10-19', [Object.assign(single('a'), { lineup_note: ok })])), []);
  assert.deepStrictEqual(validatePicks(doc('2026-10-19', [Object.assign(single('a'), { lineup_note: null })])), []);
  const bad = n => validatePicks(doc('2026-10-19', [Object.assign(single('a'), { lineup_note: Object.assign({}, ok, n) })])).length;
  assert.ok(bad({ status: 'maybe' }) > 0, 'unknown status');
  assert.ok(bad({ source: '' }) > 0, 'missing source');
  assert.ok(bad({ checked_at: 'noon' }) > 0, 'bad time');
  assert.ok(bad({ source_url: 'javascript:alert(1)' }) > 0, 'non-http link');
});

test('validator: slate_date / start_time formats', () => {
  const good = doc('2026-10-19', [Object.assign(single('g', '2026-10-20'), { start_time: '2026-10-20T23:00:00Z' })]);
  assert.deepStrictEqual(validatePicks(good), []);
  const bad = doc('2026-10-19', [Object.assign(single('h', '10/20'), { start_time: 'tomorrow' })]);
  const errs = validatePicks(bad).join(' ');
  assert.ok(/slate_date/.test(errs) && /start_time/.test(errs), errs);
});
test('validator: duplicate id across days is rejected', () => {
  assert.ok(validatePicks(doc('2026-10-19', [single('d'), single('d', '2026-10-20')])).length > 0);
});
process.exit(fails ? 1 : 0);
