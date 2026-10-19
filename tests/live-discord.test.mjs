// node --test tests/live-discord.test.mjs
// scripts/live-discord.mjs with a MOCKED fetch. TEST DATA only; nothing is ever posted.
import test from 'node:test';
import assert from 'node:assert';
import { run, shouldPost, formatMessage, scrub, MAX_PER_RUN } from '../scripts/live-discord.mjs';

const HOOK = 'https://discord.com/api/webhooks/000/TEST-NOT-REAL';
const NOW = Date.parse('2026-10-20T01:30:00.000Z');
const A = (id, o = {}) => ({ id, key: id, at: '2026-10-20T01:25:00.000Z', type: 'new_edge', tier: 'big', side: 'TEST Commanders win',
  market: 'Moneyline', now_odds: '+456', now_chance: 18, edge: 12, url: 'https://polymarket.us/x', ...o });
const DATA = (alerts) => ({ url: 'https://polymarket.us/x', alerts, edges: [{ key: 'a', context: 'WSH down 7, Q2 9:14' }], game_context: { available: true, game_state: 'in', period: 2, clock: '9:14', away: { abbr: 'WSH', score: 10 }, home: { abbr: 'SF', score: 17 } } });
const mock = (status = 204) => { const calls = []; const f = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: status < 300, status, json: async () => ({ retry_after: 0.01 }) }; }; f.calls = calls; return f; };
const nowait = async () => {};

test('only big new edges and likely-news alerts, within +500/-500', () => {
  assert.ok(shouldPost(A('a')));
  assert.ok(shouldPost(A('n', { type: 'news', tier: 'big' })));
  assert.ok(!shouldPost(A('s', { tier: 'slight' })));
  assert.ok(!shouldPost(A('g', { type: 'gone' })));
  assert.ok(!shouldPost(A('r', { type: 'removed' })));
  assert.ok(!shouldPost(A('long', { now_chance: 12 })));        // about +733: past the limit
  assert.ok(!shouldPost(A('fav', { now_chance: 90 })));
});

test('message: bet, market, American odds, whole-dollar pays, edge, context, link; no pings', () => {
  const m = formatMessage(DATA([]), A('a', { side: 'TEST @everyone win' }));
  assert.match(m, /Big edge: TEST @\u200beveryone win/);
  assert.match(m, /Moneyline · \+456 · \$10 pays \$55 · 12 pts cheaper than open/);
  assert.match(m, /WSH down 7, Q2 9:14/);
  assert.match(m, /<https:\/\/polymarket\.us\/x>/);
  assert.doesNotMatch(m, /\.\d\d\b|¢/);
});

test('posts each alert once, oldest first, allowed_mentions none; state dedupes', async () => {
  const f = mock(), state = { posted: [] };
  const data = DATA([A('b', { at: '2026-10-20T01:28:00.000Z' }), A('a'), A('s', { tier: 'slight' })]);
  const r = await run({ data, state, webhook: HOOK, fetchImpl: f, now: NOW, wait: nowait });
  assert.deepStrictEqual(r.posted, ['a', 'b']);
  assert.deepStrictEqual(f.calls[0].body.allowed_mentions, { parse: [] });
  const r2 = await run({ data, state, webhook: HOOK, fetchImpl: f, now: NOW, wait: nowait });
  assert.deepStrictEqual(r2.posted, []); assert.strictEqual(f.calls.length, 2);
});

test('no webhook: does nothing', async () => {
  const f = mock(); const r = await run({ data: DATA([A('a')]), state: {}, webhook: undefined, fetchImpl: f, now: NOW, wait: nowait });
  assert.deepStrictEqual(r.posted, []); assert.strictEqual(f.calls.length, 0);
});

test('stale alerts skipped, per-run cap, 429 retried once', async () => {
  const f = mock(), state = { posted: [] };
  const many = Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => A('m' + i));
  const r = await run({ data: DATA([...many, A('old', { at: '2026-10-20T00:30:00.000Z' })]), state, webhook: HOOK, fetchImpl: f, now: NOW, wait: nowait });
  assert.strictEqual(r.posted.length, MAX_PER_RUN); assert.strictEqual(r.skipped, 1);
  let n = 0; const f429 = async () => (++n === 1 ? { ok: false, status: 429, json: async () => ({ retry_after: 0.01 }) } : { ok: true, status: 204 });
  const r2 = await run({ data: DATA([A('z')]), state: { posted: [] }, webhook: HOOK, fetchImpl: f429, now: NOW, wait: nowait });
  assert.deepStrictEqual(r2.posted, ['z']); assert.strictEqual(n, 2);
});

test('errors never contain the webhook', async () => {
  const boom = async () => { throw new Error(`connect failed ${HOOK}`); };
  const r = await run({ data: DATA([A('a')]), state: { posted: [] }, webhook: HOOK, fetchImpl: boom, now: NOW, wait: nowait });
  assert.strictEqual(r.errors.length, 1); assert.doesNotMatch(r.errors[0], /discord\.com\/api\/webhooks|TEST-NOT-REAL/);
  assert.strictEqual(scrub('x https://discordapp.com/api/webhooks/1/abc y'), 'x [webhook] y');
});
