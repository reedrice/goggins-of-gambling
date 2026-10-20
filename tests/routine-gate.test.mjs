// tests/routine-gate.test.mjs — one-bot-per-routine switch (TEST DATA).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { decide, stamp, setOwner, FILE } from '../scripts/routine-gate.mjs';

const doc = () => ({ routines: { a: { owner: 'grok', enabled: true, last_run_by: null, last_run_at: null } } });
const NOW = Date.parse('2026-10-20T20:00:00Z');

test('owner + enabled = RUN, else SKIP', () => {
  assert.strictEqual(decide(doc(), 'a', 'grok', NOW).run, true);
  assert.match(decide(doc(), 'a', 'chatgpt', NOW).reason, /owner is grok/);
  const off = doc(); off.routines.a.enabled = false;
  assert.strictEqual(decide(off, 'a', 'grok', NOW).run, false);
  assert.match(decide(doc(), 'zzz', 'grok', NOW).reason, /unknown/);
});
test('handover guard: someone else ran it < 30 min ago', () => {
  const d = setOwner(stamp(doc(), 'a', 'grok', '2026-10-20T19:45:00Z'), 'a', 'chatgpt');
  assert.match(decide(d, 'a', 'chatgpt', NOW).reason, /handover/);
  assert.strictEqual(decide(d, 'a', 'chatgpt', NOW + 20 * 60e3).run, true);
  assert.strictEqual(decide(stamp(doc(), 'a', 'grok', '2026-10-20T19:59:00Z'), 'a', 'grok', NOW).run, true);   // own run is fine
});
test('setOwner', () => {
  assert.strictEqual(setOwner(doc(), 'a', 'off').routines.a.enabled, false);
  assert.strictEqual(setOwner(doc(), 'a', 'pablo', { off: true }).routines.a.enabled, false);
  assert.throws(() => setOwner(doc(), 'a', 'bob'));
});
test('real owners.json has all 5 routines, no dollar amounts', () => {
  const raw = fs.readFileSync(FILE, 'utf8'), d = JSON.parse(raw);
  for (const id of ['daily-slate-odds-digest', 'lineup-goalie-check', 'late-scratch-check', 'play-money-leaderboard-update', 'weekly-learning-review'])
    assert.ok(d.routines[id] && 'owner' in d.routines[id] && 'schedule_ct' in d.routines[id], id);
  assert.doesNotMatch(raw, /\$/);
});
