/** tests/evaluate.test.js — node tests for js/evaluate.js (hit chance, risk, verdict, predictions). */
const fs = require('fs'), vm = require('vm');
const E = require('../js/evaluate.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(__dirname + '/../js/strings.js', 'utf8'), ctx);
const STR = ctx.window.STR, V = STR.eval.verdicts;
const a = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };

// Risk thresholds: 60+ safer, 45-59.9 coin flip, 25-44.9 risky, <25 long shot
a(E.riskFor(60) === 'safer' && E.riskFor(59.9) === 'coin_flip' && E.riskFor(45) === 'coin_flip', 'safer / coin flip edges');
a(E.riskFor(44.9) === 'risky' && E.riskFor(25) === 'risky' && E.riskFor(24.9) === 'long_shot' && E.riskFor(0) === 'long_shot', 'risky / long shot edges');

// Hit chance defaults
a(E.evaluate({ fair: 49.7, price: 48 }, 'singles', STR).pct === 49.7, 'single uses fair');
a(E.evaluate({ price: 40 }, 'props', STR).pct === 40, 'falls back to price');
a(E.evaluate({ hit_prob: 34, legs: [{ fair: 64.5 }, { fair: 49.7 }] }, 'parlays', STR).pct === 34, 'given hit_prob wins');
a(E.evaluate({ legs: [{ fair: 50 }, { price: 40 }] }, 'parlays', STR).pct === 20, 'combo default = leg product');
a(E.evaluate({ legs: [{ fair: 50 }, { desc: 'x' }] }, 'parlays', STR).pct === null, 'unknown leg -> no chance');

// Same game from market ids
a(E.sameGame({ legs: [{ market_id: 'asc-mlb-cle-tb-2026-10-19-pos-1pt5' }, { market_id: 'tsc-mlb-cle-tb-2026-10-19-6pt5' }] }) === true, 'same game');
a(E.sameGame({ legs: [{ market_id: 'aec-nhl-col-phi-2026-10-19' }, { market_id: 'aec-nhl-sj-tor-2026-10-19' }] }) === false, 'different games');
a(E.sameGame({ same_game: true, legs: [] }) === true, 'explicit same_game');

// Verdicts
a(E.verdictFor({ action: 'skip' }, 'singles', STR) === V.skip && E.verdictFor({ action: 'wait' }, 'singles', STR) === V.wait, 'skip / wait');
a(E.verdictFor({ action: 'bet', edge: 3.5 }, 'props', STR) === V.good && E.verdictFor({ action: 'bet', edge: 1.5 }, 'singles', STR) === V.fair && E.verdictFor({ action: 'bet', edge: 0.5 }, 'singles', STR) === V.thin, 'edge bands');
a(E.verdictFor({ action: 'bet', quoted_multiple: 2.97, skip_below: 2.9 }, 'parlays', STR) === V.barely, 'combo barely above skip line');
a(E.verdictFor({ action: 'bet', quoted_multiple: 2.5, skip_below: 2.9 }, 'parlays', STR) === V.tooLow, 'combo below skip line');
a(E.verdictFor({ action: 'bet', skip_below: 15 }, 'longshots', STR) === V.longshotCheck(15), 'long shot without quote');
a(E.evaluate({ verdict: 'My own words.', action: 'skip' }, 'singles', STR).verdict === 'My own words.', 'explicit verdict wins');
a(E.evaluate({ risk: 'safer', fair: 10 }, 'singles', STR).risk === 'safer', 'explicit risk wins');

// Predictions matched by game text, or by id; other dates ignored
const preds = [{ id: 'a', date: '2026-10-19', game: 'Commanders @ 49ers', pick: '49ers' }, { id: 'b', date: '2026-10-18', game: 'Commanders @ 49ers', pick: 'x' }, { id: 'c', game: 'Sharks @ Maple Leafs', pick: 'Maple Leafs' }];
a(E.findPredictions({ event: 'Commanders @ 49ers (MNF)' }, preds, '2026-10-19').map(p => p.id).join() === 'a', 'match by game text + date');
a(E.findPredictions({ event: 'Avalanche @ Flyers + Sharks @ Maple Leafs' }, preds, '2026-10-19').map(p => p.id).join() === 'c', 'multi-game event');
a(E.findPredictions({ prediction_id: 'c', event: 'zzz' }, preds, '2026-10-19')[0].id === 'c', 'by prediction_id');

// fillDefaults never overwrites
const doc = { sections: { singles: [{ id: 's', fair: 64.5, edge: 1.5, action: 'bet', verdict: 'Keep me' }], parlays: [{ id: 'p', hit_prob: 34, action: 'bet', quoted_multiple: 2.97, skip_below: 2.9, legs: [{ market_id: 'asc-mlb-cle-tb-2026-10-19-x' }, { market_id: 'tsc-mlb-cle-tb-2026-10-19-y' }] }] } };
a(E.fillDefaults(doc, STR) === 2, 'fill counts changed picks');
const s0 = doc.sections.singles[0], p0 = doc.sections.parlays[0];
a(s0.hit_prob === 64.5 && s0.risk === 'safer' && s0.verdict === 'Keep me', 'single filled, verdict kept');
a(p0.hit_prob === 34 && p0.risk === 'risky' && p0.verdict === V.barely && p0.same_game === true, 'combo filled');
a(E.fillDefaults(doc, STR) === 0, 'idempotent');
