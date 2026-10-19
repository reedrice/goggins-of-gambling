/**
 * tests/smoke.js — headless browser walk-through of the whole UI.
 * Requires Chrome + puppeteer-core (not a repo dependency):
 *   npm i --no-save puppeteer-core && python3 -m http.server 8765 &
 *   CHROME=/usr/bin/google-chrome node tests/smoke.js http://localhost:8765/
 * Covers: onboarding (incl. platform step) -> picks (logos, Open links) ->
 * builder search ("purdy") + browse (game -> spread) -> related-picks flag ->
 * live price refresh -> save -> settle -> record (10 platform rows) ->
 * settings (platform + price format stay in sync). Prints key numbers and any
 * console errors. Screenshots go to $SHOT_DIR (default /tmp).
 */
const puppeteer = require('puppeteer-core');
const SHOT = process.env.SHOT_DIR || '/tmp';
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // Tap like a finger: scroll to the middle first so the fixed tab bar can't cover the target.
  const tap = async sel => { await p.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await p.click(sel); };
  const base = process.argv[2] || 'http://localhost:8765/';
  await p.goto(base, { waitUntil: 'networkidle0' });
  console.log('title:', await p.title());
  console.log('onboarding visible:', await p.$eval('#onboarding', e => !e.hidden));
  await p.screenshot({ path: SHOT + '/1-onboard.png' });
  await p.type('#ob-name', 'Tester'); await p.type('#ob-bankroll', '500');
  console.log('auto standard bet:', await p.$eval('#ob-unit', e => e.value), 'limit:', await p.$eval('#ob-max', e => e.value));
  await p.click('#ob-plat [data-plat="kalshi"]');
  await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  console.log('platform after onboarding:', await p.evaluate(() => JSON.parse(localStorage.betdash_prefs).platform));
  console.log('pick cards:', await p.$$eval('#tab-picks .card', x => x.length), 'logos:', await p.$$eval('#tab-picks .tlogo', x => x.length));
  console.log('first open link (kalshi):', await p.$eval('#tab-picks .pick-actions a', a => a.href));
  console.log('not-on-kalshi badges:', await p.$$eval('#tab-picks .badge.skip', x => x.filter(e => /Kalshi/.test(e.textContent)).length));
  await p.click('#plat-toggle [data-plat="polymarket_us"]'); await wait(300);
  console.log('first open link (PM US):', await p.$eval('#tab-picks .pick-actions a', a => a.href));
  await p.screenshot({ path: SHOT + '/2-picks.png' });
  // Builder: search
  await p.click('[data-go="calc"]'); await wait(300);
  await p.type('.psearch', 'purdy'); await p.waitForFunction(() => document.querySelectorAll('.presults .mrow').length > 0, { timeout: 15000 });
  console.log('search "purdy":', (await p.$$eval('.presults .mlabel', x => x.slice(0, 5).map(e => e.textContent.trim().replace(/\s+/g, ' ')))).join(' | '));
  await p.screenshot({ path: SHOT + '/3-search.png' });
  await tap('.presults .pbtn:not([disabled])'); await wait(1500);
  // Browse -> first game containing WAS-SF, add a spread
  await p.$eval('.psearch', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await tap('.pbrowse'); await p.waitForSelector('.gcard');
  console.log('date chips:', await p.$$eval('.pdates .chip', x => x.map(e => e.textContent).join(',')), '| games:', await p.$$eval('.gcard', x => x.length));
  await tap('.gcard[data-game="nfl-was-sf-2026-10-19"]').catch(() => tap('.gcard'));
  await p.waitForSelector('.ghead'); await wait(2500);
  console.log('game status:', await p.$eval('.ghead', e => e.innerText.replace(/\n/g, ' ')));
  const spreadBtn = await p.$$eval('.pgames .mrow', rows => rows.findIndex(r => /wins by over/.test(r.textContent)));
  const rows = await p.$$('.pgames .mrow');
  console.log('spread row:', await rows[spreadBtn].evaluate(r => r.innerText.replace(/\n/g, ' ')));
  const sb = (await rows[spreadBtn].$$('.pbtn'))[1];
  await sb.evaluate(e => e.scrollIntoView({ block: 'center' })); await sb.click(); await wait(1500);
  await p.screenshot({ path: SHOT + '/4-game.png' });
  console.log('slip legs:', await p.$$eval('#slip .leg', x => x.map(e => e.querySelector('.leg-desc, .l-desc').textContent || e.querySelector('.l-desc').value).join(' | ')));
  console.log('related flags:', await p.$$eval('#slip .related-flag', x => x.length), '| as-of:', await p.$eval('#slip-asof', e => e.textContent));
  console.log('calc:', await p.$eval('#calc-out', e => e.innerText.replace(/\n/g, ' ')));
  await p.type('#c-quoted', '4.5'); await p.type('#c-stake', '5');
  console.log('calc2:', await p.$eval('#calc-out2', e => e.innerText.replace(/\n/g, ' ')));
  // tooltip
  await tap('#calc-out .tip'); await wait(200);
  console.log('tooltip:', await p.$eval('#tip-pop', e => (e.hidden ? 'HIDDEN' : e.textContent)));
  await p.$eval('#slip', e => e.scrollIntoView({ block: 'start' })); await wait(300);
  await p.screenshot({ path: SHOT + '/5-slip.png' });
  await tap('#c-save'); await p.waitForSelector('[data-settle]');
  // Kalshi links must be the app-friendly 3-part form (series/slug/event[?op_market_ticker=…]).
  console.log('saved leg kalshi links:', await p.evaluate(() => JSON.parse(localStorage.betdash_bets)[0].legs.map(l => l.kalshiUrl)));
  console.log('old link upgraded:', await p.evaluate(() => Picker.fixKalshiUrl('https://kalshi.com/markets/kxnflgame/kxnflgame-26oct19wassf')));
  console.log('bet logos:', await p.$$eval('#tab-bets .tlogo', x => x.length));
  await tap('[data-settle="won"]'); await wait(300);
  console.log('money after win:', await p.$eval('#hdr-bankroll', e => e.textContent));
  await p.screenshot({ path: SHOT + '/6-bets.png', fullPage: true });
  await p.click('[data-go="record"]'); await wait(800);
  console.log('platform rows:', await p.$$eval('#tab-record .pc-row', x => x.map(r => r.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('record fits phone (no sideways scroll):', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });   // keep fixed bars out of the element shot
  await (await p.$('#tab-record .pc')).screenshot({ path: SHOT + '/7b-compare.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  await p.screenshot({ path: SHOT + '/7-record.png', fullPage: true });
  await p.click('[data-go="settings"]'); await wait(200);
  await tap('#set-plat [data-plat="kalshi"]'); await wait(300);
  console.log('header toggle after settings change:', await p.$eval('#plat-toggle .on', e => e.textContent.trim()));
  await p.select('#set-fmt', 'american');
  await p.click('[data-go="picks"]'); await p.waitForSelector('#tab-picks .card');
  console.log('american price on first card:', await p.$eval('#tab-picks .stat .v', e => e.textContent));
  await p.screenshot({ path: SHOT + '/8-settings-picks.png' });
  console.log('localStorage keys:', await p.evaluate(() => Object.keys(localStorage)));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
