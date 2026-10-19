/**
 * tests/smoke.js — headless browser walk-through of the whole UI.
 * Requires Chrome + puppeteer-core (not a repo dependency):
 *   npm i --no-save puppeteer-core && python3 -m http.server 8765 &
 *   CHROME=/usr/bin/google-chrome node tests/smoke.js http://localhost:8765/
 * Covers: onboarding (incl. platform step) -> picks (logos, Open links) ->
 * position badges (pick cards, player dropdown, rows, slip, saved bets) ->
 * builder search ("purdy") + filters ("San" + Player props -> 49ers props,
 * team + player dropdowns, remembered, reset) + browse (game -> spread) -> related-picks flag ->
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
  console.log('eval blocks:', await p.$$eval('#tab-picks .eval', x => x.length), '| legend:', await p.$eval('#tab-picks .risk-legend', e => e.innerText.replace(/\s+/g, ' ')));
  console.log('evals:', await p.$$eval('#tab-picks .card', cs => cs.slice(0, 16).map(c => (c.querySelector('.pick-title') || {}).innerText + ' => ' + (c.querySelector('.eval') ? c.querySelector('.eval').innerText.replace(/\s+/g, ' ').replace(/ i\b/g, '') : 'none')).join('\n  ')));
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });
  const cards = await p.$$('#tab-picks .card');
  await cards[0].screenshot({ path: SHOT + '/2b-card-single.png' });
  await cards[9].screenshot({ path: SHOT + '/2c-card-parlay.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  // 2nd-grade money words: "Price on <my app>: 63¢" once per bet, "Cheaper on X" only when cheaper.
  console.log('price-on lines:', await p.$$eval('#tab-picks .price-on', x => x.length), '| cheaper lines:', await p.$$eval('#tab-picks .cheaper', x => x.length), '| first:', await p.$eval('#tab-picks .price-on', e => e.innerText).catch(() => 'none'));
  // "Bet $10 → get $20.83 back" on cards/legs, "If all 3 win: your $5 turns into …" on combos, one (i).
  console.log('pay lines:', await p.$$eval('#tab-picks .pay-big', x => x.length + ' | ' + x[0].textContent.trim()), '| combo total:', await p.$$eval('#tab-picks .pay-big', x => (x.find(e => /If all/.test(e.textContent)) || { textContent: 'none' }).textContent.replace(/\s+/g, ' ').trim()), '| how-prices tips:', await p.$$eval('#tab-picks [data-tip="howPrices"]', x => x.length));
  console.log('tap lines:', await p.$$eval('#tab-picks .tap', x => x.length + ' | ' + (x[0] ? x[0].textContent.trim() : '')), '| spread notes:', await p.$$eval('#tab-picks .spread-note', x => x.length + ' | ' + (x[0] ? x[0].textContent.trim() : '')), '| "%" or "x" left in money lines:', await p.$$eval('#tab-picks .pay-big, #tab-picks .chance-line, #tab-picks .eval-pct', x => x.filter(e => /%|\dx\b/.test(e.textContent)).length));
  // Player position badges on pick cards + their tap tooltip.
  console.log('pick-card positions:', await p.$$eval('#tab-picks .pos-badge', x => x.map(e => (e.closest('.pick-sub, li') || e.parentElement).className + ': ' + (e.closest('.pick-sub, li') || e.parentElement).textContent.replace(/\s+/g, ' ').trim().slice(0, 40)).join(' | ')));
  if (await p.$('#tab-picks .pos-badge')) { await tap('#tab-picks .pos-badge'); await wait(200); console.log('position tooltip:', await p.$eval('#tip-pop', e => (e.hidden ? 'HIDDEN' : e.textContent))); await p.mouse.click(5, 300); }
  await p.click('#plat-toggle [data-plat="polymarket_us"]'); await wait(300);
  console.log('first open link (PM US):', await p.$eval('#tab-picks .pick-actions a', a => a.href));
  await p.screenshot({ path: SHOT + '/2-picks.png' });
  // Builder: search
  await p.click('[data-go="calc"]'); await wait(300);
  await p.type('.psearch', 'purdy'); await wait(1200);
  if (!(await p.$('.presults .mrow'))) await tap('[data-expand="all"]');
  await p.waitForFunction(() => document.querySelectorAll('.presults .mrow').length > 0, { timeout: 15000 });
  console.log('search "purdy":', (await p.$$eval('.presults .mlabel', x => x.slice(0, 5).map(e => e.textContent.trim().replace(/\s+/g, ' ')))).join(' | '));
  await p.screenshot({ path: SHOT + '/3-search.png' });
  await tap('.presults .pbtn:not([disabled])'); await wait(1500);
  // Filters: "San" + Player props only must list 49ers player props (the old bug: only game bets).
  const setQ = async q => { await p.$eval('.psearch', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, q); await wait(900); };
  // Grouped results: Game -> Game bets / Player props -> type or stat category -> player.
  const heads = () => p.$$eval('.presults details.pg-game > summary', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  await setQ('San');
  console.log('search "San" (all bets) games:', await heads());
  await tap('[data-kind="team"]'); await wait(900);
  const sfPlayers = await p.evaluate(async () => (await Picker.loadIndex()).events.filter(e => e.slug.startsWith('nfl-') && e.teams.some(t => t.abbr === 'sf')).flatMap(e => e.players.filter(x => x[1] === 'sf').map(x => x[0])));
  console.log('search "San" + Player props only, games:', await heads());
  console.log('  default open nodes:', await p.$$eval('.presults details.pg[open]', x => x.length), '| sections:', await p.$$eval('.presults details.pg-l1 > summary', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  const t0 = Date.now(); await tap('[data-expand="all"]'); await wait(50);
  console.log('  open all took', Date.now() - t0, 'ms; rows drawn:', await p.$$eval('.presults .mrow', x => x.length));
  const sfGame = await p.evaluate(sf => {
    const g = [...document.querySelectorAll('.presults details.pg-game')].find(d => d.dataset.node.includes('nfl-was-sf'));
    if (!g) return null;
    const cats = [...g.querySelectorAll('details.pg-stat')].map(d => d.querySelector(':scope > summary').textContent.replace(/\s+/g, ' ').trim());
    const pls = [...g.querySelectorAll('details.pg-player')].map(d => ({ name: d.dataset.node.split('|').pop(), n: +d.querySelector(':scope > summary .pg-n').textContent }));
    return { cats, players: pls.length, sum: pls.reduce((a, b) => a + b.n, 0), notSf: pls.filter(x => !sf.includes(x.name)).map(x => x.name) };
  }, sfPlayers);
  console.log('  49ers game: categories', sfGame && sfGame.cats.length, '(' + (sfGame && sfGame.cats.slice(0, 6).join(', ')) + ') | player lists:', sfGame && sfGame.players, '| props:', sfGame && sfGame.sum, '| non-49ers players:', sfGame && sfGame.notSf.length);
  const purdyYds = await p.evaluate(() => { const d = [...document.querySelectorAll('.presults details.pg-player')].find(x => /passing_yards\|Brock Purdy$/.test(x.dataset.node)); return d ? [...d.querySelectorAll('.mlabel')].map(e => (e.textContent.match(/(\d+)\+/) || [])[1]).map(Number) : null; });
  console.log('  Purdy passing yards lines:', purdyYds && purdyYds.join(', '), '| ascending:', !!purdyYds && purdyYds.every((v, i) => !i || v >= purdyYds[i - 1]));
  await tap('[data-expand="none"]'); await wait(100);
  console.log('  after close all, open nodes:', await p.$$eval('.presults details.pg[open]', x => x.length));
  console.log('filter count:', await p.$eval('.pf-count', e => e.textContent), '| prop types:', await p.$$eval('.pf-types [data-sub^="prop:"]', x => x.map(e => e.parentElement.textContent.trim().replace(/\s+/g, ' ')).join(', ')));
  await setQ('');
  await tap('.pf-teambtn'); await wait(200);
  console.log('team list:', await p.$$eval('.pf-teamopt', x => x.length + ' options, logos ' + x.filter(e => e.querySelector('.tlogo')).length));
  await tap('.pf-teamopt[data-team="nfl:sf"]'); await wait(900);
  console.log('player step visible:', await p.$eval('.pf-player-step', e => !e.hidden), '| players:', await p.$$eval('.pf-player option', x => x.length - 1), '| count:', await p.$eval('.pf-count', e => e.textContent));
  console.log('player dropdown (with positions):', await p.$$eval('.pf-player option', x => x.slice(1, 6).map(e => e.textContent).join(' | ')));
  await p.select('.pf-player', 'Brock Purdy'); await wait(900);
  console.log('player header badge:', await p.$eval('.presults details.pg-player > summary', e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('Purdy only:', await p.$eval('.pf-count', e => e.textContent), '| categories:', await p.$$eval('.presults details.pg-stat > summary', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(', ')), '| first row:', await p.$eval('.presults .mlabel', e => e.textContent.trim()));
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });
  await (await p.$('.presults')).screenshot({ path: SHOT + '/3c-grouped-phone.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  console.log('summary:', await p.$eval('.pf-sum', e => e.textContent));
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });
  await (await p.$('.pfilters')).screenshot({ path: SHOT + '/3b-filters.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  console.log('builder fits phone (no sideways scroll):', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.reload({ waitUntil: 'networkidle0' }); await p.click('[data-go="calc"]'); await wait(1500);
  console.log('remembered after reload:', await p.$eval('.pf-sum', e => e.textContent));
  await tap('.pf-reset'); await wait(900);
  console.log('after reset:', await p.$eval('.pf-sum', e => e.textContent), '|', await p.$eval('.pf-count', e => e.textContent), '| results hidden:', await p.$eval('.presults', e => e.hidden));
  // Browse -> first game containing WAS-SF, add a spread
  await p.$eval('.psearch', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  await tap('.pbrowse'); await p.waitForSelector('.gcard');
  console.log('day chips:', await p.$$eval('.pf-days .chip', x => x.map(e => e.textContent).join(',')), '| games:', await p.$$eval('.gcard', x => x.length));
  await tap('.gcard[data-game="nfl-was-sf-2026-10-19"]').catch(() => tap('.gcard'));
  await p.waitForSelector('.ghead'); await wait(2500);
  console.log('game status:', await p.$eval('.ghead', e => e.innerText.replace(/\n/g, ' ')));
  const spreadBtn = await p.$$eval('.pgames .mrow', rows => rows.findIndex(r => /wins by over/.test(r.textContent)));
  const rows = await p.$$('.pgames .mrow');
  console.log('vegas lines on game bets:', await p.$$eval('.pgames .vegas', x => x.length + ' | ' + (x[0] ? x[0].textContent : 'none')), '| cents (american):', await p.$$eval('.pgames .pbtn-pay', x => x.slice(0, 2).map(e => e.textContent).join(' / ')));
  console.log('spread row:', await rows[spreadBtn].evaluate(r => r.innerText.replace(/\n/g, ' ')));
  const sb = (await rows[spreadBtn].$$('.pbtn'))[1];
  await sb.evaluate(e => e.scrollIntoView({ block: 'center' })); await sb.click(); await wait(1500);
  await p.screenshot({ path: SHOT + '/4-game.png' });
  console.log('slip legs:', await p.$$eval('#slip .leg', x => x.map(e => e.querySelector('.leg-desc, .l-desc').textContent || e.querySelector('.l-desc').value).join(' | ')));
  // Game start times: add an MLB leg (starts 7:08 PM, before the 7:15 PM NFL legs) + a typed leg.
  await p.$eval('.psearch', e => { e.value = 'guardians rays under'; e.dispatchEvent(new Event('input')); }); await wait(1200);
  if (!(await p.$('.presults .mrow'))) await tap('[data-expand="all"]');
  await tap('.presults .pbtn:not([disabled])'); await wait(1500);
  await tap('#add-manual'); await wait(300);
  await p.type('#slip .l-desc', 'Typed by hand'); await p.type('#slip .leg:last-child .l-price', '50').catch(() => {});
  const legTimes = await p.$$eval('#slip .leg', x => x.map(e => ((e.querySelector('.leg-desc b') || {}).textContent || 'typed') + ' => ' + ((e.querySelector('.leg-when') || {}).textContent || '(no time)').trim()));
  console.log('slip leg times (sorted):\n   ' + legTimes.join('\n   '));
  await p.$eval('#slip', e => e.scrollIntoView({ block: 'start' })); await wait(300);
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });
  await (await p.$('#slip')).screenshot({ path: SHOT + '/5b-slip-times.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  // Remove the typed leg again (no price -> can't save).
  await p.$$eval('#slip [data-rm]', x => x[x.length - 1].click()); await wait(300);
  console.log('related flags:', await p.$$eval('#slip .related-flag', x => x.length), '| as-of:', await p.$eval('#slip-asof', e => e.textContent));
  console.log('calc:', await p.$eval('#calc-out', e => e.innerText.replace(/\n/g, ' ')));
  console.log('slip leg pay hints:', await p.$$eval('#slip .leg-hint', x => x.map(e => e.textContent).join(' | ')));
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
  console.log('saved leg start times:', await p.evaluate(() => JSON.parse(localStorage.betdash_bets)[0].legs.map(l => l.startTime)));
  console.log('shared-log legs:', JSON.stringify(await p.evaluate(() => GitHubLog.buildRecord(JSON.parse(localStorage.betdash_bets)[0], 'x').legs)));
  console.log('saved leg players:', await p.evaluate(() => JSON.parse(localStorage.betdash_bets)[0].legs.map(l => l.player && `${l.player} (${l.league}/${l.playerTeam})`)));
  console.log('my bets position badges:', await p.$$eval('#tab-bets .bet-legs .pos-badge', x => x.map(e => e.textContent + ' = ' + e.dataset.tipText).join(' | ')));
  console.log('my bets leg times:', await p.$$eval('#tab-bets .bet-legs .leg-when', x => x.map(e => e.textContent.trim()).join(' | ')));
  // An older bet saved before start times existed: filled in from the snapshot by market id.
  await p.evaluate(() => { const bs = JSON.parse(localStorage.betdash_bets); bs.push({ id: 'old1', createdAt: '2026-10-19T06:00:00Z', settledAt: null, category: 'single', platform: 'Polymarket US', legs: [{ desc: 'Under 6.5 (old bet)', price: '49', platform: 'Polymarket US', p: 0.49, marketId: 'tsc-mlb-cle-tb-2026-10-19-7pt5' }], estMultiple: 2.04, quotedMultiple: 2.04, hitChance: 0.49, stake: 1, status: 'open', share: false, shared: false }); localStorage.betdash_bets = JSON.stringify(bs); });
  await p.click('[data-go="picks"]'); await wait(300); await p.click('[data-go="bets"]'); await wait(1500);
  console.log('old bet backfilled:', await p.evaluate(() => JSON.parse(localStorage.betdash_bets).find(b => b.id === 'old1').legs[0].startTime));
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:hidden}' });
  await (await p.$('#tab-bets .card')).screenshot({ path: SHOT + '/6b-bet-times.png' });
  await p.addStyleTag({ content: '.topbar,.tabbar,.plat-bar{visibility:visible}' });
  console.log('bets fit phone (no sideways scroll):', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await p.evaluate(() => { localStorage.betdash_bets = JSON.stringify(JSON.parse(localStorage.betdash_bets).filter(b => b.id !== 'old1')); });
  await p.click('[data-go="picks"]'); await wait(300); await p.click('[data-go="bets"]'); await wait(500);
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
  console.log('american price on first card:', await p.$eval('#tab-picks .price-on', e => e.textContent));
  await p.screenshot({ path: SHOT + '/8-settings-picks.png' });
  // No cents on screen (Reed, Oct 19 2026) + the Fade Trent tab.
  for (const t of ['picks', 'calc', 'record']) { await p.evaluate(g => document.querySelector(`[data-go="${g}"]`).click(), t); await wait(1500); console.log(`cents (¢) visible on ${t}:`, await p.evaluate(() => (document.querySelector('main, #app').innerText.match(/¢/g) || []).length)); }
  await p.evaluate(() => document.querySelector('[data-go="trent"]').click()); await p.waitForSelector('#tab-trent .trent-pick');
  console.log('fade trent:', await p.$eval('#tab-trent .kpis', e => e.innerText.replace(/\s+/g, ' ')), '| cards:', await p.$$eval('#tab-trent .trent-pick', x => x.length), '| fits phone:', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('localStorage keys:', await p.evaluate(() => Object.keys(localStorage)));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
