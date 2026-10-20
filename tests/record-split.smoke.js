/**
 * tests/record-split.smoke.js — Record tab: Game Winners / Single Bets / Combos, same 5 stat boxes each (HANDOFF §41-42).
 * Usage: CH=<chrome> NODE_PATH=<puppeteer-core parent> node tests/record-split.smoke.js <site url> [shot path]
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/record-split.png';
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
  const names = s => s.map(x => x.split('=')[0]).join();
  ok(sets.length === 3 && sets.every(x => x.length === 5 && names(x) === names(sets[0])), '3 sections, same 5 boxes, same order');
  const heads = await p.$$eval('#tab-record h3', hs => hs.map(h => h.textContent.trim()));
  ok(['Game Winners', 'Single Bets', 'Combos'].every(t => heads.includes(t)), 'titles: Game Winners, Single Bets, Combos');
  // Every Single Bets row must be 1 leg; every Combos row 2+ legs ("N-leg combo").
  const secRows = await p.$$eval('#tab-record h3', hs => hs.filter(h => /^(Single Bets|Combos)$/.test(h.textContent.trim())).map(h => {
    let n = h.nextElementSibling; while (n && !n.querySelector('table')) n = n.nextElementSibling;
    return [h.textContent.trim(), n ? [...n.querySelectorAll('tr[data-hist]')].map(r => r.cells[1].textContent) : []]; }));
  const sg = secRows.find(x => x[0] === 'Single Bets')[1], cb = secRows.find(x => x[0] === 'Combos')[1];
  ok(sg.length && sg.every(t => !/-leg combo/.test(t)), 'Single Bets has only 1-leg picks (' + sg.length + ')');
  ok(cb.length && cb.every(t => /-leg combo/.test(t)), 'Combos has only multi-leg picks (' + cb.length + ')');
  ok((await p.$$('link[href*="?v="], script[src*="?v="]')).length >= 20, 'cache-busting ?v= on includes');
  ok(!/[$¢]/.test(JSON.stringify(sets)), 'no dollars or cents in stat boxes');
  ok((await p.$$('.tabbar button')).length === 6, 'still exactly 6 bottom tabs');
  await p.evaluate(() => { const h = [...document.querySelectorAll('#tab-record h3')].find(x => x.textContent.trim() === 'Single Bets'); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 70); });
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: SHOT });
  await b.close();
})();
