// node --test tests/live-watch.test.mjs
// Tests for scripts/live-watch.mjs using TEST DATA in tests/fixtures/live-watch-sample.json
// (made-up prices, no network).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { american, pays, quote, liquid, findMoves } from '../scripts/live-watch.mjs';

const F = JSON.parse(fs.readFileSync(new URL('./fixtures/live-watch-sample.json', import.meta.url), 'utf8'));

test('american odds', () => {
  assert.strictEqual(american(40), '+150');
  assert.strictEqual(american(60), '-150');
  assert.strictEqual(american(0), '—');
});

test('$10 pays (stake + profit)', () => assert.strictEqual(pays(40), '25.00'));

test('thin markets are skipped', () => {
  const thin = F.event.markets.find(m => m.id === 'thin');
  assert.strictEqual(liquid(quote(thin)), false);
});

test('only big moves alert, biggest first, no cents', () => {
  const r = findMoves(F.open, {}, F.event);
  assert.strictEqual(r.watched, 3);
  assert.strictEqual(r.skipped, 1);
  assert.strictEqual(r.alerts.length, 2);            // ml and tot moved 11 pts; calm moved 2
  for (const a of r.alerts) { assert.match(a.text, /\$10 pays \$/); assert.doesNotMatch(a.text, /¢/); }
  assert.match(r.alerts.find(a => a.text.includes('AAA win')).text, /now \+150/);   // AAA got cheaper
  assert.match(r.alerts.find(a => a.text.includes('Under')).text, /Under 40\.5/);    // Over rose -> Under cheaper
});
