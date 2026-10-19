/**
 * tests/live-alerts.smoke.js — headless check of the site-wide Live Bets badge + big-edge pop-up.
 * Usage: NODE_PATH=<puppeteer-core> node tests/live-alerts.smoke.js <site url> [shots dir]
 * Serves MADE-UP TEST ALERTS by intercepting data/live/<slug>.json (nothing is written to the repo).
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/live';
const CH = process.env.CH || '/usr/bin/chromium';
const now = Date.now(), iso = m => new Date(now - m * 60000).toISOString();
const FEED = { alerts: [   // newest first, like Richie's file
  { id: 't3', at: iso(1), type: 'new_edge', tier: 'big', side: 'TEST Under 44.5', now_odds: '+130', now_chance: 43, edge: 7, text: 'TEST DATA: Under 44.5 is 7 pts cheaper than the books (+130).', url: 'https://polymarket.us/' },
  { id: 't2', at: iso(5), type: 'new_edge', tier: 'slight', text: 'TEST DATA: slight edge', url: 'https://polymarket.us/' },
  { id: 't1', at: iso(30), type: 'gone', tier: 'slight', text: 'TEST DATA: old', url: 'https://polymarket.us/' } ] };
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await pp.launch({ executablePath: CH, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  await p.setRequestInterception(true);
  p.on('request', r => /data\/live\/[a-z0-9-]+\.json/.test(r.url())
    ? r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(FEED) }) : r.continue());
  await p.goto(URL0 + '?' + now, { waitUntil: 'networkidle2' });
  const slug = await p.evaluate(() => window.LiveBets && LiveBets.SLUG);
  // Pretend the viewer already saw everything up to 10 minutes ago (Richie's key; set here only for the test).
  await p.evaluate((k, v) => localStorage.setItem(k, v), 'liveBets.alertsSeen.' + slug, iso(10));
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card'); await new Promise(r => setTimeout(r, 2500));
  const badges = await p.$$eval('.live-badge', x => x.map(e => e.parentElement.dataset.go || e.parentElement.dataset.picksView + ':' + e.textContent));
  ok(badges.length === 2 && badges.every(t => /2$|picks/.test(t)), 'badge "2" on the Live Bets toggle and the Picks nav button: ' + badges);
  ok(await p.$eval('.tabbar [data-go="picks"] .live-badge', e => e.textContent) === '2', 'nav badge counts 2 new');
  ok(!!(await p.$('#live-toast')), 'big-edge pop-up shows');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  await p.screenshot({ path: SHOT + '/live-badge-toast.png' });
  await p.evaluate(() => document.querySelector('[data-go="calc"]').click()); await new Promise(r => setTimeout(r, 800));
  ok(!!(await p.$('#live-toast')), 'pop-up also on Build a Bet');
  await p.click('#live-toast .lt-x'); await new Promise(r => setTimeout(r, 300));
  ok(!(await p.$('#live-toast')), 'pop-up dismissed');
  ok(JSON.parse(await p.evaluate(() => localStorage.betdash_liveDismissed)).includes('t3'), 'dismissal kept in betdash_liveDismissed');
  await p.evaluate(() => document.querySelector('[data-go="picks"]').click()); await new Promise(r => setTimeout(r, 500));
  await p.click('[data-picks-view="live"]'); await new Promise(r => setTimeout(r, 5000));
  ok(!(await p.$('.live-badge')), 'opening Live Bets clears the badge (Richie\'s view writes the seen key)');
  ok(!(await p.$('#live-toast')), 'dismissed pop-up stays gone');
  await p.screenshot({ path: SHOT + '/live-badge-cleared.png' });
  await b.close();
})();
