/**
 * tests/play.smoke.js — headless check of PLAY MONEY at phone width.
 * Usage: CH=<chromium> NODE_PATH=<puppeteer-core> node tests/play.smoke.js <site url> [shots dir]
 * Uses a REAL finished game (Cowboys @ Packers, Oct 18 2026, Packers won) to check auto-settling.
 */
const pp = require('puppeteer-core');
const URL0 = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/workspace/shots/live';
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await pp.launch({ executablePath: process.env.CH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('dialog', d => d.accept());
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await p.goto(URL0 + '?' + Date.now(), { waitUntil: 'networkidle2' });
  await p.type('#ob-name', 'Reed'); await p.type('#ob-bankroll', '500'); await p.click('button[type=submit]');
  await p.waitForSelector('#tab-picks .card');
  // 1. Name setup on the Play money view.
  await p.evaluate(() => { location.hash = '#play'; }); await wait(800);
  ok(/Play money, just for fun/.test(await p.$eval('#tab-bets', e => e.innerText)), 'labeled "Play money, just for fun"');
  await p.click('#play-name', { clickCount: 3 }); await p.type('#play-name', 'Reed'); await p.click('#play-start'); await wait(500);
  ok(/1,000/.test(await p.$eval('#tab-bets .kpis', e => e.innerText)), 'starts with 1,000 points');
  // 2. A real finished bet (Packers won Oct 18) settles from the real result.
  await p.evaluate(() => { const s = JSON.parse(localStorage.betdash_play); s.bets.push({ id: 'smoke1', at: '2026-10-18T20:00:00Z', stake: 100, status: 'open', ret: 0,
    legs: [{ marketId: 'aec-nfl-dal-gb-2026-10-18', side: 'no', c: 50, desc: 'Packers win (smoke test)', eventSlug: 'nfl-dal-gb-2026-10-18' }] }); localStorage.betdash_play = JSON.stringify(s); });
  await p.evaluate(() => { location.hash = '#bets'; }); await wait(300); await p.evaluate(() => { location.hash = '#play'; }); await wait(300);
  await p.click('#play-check'); await wait(3000);
  const t = await p.$eval('#tab-bets', e => e.innerText);
  ok(/Won · got 200 pts back/.test(t), 'real result settled the bet: won 200 back');
  ok(/1,100/.test(await p.$eval('#tab-bets .kpis', e => e.innerText)), 'points 1,100 after the win');
  // 3. Pick card "🎮 Play" at the live price.
  await p.evaluate(() => { location.hash = '#picks'; }); await wait(1500);
  await p.evaluate(() => { const x = document.querySelector('[data-pick-day="2026-10-20"]'); if (x) x.click(); }); await wait(800);
  const n = await p.$$eval('[data-play-pick]', x => x.length);
  ok(n > 0, `"🎮 Play" buttons on pick cards: ${n}`);
  await p.click('[data-play-pick]'); await wait(3000);
  // 4. Build a Bet from a pick: play line shows "Bet 100 pts, get X back · +odds".
  await p.click('[data-load-pick]'); await wait(3500);
  const line = await p.$eval('#p-line', e => e.innerText);
  ok(/^Bet 100 pts, get [\d,]+ back · [+-]\d+$/.test(line), 'Build a Bet play line: ' + line);
  await p.screenshot({ path: SHOT + '/play-build.png' });
  await p.click('#p-bet'); await wait(3000);
  const t2 = await p.$eval('#tab-bets', e => e.innerText);
  ok(/Open play bets \(2\)/i.test(t2), 'two open play bets (card + Build a Bet)');
  ok(/Leaderboard/i.test(t2) && /\(you\)/i.test(t2), 'leaderboard shows my row');
  ok(!/¢/.test(t2), 'no cents');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  ok(/issues\/new\?title=Play%20score/.test(await p.$eval('#play-post', e => e.href)), 'Post my score -> pre-filled GitHub issue');
  await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: SHOT + '/play-view.png' });
  await p.evaluate(() => document.querySelector('.play-board').scrollIntoView()); await wait(300); await p.screenshot({ path: SHOT + '/play-board.png' });
  await b.close();
})();
