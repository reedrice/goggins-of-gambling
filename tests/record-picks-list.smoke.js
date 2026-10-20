/**
 * tests/record-picks-list.smoke.js — Record tab "Our Picks-page picks" list + its slip (HANDOFF §40).
 * Usage: CH=<chrome> NODE_PATH=<puppeteer-core parent> node tests/record-picks-list.smoke.js <site url> [shot path]
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/record-picks-list.png';
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
  await p.evaluate(() => { location.hash = '#record'; }); await p.waitForSelector('tr[data-hist]');
  const page = await p.$eval('#tab-record', e => e.textContent);
  ok(/Our Picks-page picks/.test(page) && /Game winner picks/.test(page), 'both sections, clearly labeled');
  ok(!/¢/.test(page) && !/\$\d/.test(page.split('Our Picks-page picks')[1].split('How')[0]), 'no cents, no dollars in the list');
  // Screenshot 1 (list): scroll the section into view.
  await p.evaluate(() => [...document.querySelectorAll('#tab-record h3')].find(h => /Picks-page/.test(h.textContent)).scrollIntoView());
  await wait(300); await p.screenshot({ path: SHOT.replace('.png', '-list-only.png') });
  // Open a combo slip (one with several legs).
  const id = await p.$$eval('tr[data-hist]', rs => (rs.find(r => /combo/.test(r.innerText)) || rs[0]).dataset.hist);
  await p.click(`tr[data-hist="${id}"]`); await p.waitForSelector('.sheet-back'); await wait(400);
  const t = await p.$eval('.sheet', e => e.innerText); console.log(t);
  ok(/legs/i.test(t) && /→/.test(t) && !/¢/.test(t), 'slip has legs, payout line, no cents');
  await p.screenshot({ path: SHOT });
  await p.keyboard.press('Escape'); ok(!(await p.$('.sheet-back')), 'Esc closes');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  await b.close();
})();
