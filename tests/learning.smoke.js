/**
 * tests/learning.smoke.js — Record tab "How we're learning" card at phone width.
 * Usage: CH=<chromium> NODE_PATH=<puppeteer-core> node tests/learning.smoke.js <site url> [shots dir] [--real]
 * Default serves MADE-UP TEST DATA for data/learning.json (intercepted, nothing written); --real uses the deployed file.
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/live', REAL = process.argv.includes('--real');
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const FAKE = { min_samples: 30, updated_at: '2026-10-20T14:00:00Z', sample: { picks_logged: 64, picks_graded: 41, predictions_graded: 35, clv_legs: 38 },
  calibration: { picks: [{ lo: 40, hi: 50, n: 31, avg_said: 45.2, actual: 41.9, adjustment_pts: -0.8, status: 'applied' }, { lo: 50, hi: 60, n: 10, avg_said: 54, actual: 60, adjustment_pts: 0, status: 'collecting data' }],
    predictions: [{ lo: 60, hi: 70, n: 35, avg_said: 64, actual: 60, adjustment_pts: -1.0, status: 'applied' }] },
  market_shrink: { n: 41, weight: 0.86, status: 'applied' }, clv: { n: 38, avg_pts: 1.4, beat_close_pct: 61 },
  categories: [{ key: 'TEST NHL · prop · pts', n: 14, w: 8, l: 6, roi: 12.5 }, { key: 'TEST NBA · total', n: 11, w: 4, l: 7, roi: -30.1 }],
  best: ['TEST NHL · prop · pts'], worst: ['TEST NBA · total'] };
(async () => {
  const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  if (!REAL) { await p.setRequestInterception(true); p.on('request', r => (/data\/learning\.json/.test(r.url()) ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE) }) : r.continue())); }
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  await p.evaluate(() => { location.hash = '#record'; }); await new Promise(r => setTimeout(r, 2500));
  const t = await p.$eval('#tab-record .learn-card', e => e.innerText).catch(() => '');
  ok(/How we.re learning/i.test(t), 'card on the Record tab');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  if (!REAL) {
    ok(/61% of the time, by \+1\.4 points/.test(t), 'CLV line');
    ok(/collecting data/.test(t) && /-0\.8/.test(t), 'applied vs collecting-data buckets');
    ok(/TEST NHL · prop · pts/.test(t) && /too few to trust yet/.test(t), 'best/worst with small-sample flag');
  } else ok(/Picks saved/i.test(t), 'real file renders');
  ok(!/¢|\$/.test(t), 'no cents or dollars');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  await p.evaluate(() => { document.querySelector('.learn-card').scrollIntoView(); window.scrollBy(0, -70); }); await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: SHOT + (REAL ? '/learning-real.png' : '/learning.png') });
  await b.close();
})();
