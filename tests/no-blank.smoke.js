/**
 * tests/no-blank.smoke.js — fails if any chart/visual container renders empty
 * (DESIGN.md "never blank"). Opens Picks pop-ups and Analytics sheets, Build a Bet,
 * Live Bets, and checks Viz.blankVisuals(document) after loading.
 *   python3 -m http.server 8765 & CHROME=/usr/bin/google-chrome node tests/no-blank.smoke.js http://localhost:8765/
 */
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/tmp/pp/node_modules/puppeteer-core'); }
const URL = process.argv[2] || 'http://localhost:8765/', SHOT = process.env.SHOT_DIR || '/tmp';
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + (URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]'); await wait(9000);
  const blanks = async where => { const r = await p.evaluate(() => Viz.blankVisuals(document).map(n => n.className)); if (r.length) fails.push(`${where}: ${r.join(', ')}`); console.log(where, r.length ? 'BLANK ' + r.join(', ') : 'ok'); };
  const fails = [];
  const cards = await p.$$eval('#tab-picks .card', cs => cs.length);
  for (let i = 0; i < Math.min(cards, 4); i++) {
    await p.evaluate(i => document.querySelectorAll('#tab-picks .card')[i].querySelector('.chart-btn')?.click(), i); await wait(9000);
    await blanks(`pop-up ${i}`); if (i === 0) await p.screenshot({ path: `${SHOT}/insufficient-popup.png` }); await p.evaluate(() => Viz.close());
    const has = await p.evaluate(i => { const b = document.querySelectorAll('#tab-picks .card')[i].querySelector('.oc-btn'); if (b) b.click(); return !!b; }, i);
    if (has) { await wait(10000); await blanks(`sheet ${i}`); if (i < 2) await p.screenshot({ path: `${SHOT}/insufficient-sheet-${i}.png` }); await p.evaluate(() => DigDeeper.close()); }
  }
  await p.evaluate(() => { location.hash = '#live'; document.querySelector('[data-go=picks]').click(); }); await wait(8000);
  await blanks('live bets'); await p.screenshot({ path: `${SHOT}/insufficient-live-bets.png` });
  await p.evaluate(() => document.querySelector('[data-go=calc]').click()); await wait(4000); await blanks('build a bet');
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  await b.close();
  if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('no blank visuals'); process.exit(0);
})();
