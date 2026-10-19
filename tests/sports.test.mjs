// Every sport in config.js `sports` must be wired everywhere (NBA audit, Oct 19 2026):
// Polymarket leagues, Kalshi series, Vegas odds keys, team logos, positions.
import fs from 'node:fs'; import assert from 'node:assert'; import vm from 'node:vm'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), R = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ctx = { window: {} }; vm.runInNewContext(R('config.js'), ctx);
const sports = ctx.window.APP_CONFIG.sports;
assert.ok(sports.includes('NBA'), 'NBA is one of our sports');
const Core = require('../js/markets-core.js');
for (const s of sports.filter(s => s !== 'Soccer')) {
  const lg = s.toLowerCase();
  assert.strictEqual(Core.LEAGUES[lg], s, `${s}: MarketsCore.LEAGUES`);
  assert.match(R('scripts/fetch-markets.mjs'), new RegExp(`\\n  ${lg}: \\{ game:`), `${s}: Kalshi series`);
  assert.match(R('scripts/fetch-book-odds.mjs'), new RegExp(`const SPORT_KEYS = \\{[^}]*\\b${lg}:`), `${s}: Odds API sport key`);
  assert.match(R('js/teams.js'), new RegExp(`ESPN_LEAGUES = \\[[^\\]]*'${lg}'`), `${s}: team logos`);
  assert.match(R('scripts/fetch-positions.mjs'), new RegExp(`\\b${lg}: '[a-z]+/${lg}'`), `${s}: positions`);
}
console.log('ok all our sports are wired everywhere:', sports.join(', '));
