/**
 * tests/refresh.smoke.js — Picks "Refresh prices" in a real browser at 390px.
 * Hits the REAL Polymarket US gateway from the page (proves CORS works), then
 * a second run blocks the gateway to check the saved-prices fallback.
 * Usage: CH=<chromium> NODE_PATH=<puppeteer-core> node tests/refresh.smoke.js <site url> [shots dir]
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/live';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
async function run(b, block) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  if (block) { await p.setRequestInterception(true); p.on('request', r => (/gateway\.polymarket\.us\/v1\/markets/.test(r.url()) ? r.abort('blockedbyclient') : r.continue())); }
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  if (await p.$('#ob-name')) { await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]'); }
  await p.waitForSelector('#picks-refresh');
  await p.click('#picks-refresh');
  await p.waitForFunction(() => { const s = document.querySelector('#picks-px-status'); return s && /prices from/i.test(s.textContent); }, { timeout: 20000 });
  const st = await p.$eval('#picks-px-status', e => e.textContent);
  if (block) ok(/Could not get live prices.*saved prices from/.test(st), 'fallback when gateway blocked: ' + st);
  else ok(/^Live prices from/.test(st), 'live prices fetched in the browser (CORS ok): ' + st);
  ok((await p.$$('.tabbar button')).length === 6, 'still 6 tabs');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  await p.screenshot({ path: `${SHOT}/refresh-${block ? 'fallback' : 'live'}.png` });
  // Build a Bet keeps its own refresh button (live per leg).
  if (!block) { await p.evaluate(() => { location.hash = '#calc'; }); await new Promise(r => setTimeout(r, 800)); ok(!!(await p.$('#refresh-px')), 'Build a Bet refresh button'); }
  await p.close();
}
(async () => { const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] }); await run(b, false); await run(b, true); await b.close(); })();
