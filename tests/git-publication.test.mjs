import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationDiagnostic, publishGeneratedCommit} from '../scripts/git-publication.mjs';

function fixture(errors, remote = 'base') {
 const calls = [], waits = [];
 const git = (...args) => {
  calls.push(args);
  if (args[0] === 'push' && errors.length) throw {stderr: errors.shift()};
  if (args[0] === 'rev-parse') return args[1] === 'HEAD' ? 'prepared' : args[1] === 'HEAD^' ? 'base' : remote;
  return '';
 };
 return {git, calls, waits, sleep: async ms => waits.push(ms), log: () => {}};
}

test('temporary server failure retries the prepared commit once without regenerating', async () => {
 const f = fixture(['remote: Internal Server Error\nfatal: HTTP 503']);
 assert.equal(await publishGeneratedCommit(f), 'published');
 assert.equal(f.calls.filter(c => c[0] === 'push').length, 2);
 assert.deepEqual(f.waits, [3000]);
 assert.ok(f.calls.every(c => !c.includes('--force') && !c.includes('--hard')));
});

test('a main race returns control for full regeneration, never retries stale data', async () => {
 const f = fixture(['rejected: non-fast-forward'], 'new-main');
 assert.equal(await publishGeneratedCommit(f), 'regenerate');
 assert.equal(f.calls.filter(c => c[0] === 'push').length, 1);
 assert.deepEqual(f.waits, []);
});

test('a lost acknowledgement after an accepted push is a verified success', async () => {
 const f = fixture(['connection reset'], 'prepared');
 assert.equal(await publishGeneratedCommit(f), 'published');
 assert.equal(f.calls.filter(c => c[0] === 'push').length, 1);
});

test('permissions and oversized files fail visibly without transport retries', async () => {
 for (const error of ['remote: permission denied (HTTP 403)', 'remote: file exceeds maximum file size']) {
  const f = fixture([error]);
  await assert.rejects(publishGeneratedCommit(f), /Feed publication failed.*remote:/);
  assert.deepEqual(f.waits, []);
 }
});

test('persistent transient failures remain bounded and preserve diagnostic evidence', async () => {
 const f = fixture(['HTTP 502 bad gateway', 'HTTP 503 service unavailable']);
 await assert.rejects(publishGeneratedCommit(f), /HTTP 503 service unavailable/);
 assert.equal(f.calls.filter(c => c[0] === 'push').length, 2);
});

test('diagnostics redact credentials while retaining the cause', () => {
 const text = publicationDiagnostic({stderr: 'remote: HTTP 403\nhttps://user:secret@example.com/repo\nAuthorization: Basic encoded\nghp_FAKE_TOKEN custom-secret'}, ['custom-secret']);
 assert.match(text, /HTTP 403/);
 for (const secret of ['user:secret', 'encoded', 'ghp_FAKE_TOKEN', 'custom-secret']) assert.ok(!text.includes(secret));
});
