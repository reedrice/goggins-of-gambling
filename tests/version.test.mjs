// node --test tests/version.test.mjs — index.html ?v=, APP_VERSION and version.json must match (HANDOFF §49).
import test from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
test('version stamps agree', () => { assert.match(execFileSync('node', ['scripts/bump-version.mjs', '--check'], { encoding: 'utf8' }), /version ok/); });
