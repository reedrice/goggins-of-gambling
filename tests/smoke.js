/**
 * tests/smoke.js — headless browser smoke test of the full UI flow.
 * Requires Chrome + puppeteer-core (not a repo dependency):
 *   npm i --no-save puppeteer-core && python3 -m http.server 8765 &
 *   CHROME=/usr/bin/google-chrome node tests/smoke.js http://localhost:8765/
 * Walks onboarding -> picks -> load pick into calculator -> save -> settle
 * -> record -> settings, prints key numbers, and lists any console errors.
 * Screenshots go to $SHOT_DIR (default /tmp).
 */
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('requestfailed', r => errs.push('reqfail: ' + r.url()));
  const base = process.argv[2] || 'http://localhost:8765/';
  await p.goto(base, { waitUntil: 'networkidle0' });
  console.log('title:', await p.title());
  console.log('onboarding visible:', await p.$eval('#onboarding', e => !e.hidden), 'app hidden:', await p.$eval('#app', e => e.hidden));
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/1-onboard.png' });
  await p.type('#ob-name', 'Tester'); await p.type('#ob-bankroll', '500');
  console.log('auto unit:', await p.$eval('#ob-unit', e => e.value), 'auto max:', await p.$eval('#ob-max', e => e.value));
  await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  console.log('pick cards:', await p.$$eval('#tab-picks .card', x => x.length));
  console.log('first stake:', await p.$eval('#tab-picks .card', e => e.textContent.match(/Stake:[^\n]*/)[0].trim()));
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/2-picks.png', fullPage: false });
  // load parlay pick into calc
  await p.click('[data-load-pick="x-cle-plus15-under"]');
  await p.waitForSelector('#calc-out .kpi');
  console.log('calc out:', await p.$eval('#calc-out', e => e.innerText.replace(/\n/g, ' | ')));
  console.log('calc out2:', await p.$eval('#calc-out2', e => e.innerText.replace(/\n/g, ' | ')));
  // American + decimal leg
  await p.click('#add-leg');
  const prices = await p.$$('.l-price');
  await prices[2].type('-150');
  console.log('hint leg3:', await p.$$eval('.leg-hint', x => x[2].textContent));
  console.log('calc out w/3 legs:', await p.$eval('#calc-out', e => e.innerText.replace(/\n/g, ' | ')));
  await p.click('.leg:nth-child(3) .remove');
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/3-calc.png', fullPage: true });
  await p.click('#c-save');
  await p.waitForSelector('#tab-bets:not([hidden]) [data-settle]');
  await p.click('[data-settle="won"]');
  await new Promise(r => setTimeout(r, 300));
  console.log('header bankroll after win:', await p.$eval('#hdr-bankroll', e => e.textContent));
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/4-bets.png', fullPage: true });
  await p.click('[data-go="record"]'); await new Promise(r => setTimeout(r, 600));
  console.log('record:', (await p.$eval('#tab-record', e => e.innerText)).replace(/\n+/g, ' | ').slice(0, 400));
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/5-record.png', fullPage: true });
  await p.click('[data-go="settings"]'); await new Promise(r => setTimeout(r, 200));
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/6-settings.png', fullPage: true });
  const ls = await p.evaluate(() => Object.keys(localStorage));
  console.log('localStorage keys:', ls);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
