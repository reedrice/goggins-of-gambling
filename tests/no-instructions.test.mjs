// node --test tests/no-instructions.test.mjs — analyzer, not pick seller (HANDOFF §54).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../js/plain.js');
const BAD = [/tap\s+["“\\]*no\b/i, /tap\s+["“\\]*yes\b/i, /\s[—–-]\s+tap\b/i, /suggested bet/i];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.json') ? [path.join(d, e.name)] : []);

test('no bet instructions in data/*.json', () => {
  for (const f of walk('data')) {
    const t = fs.readFileSync(f, 'utf8');
    for (const re of BAD) assert.ok(!re.test(t), `${f} contains ${re}`);
  }
});
test('no bet instructions in user-facing strings', () => {
  const t = fs.readFileSync('js/strings.js', 'utf8');
  for (const re of BAD) assert.ok(!re.test(t), `js/strings.js contains ${re}`);
  assert.ok(!/pocket change|I\\'d play|small play only|Tiny bet/i.test(t));
});
test('neutral() + splitTap() strip advice', () => {
  assert.strictEqual(P.splitTap('Under 221.5 total points — tap "No" on Over 221.5').title, 'Under 221.5 total points');
  assert.strictEqual(P.neutral('Good price vs Vegas. Tiny bet.'), 'Good price vs Vegas.');
  assert.strictEqual(P.neutral('No edge now. Skip.'), 'No edge now.');
  assert.strictEqual(P.neutral('The price is fair, so keep it tiny or skip.'), '');
  assert.strictEqual(P.neutral('Wins about 6 out of 10 times.'), 'Wins about 6 out of 10 times.');
});
