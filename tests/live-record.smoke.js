/**
 * tests/live-record.smoke.js — Live Bets view "Live Bets record" (below #live-bets-root) at phone width.
 * Usage: CH=<chromium> NODE_PATH=<puppeteer-core> node tests/live-record.smoke.js <site url> [shots dir] [--real]
 * Default serves MADE-UP TEST DATA for data/live-record.json (intercepted, nothing written).
 * --real uses the real file as deployed.
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/live', REAL = process.argv.includes('--real');
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const E = (id, r, tier, odds) => ({ id, at: '2026-10-20T01:0' + id + ':00Z', time_ct: 'Oct 19, 8:0' + id + ' PM CT', game: 'TEST AAA vs BBB', market: 'Moneyline', side: 'TEST side ' + id, tier, odds_at_alert: odds, opening_odds: '+120', link: 'https://polymarket.us/', result: r });
const FAKE = { entries: [E(1, 'win', 'big', '+150'), E(2, 'loss', 'slight', '-120'), E(3, 'pending', 'big', '+200')],
  totals: { all: { n: 3, graded: 2, w: 1, l: 1, p: 0, pending: 1, hit_rate: 50, expected_rate: 47.3, units: 0.5, roi: 25 },
    big: { n: 2, graded: 1, w: 1, l: 0, p: 0, pending: 1, hit_rate: 100, expected_rate: 40, units: 1.5, roi: 150 },
    slight: { n: 1, graded: 1, w: 0, l: 1, p: 0, pending: 0, hit_rate: 0, expected_rate: 54.5, units: -1, roi: -100 } } };
(async () => {
  const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  if (!REAL) { await p.setRequestInterception(true); p.on('request', r => (/data\/live-record\.json/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE) }) : r.continue())); }
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  await p.evaluate(() => { location.hash = '#live'; }); await new Promise(r => setTimeout(r, 2500));
  const t = await p.$eval('#tab-picks', e => e.innerText);
  ok(/Live Bets record/i.test(t) && !!(await p.$('#live-bets-root + #live-record-root')), 'section shows below #live-bets-root');
  await p.evaluate(() => { location.hash = '#record'; }); await new Promise(r => setTimeout(r, 1500));
  ok(!/Live Bets record/i.test(await p.$eval('#tab-record', e => e.innerText)), 'not on the Record tab');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  await p.evaluate(() => { location.hash = '#live'; }); await new Promise(r => setTimeout(r, 2000));
  if (!REAL) {
    ok(/1-1-0/.test(t) && /\+0\.50u/.test(t) && /25%/.test(t), 'overall W-L-P, units, ROI');
    ok(/Small samples are noisy/.test(t), 'noisy-sample note');
    ok((await p.$$('.live-rec-item')).length === 3, '3 logged alerts (loss kept)');
  }
  ok(!/¢/.test(t), 'no cents');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  await p.evaluate(() => { const h = [...document.querySelectorAll('#live-record-root h3')].find(x => /Live Bets record/i.test(x.textContent)); h && h.scrollIntoView(); window.scrollBy(0, -70); });
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: SHOT + (REAL ? '/live-record-real.png' : '/live-record.png') });
  await b.close();
})();
