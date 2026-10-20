/**
 * tests/record-unified.smoke.js — Record tab: both sections show the same 5 stat boxes (HANDOFF §41).
 * Usage: CH=<chrome> NODE_PATH=<puppeteer-core parent> node tests/record-unified.smoke.js <site url> [shot path]
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/record-unified.png';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  await p.evaluate(() => { location.hash = '#record'; }); await p.waitForSelector('tr[data-hist]');
  await new Promise(r => setTimeout(r, 4500));   // let the toast fade
  const sets = await p.$$eval('#tab-record .kpis-5', ks => ks.map(k => [...k.querySelectorAll('.k')].map(x => x.textContent + '=' + x.nextElementSibling.textContent)));
  console.log(JSON.stringify(sets));
  ok(sets.length === 2 && sets[0].map(x => x.split('=')[0]).join() === sets[1].map(x => x.split('=')[0]).join(), 'same 5 boxes, same order, in both sections');
  ok(!/[$¢]/.test(JSON.stringify(sets)), 'no dollars or cents in stat boxes');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  await p.screenshot({ path: SHOT });
  await b.close();
})();
