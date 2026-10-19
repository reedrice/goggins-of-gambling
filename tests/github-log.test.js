/**
 * tests/github-log.test.js — exercises js/github-log.js against a mocked
 * GitHub contents API (no network). Run: node tests/github-log.test.js
 * Verifies: UTF-8 base64 round-trip, dollar-free record allow-list, upsert by
 * id, and the 409 stale-sha -> re-GET -> retry flow.
 */
global.window = { APP_CONFIG: { repoOwner: 'o', repoName: 'r', repoBranch: 'main', betLogPath: 'data/bet-log.json' } };
require('../js/github-log.js');
const G = window.GitHubLog;
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };

// Fake repo state: one file with a sha that changes on every write.
let file = { records: [{ id: 'a', result: 'pending' }] }, sha = 'sha1', conflictsLeft = 1, puts = 0;
global.fetch = async (url, opts = {}) => {
  const res = (status, body) => ({ status, ok: status < 300, json: async () => body });
  if (url.endsWith('/user')) return res(200, { login: 'tester' });
  if (!opts.method) return res(200, { sha, content: G._b64encode(JSON.stringify(file)) });
  const body = JSON.parse(opts.body);
  puts++;
  if (conflictsLeft > 0) { conflictsLeft--; file.records.push({ id: 'other-writer' }); sha = 'sha2'; return res(409, {}); }
  if (body.sha !== sha) return res(409, {});
  file = JSON.parse(G._b64decode(body.content)); sha = 'sha3';
  return res(200, {});
};

(async () => {
  ok(G._b64decode(G._b64encode('Rays −1.5 ¢')) === 'Rays −1.5 ¢', 'utf-8 base64 round-trip');
  const bet = { id: 'b1', createdAt: '2026-10-19T06:00:00Z', settledAt: null, platform: 'Polymarket US', category: 'parlay',
    legs: [{ desc: 'G +1.5', price: '63', p: 0.63 }], estMultiple: 3.3069, quotedMultiple: 2.97, stake: 5, status: 'open' };
  const rec = G.buildRecord(bet, 'tester');
  ok(!('stake' in rec) && !JSON.stringify(rec).includes('"p"'), 'no stake / private fields in record');
  const rec2 = G.buildRecord(Object.assign({}, bet, { legs: [{ desc: 'A', price: '50', startTime: '2026-10-20T00:15:00Z', marketId: 'x' }, { desc: 'B', price: '40', startTime: 'tonight $5' }] }), 'tester');
  ok(rec2.legs[0].start_time === '2026-10-20T00:15:00Z' && !('marketId' in rec2.legs[0]) && !('start_time' in rec2.legs[1]), 'leg start_time copied only when strict ISO');
  ok(rec.result === 'pending' && rec.gap === +(2.97 / 3.3069 - 1).toFixed(4), 'record gap + pending');
  await G.upsertRecord(rec, 'tok');
  ok(puts === 2, 'retried once after 409 (puts=' + puts + ')');
  ok(file.records.some(r => r.id === 'other-writer') && file.records.some(r => r.id === 'b1'), 'kept concurrent writer + added ours');
  await G.upsertRecord(G.buildRecord(Object.assign({}, bet, { status: 'won', settledAt: '2026-10-20T03:00:00Z' }), 'tester'), 'tok');
  ok(file.records.filter(r => r.id === 'b1').length === 1 && file.records.find(r => r.id === 'b1').result === 'won', 'settle updates in place');
})();
