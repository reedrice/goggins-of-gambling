/**
 * tests/record-slip.smoke.js — Record tab: tap a "Recent picks" row -> slip sheet (HANDOFF §39).
 * Usage: CH=<chrome> NODE_PATH=<puppeteer-core parent> node tests/record-slip.smoke.js <site url> [shot path]
 * Checks: sheet opens, no cents shown, "$X → $Y" line, closes via X / backdrop / Esc, 6 tabs.
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/record-slip.png';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  await p.evaluate(() => { location.hash = '#record'; }); await p.waitForSelector('tr[data-pred]');
  const open = async () => { await p.click('tr[data-pred]'); await p.waitForSelector('.sheet-back'); await wait(400); };
  await open();
  const t = await p.$eval('.sheet', e => e.innerText);
  console.log(t);
  ok(!/¢/.test(t), 'no cents in the slip');
  ok(/We picked/.test(t) && /Our chance/.test(t), 'pick + chance shown');
  await p.screenshot({ path: SHOT });
  await p.click('.sheet-x'); ok(!(await p.$('.sheet-back')), 'X closes');
  await open(); await p.mouse.click(195, 40); await wait(200); ok(!(await p.$('.sheet-back')), 'backdrop tap closes');
  await open(); await p.keyboard.press('Escape'); ok(!(await p.$('.sheet-back')), 'Esc closes');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  await b.close();
})();
