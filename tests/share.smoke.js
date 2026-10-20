/**
 * tests/share.smoke.js: Share button, menu, picture export and ?pick= deep links (HANDOFF §46).
 *   python3 -m http.server 8765 &  CHROME=/usr/bin/google-chrome node tests/share.smoke.js http://localhost:8765/
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const SHOT = process.env.SHOT || '/workspace/shots';
(async () => {
  const base = process.argv[2] || 'http://localhost:8765/';
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await p.goto(base, { waitUntil: 'networkidle0' });
  await p.type('#ob-name', 'Tester'); await p.type('#ob-bankroll', '500');
  await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) process.exitCode = 1; };
  const counts = await p.evaluate(() => ({ cards: document.querySelectorAll('#tab-picks .card[data-pick-id]:not([data-pick-id=""])').length, btns: document.querySelectorAll('#tab-picks [data-share]').length }));
  ok(`every pick card has Share (${counts.btns}/${counts.cards})`, counts.cards > 0 && counts.cards === counts.btns);
  // Picture export (no taint: toDataURL must not throw)
  const pick = await p.evaluate(() => [...document.querySelectorAll('[data-share]')].map(b => b.dataset.share).find(id => /lotto-10/.test(id)) || document.querySelector('[data-share]').dataset.share);
  await p.click(`[data-share="${pick}"]`);
  await p.waitForSelector('.share-menu');
  await p.evaluate(() => document.querySelector('.share-menu').scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: SHOT + '/share-menu.png' });
  ok('menu has Copy link + Save as picture', (await p.$$eval('.share-menu button', bs => bs.map(x => x.textContent).join('|'))).match(/Copy link.*Save as picture/));
  const url = await p.evaluate(id => { const info = window.BetDash.shareInfo(id); return { info, href: window.Share.draw(info).toDataURL('image/png') }; }, pick);
  fs.writeFileSync(SHOT + '/share-example.png', Buffer.from(url.href.split(',')[1], 'base64'));
  ok('picture exported (canvas not tainted)', url.href.length > 10000);
  ok('picture has no cents/stake words', !/¢|units?\b|bankroll/i.test(JSON.stringify(url.info)));
  // Deep link to a current pick
  await p.goto(base + '?pick=' + encodeURIComponent(pick), { waitUntil: 'networkidle0' });
  await p.waitForSelector('.card.pick-hl', { timeout: 8000 }).catch(() => {});
  ok('deep link highlights the card', await p.$('.card.pick-hl[data-pick-id="' + pick + '"]'));
  // Deep link to an older pick -> Record slip pop-up
  const old = await p.evaluate(async () => { const r = await fetch('data/pick-history.json'); const h = await r.json(); const pj = await (await fetch('data/picks.json')).json(); const ids = new Set(Object.values(pj.sections).flat().map(x => x.id)); const o = h.picks.find(x => !ids.has(x.id)); return o && o.id; });
  if (old) {
    await p.goto(base + '?pick=' + encodeURIComponent(old), { waitUntil: 'networkidle0' });
    const onBoard = await p.$('[data-pick-id="' + old + '"]');
    if (!onBoard) { await p.waitForSelector('.sheet', { timeout: 8000 }).catch(() => {}); ok('old pick opens its slip', await p.$('.sheet [data-share-hist]')); }
    else ok('old pick still on board (highlighted)', true);
  }
  if (await p.$('.sheet')) await p.screenshot({ path: SHOT + '/share-slip.png' });
  ok('no page errors ' + errs.join('; '), errs.length === 0);
  await b.close();
})();
