#!/usr/bin/env node
/**
 * scripts/update-picks.mjs — CLI for the daily job: validate, write, commit, push.
 *
 * PURPOSE
 *   One safe entry point for automation that updates the public data files:
 *     - data/picks.json        replaced wholesale with a new slate
 *     - data/predictions.json  new predictions appended, finished ones graded
 *   Everything is validated against the schemas in README.md / HANDOFF.md
 *   BEFORE anything is written, and the privacy rule (no dollar amounts, no
 *   tokens) is enforced mechanically. Zero dependencies; Node 18+.
 *
 * USAGE (run from anywhere inside the repo)
 *   node scripts/update-picks.mjs validate [picks.json]          # default: data/picks.json (also predictions.json, book-odds.json)
 *   node scripts/update-picks.mjs picks <new-picks.json>         # validate + replace + commit + push
 *   node scripts/update-picks.mjs add-predictions <preds.json>   # file = array of Prediction objects
 *   node scripts/update-picks.mjs grade <grades.json>            # file = [{id, result, final_score?}]
 *   node scripts/update-picks.mjs grade <id> <win|loss|push> ["final score"]
 *
 *   Flags: --no-push (commit only), --dry-run (validate + print, write nothing),
 *          -m "extra commit body line" (repeatable).
 *
 * GIT BEHAVIOUR
 *   Commits straight to main (owner's preference: no branches/PRs) with a
 *   descriptive subject + generated body (section counts, ids touched), then
 *   `git pull --rebase` and `git push`. Only the data file it changed is
 *   staged, so unrelated working-tree changes are never swept in.
 *
 * EXIT CODES  0 ok · 1 validation failed · 2 usage error · 3 git failure
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PICKS = path.join(ROOT, 'data/picks.json');
const PREDS = path.join(ROOT, 'data/predictions.json');

const SECTIONS = ['predictions', 'singles', 'props', 'parlays', 'longshots', 'nonsports'];
const MULTI_SECTIONS = ['parlays', 'longshots'];
const ACTIONS = ['bet', 'wait', 'skip'];
const RESULTS = ['pending', 'win', 'loss', 'push'];
/** Keys that would carry money or secrets; forbidden anywhere in public data. */
const FORBIDDEN_KEYS = /^(stake|stake_usd|stake_dollars|bankroll|payout|payout_usd|profit|pl|balance|token|auth|password)$/i;
/** "$5", "$ 12.50", "USD 10" or token-looking strings in any text value. */
const FORBIDDEN_TEXT = [/\$\s?\d/, /\bUSD\s?\d/i, /\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{10,}/];

// ------------------------------------------------------------------ helpers

/**
 * Parse CLI args into positionals + flags.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{pos:string[], noPush:boolean, dryRun:boolean, notes:string[]}}
 */
function parseArgs(argv) {
  const out = { pos: [], noPush: false, dryRun: false, notes: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-push') out.noPush = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-m') out.notes.push(argv[++i] || '');
    else out.pos.push(a);
  }
  return out;
}

/** @param {string} f path @returns {*} parsed JSON @throws with a readable message */
function readJSON(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { throw new Error(`${f}: ${e.code === 'ENOENT' ? 'file not found' : 'invalid JSON — ' + e.message}`); }
}

/** Pretty-print JSON with trailing newline (matches the repo's existing style). */
function writeJSON(f, obj) { fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n'); }

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = v => typeof v === 'string' && v.trim().length > 0;
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isISO = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !isNaN(Date.parse(v));

/**
 * Recursively enforce the privacy rule on any JSON value.
 * @param {*} v value @param {string} where JSON path for messages @param {string[]} errs sink
 */
function scanPrivacy(v, where, errs) {
  if (typeof v === 'string') {
    for (const re of FORBIDDEN_TEXT) if (re.test(v)) errs.push(`${where}: looks like a dollar amount or token ("${v.slice(0, 40)}") — use units, never $`);
  } else if (Array.isArray(v)) v.forEach((x, i) => scanPrivacy(x, `${where}[${i}]`, errs));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.test(k)) errs.push(`${where}.${k}: forbidden key (money/secret) — use stake_units`);
      scanPrivacy(x, `${where}.${k}`, errs);
    }
  }
}

/** Range check helper: pushes an error when present-but-out-of-range. */
function range(errs, where, v, lo, hi, required = false) {
  if (v === undefined || v === null) { if (required) errs.push(`${where}: required`); return; }
  if (!isNum(v) || v < lo || v > hi) errs.push(`${where}: must be a number ${lo}–${hi} (got ${JSON.stringify(v)})`);
}

/** @param {string} u @returns {boolean} http(s) URL or bare host/path */
function okLink(u) {
  try { const x = new URL(/^[a-z]+:/i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol); } catch { return false; }
}

// ------------------------------------------------------------------ validation

/**
 * Validate one Prediction (used both in picks.sections.predictions and
 * data/predictions.json).
 * @param {object} p @param {string} where @param {string[]} errs
 * @param {{graded:boolean}} opts graded=true requires date/result (predictions.json)
 */
function validatePrediction(p, where, errs, opts = { graded: false }) {
  if (!p || typeof p !== 'object') return errs.push(`${where}: must be an object`);
  if (!isStr(p.id)) errs.push(`${where}.id: required string`);
  if (!isStr(p.pick)) errs.push(`${where}.pick: required string`);
  if (!isStr(p.game)) errs.push(`${where}.game: required string`);
  range(errs, `${where}.win_prob`, p.win_prob, 50, 100, true);
  if (p.start_time !== undefined && !isISO(p.start_time)) errs.push(`${where}.start_time: ISO 8601 expected`);
  if (p.player_projections !== undefined && !(Array.isArray(p.player_projections) && p.player_projections.every(x => typeof x === 'string')))
    errs.push(`${where}.player_projections: array of strings expected`);
  if (opts.graded) {
    if (!isDate(p.date)) errs.push(`${where}.date: YYYY-MM-DD required`);
    if (!RESULTS.includes(p.result)) errs.push(`${where}.result: one of ${RESULTS.join('|')}`);
  }
}

/**
 * Validate one Pick / MultiPick.
 * @param {object} pk @param {string} sec section key @param {string} where @param {string[]} errs
 */
function validatePick(pk, sec, where, errs) {
  if (!pk || typeof pk !== 'object') return errs.push(`${where}: must be an object`);
  if (!isStr(pk.id)) errs.push(`${where}.id: required string`);
  if (!isStr(pk.side)) errs.push(`${where}.side: required string`);
  range(errs, `${where}.price`, pk.price, 0, 100);
  range(errs, `${where}.fair`, pk.fair, 0, 100);
  if (pk.edge !== undefined && !isNum(pk.edge)) errs.push(`${where}.edge: number expected`);
  range(errs, `${where}.stake_units`, pk.stake_units, 0, 10, true);
  range(errs, `${where}.stake_units_max`, pk.stake_units_max, 0, 10);
  if (isNum(pk.stake_units_max) && isNum(pk.stake_units) && pk.stake_units_max < pk.stake_units) errs.push(`${where}.stake_units_max: must be ≥ stake_units`);
  if (pk.action !== undefined && !ACTIONS.includes(pk.action)) errs.push(`${where}.action: one of ${ACTIONS.join('|')}`);
  if (pk.link !== undefined && pk.link !== null && !(isStr(pk.link) && okLink(pk.link))) errs.push(`${where}.link: http(s) URL expected`);
  if (pk.pending_news !== undefined && pk.pending_news !== null && typeof pk.pending_news !== 'string') errs.push(`${where}.pending_news: string or null`);
  const multi = MULTI_SECTIONS.includes(sec);
  if (multi || pk.legs !== undefined) {
    if (!Array.isArray(pk.legs) || pk.legs.length < (multi ? 2 : 1)) errs.push(`${where}.legs: ${multi ? 'at least 2 legs' : 'array'} required`);
    else pk.legs.forEach((l, i) => {
      if (!isStr(l && l.desc)) errs.push(`${where}.legs[${i}].desc: required string`);
      if (l && l.price !== undefined) range(errs, `${where}.legs[${i}].price`, l.price, 0, 100);
      if (l && l.fair !== undefined) range(errs, `${where}.legs[${i}].fair`, l.fair, 0, 100);
    });
    range(errs, `${where}.est_multiple`, pk.est_multiple, 1, 100000, multi);
    range(errs, `${where}.quoted_multiple`, pk.quoted_multiple, 1, 100000);
    range(errs, `${where}.hit_prob`, pk.hit_prob, 0, 100);
    range(errs, `${where}.skip_below`, pk.skip_below, 1, 100000);
  }
}

/**
 * Validate a whole picks.json document.
 * @param {object} d @returns {string[]} errors (empty = valid)
 */
export function validatePicks(d) {
  const errs = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['root: must be an object'];
  if (d.schema_version !== 1) errs.push('schema_version: must be 1');
  if (!isDate(d.slate_date)) errs.push('slate_date: YYYY-MM-DD required');
  if (!isISO(d.updated_at)) errs.push('updated_at: ISO 8601 required');
  if (d.notes !== undefined && !(Array.isArray(d.notes) && d.notes.every(n => typeof n === 'string'))) errs.push('notes: array of strings');
  if (!d.sections || typeof d.sections !== 'object') errs.push('sections: required object');
  else {
    for (const k of Object.keys(d.sections)) if (!SECTIONS.includes(k)) errs.push(`sections.${k}: unknown section (allowed: ${SECTIONS.join(', ')})`);
    const ids = new Set();
    for (const sec of SECTIONS) {
      const list = d.sections[sec];
      if (list === undefined) continue;
      if (!Array.isArray(list)) { errs.push(`sections.${sec}: must be an array`); continue; }
      list.forEach((it, i) => {
        const where = `sections.${sec}[${i}]`;
        if (sec === 'predictions') validatePrediction(it, where, errs); else validatePick(it, sec, where, errs);
        if (it && isStr(it.id)) { if (ids.has(it.id)) errs.push(`${where}.id: duplicate "${it.id}"`); ids.add(it.id); }
      });
    }
  }
  scanPrivacy(d, 'root', errs);
  return errs;
}

/**
 * Validate data/predictions.json.
 * @param {object} d @returns {string[]} errors
 */
export function validatePredictionsFile(d) {
  const errs = [];
  if (!d || d.schema_version !== 1) errs.push('schema_version: must be 1');
  if (!Array.isArray(d && d.predictions)) return [...errs, 'predictions: array required'];
  const ids = new Set();
  d.predictions.forEach((p, i) => {
    validatePrediction(p, `predictions[${i}]`, errs, { graded: true });
    if (p && ids.has(p.id)) errs.push(`predictions[${i}].id: duplicate "${p.id}"`);
    if (p) ids.add(p.id);
  });
  scanPrivacy(d, 'root', errs);
  return errs;
}

/**
 * Validate data/book-odds.json (automatic per-app price comparisons from The
 * Odds API; schema in HANDOFF.md). Dollar-free like everything else.
 * @param {object} d @returns {string[]} errors
 */
export function validateBookOdds(d) {
  const errs = [];
  if (!d || d.schema_version !== 1) errs.push('schema_version: must be 1');
  if (!['waiting_for_feed', 'active'].includes(d && d.status)) errs.push('status: must be "waiting_for_feed" or "active"');
  if (!Array.isArray(d && d.comparisons)) return [...errs, 'comparisons: array required'];
  const books = ['polymarket_us', 'kalshi', 'bovada', 'fanduel', 'draftkings', 'betmgm', 'caesars', 'espnbet', 'fanatics', 'bet365'];
  const cents = v => typeof v === 'number' && v > 0 && v < 100;
  d.comparisons.forEach((c, i) => {
    const w = `comparisons[${i}]`;
    if (!c || typeof c !== 'object') return errs.push(`${w}: object required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) errs.push(`${w}.date: YYYY-MM-DD required`);
    if (!books.includes(c.book)) errs.push(`${w}.book: one of ${books.join(', ')}`);
    if (!['yes', 'no'].includes(c.side)) errs.push(`${w}.side: "yes" or "no"`);
    if (!cents(c.book_chance)) errs.push(`${w}.book_chance: cents 0-100`);
    if (!cents(c.polymarket_price)) errs.push(`${w}.polymarket_price: cents 0-100`);
    if (typeof c.diff !== 'number' || Math.abs(c.diff - (c.book_chance - c.polymarket_price)) > 0.11) errs.push(`${w}.diff: must equal book_chance - polymarket_price`);
  });
  scanPrivacy(d, 'root', errs);
  return errs;
}

// ------------------------------------------------------------------ git

/** Run git in the repo root. @returns {string} stdout @throws on non-zero exit */
function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

/**
 * Stage exactly `files`, commit with subject/body, rebase on origin, push.
 * No-op (returns false) when the files didn't change.
 * @param {string[]} files absolute paths @param {string} subject @param {string[]} body lines
 * @param {{noPush:boolean}} opts @returns {boolean} committed
 */
function commitAndPush(files, subject, body, opts) {
  const rel = files.map(f => path.relative(ROOT, f));
  git('add', '--', ...rel);
  if (!git('diff', '--cached', '--name-only', '--', ...rel)) { console.log('No changes to commit.'); return false; }
  const msg = [subject, '', ...body, '', 'Written by scripts/update-picks.mjs after schema + privacy validation', '(units only; no dollar amounts or tokens).'].join('\n');
  git('commit', '-m', msg, '--', ...rel);
  console.log('Committed:', git('log', '-1', '--format=%h %s'));
  if (opts.noPush) { console.log('--no-push: not pushing.'); return true; }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  git('pull', '--rebase', '--autostash', 'origin', branch);
  git('push', 'origin', branch);
  console.log(`Pushed to ${branch}. GitHub Pages redeploys in ~1 minute.`);
  return true;
}

/** @param {object} d picks doc @returns {string[]} "singles: 4" style lines */
function sectionSummary(d) {
  return SECTIONS.map(s => {
    const list = (d.sections && d.sections[s]) || [];
    const bets = list.filter(x => x.action !== 'skip' && (s === 'predictions' || x.stake_units > 0)).length;
    return `- ${s}: ${list.length}${s === 'predictions' ? '' : ` (${bets} to bet or wait, ${list.length - bets} skip)`}`;
  });
}

/** Print errors and exit 1 if any. */
function failIf(errs, label) {
  if (!errs.length) return;
  console.error(`✗ ${label}: ${errs.length} problem(s)`);
  errs.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

// ------------------------------------------------------------------ commands

/** `validate [file]`: report only, never writes. */
function cmdValidate(file = PICKS) {
  const d = readJSON(file);
  const base = path.basename(file);
  const errs = base === 'predictions.json' ? validatePredictionsFile(d) : base === 'book-odds.json' ? validateBookOdds(d) : validatePicks(d);
  failIf(errs, file);
  console.log(`✓ ${file} is valid.`);
}

/** `picks <file>`: validate, replace data/picks.json, commit + push. */
function cmdPicks(file, o) {
  if (!file) usage('picks needs a file');
  const d = readJSON(file);
  failIf(validatePicks(d), file);
  const subject = `Update picks for ${d.slate_date} slate`;
  const body = [`Replaced data/picks.json (updated_at ${d.updated_at}).`, ...sectionSummary(d), ...o.notes];
  if (o.dryRun) return console.log('[dry-run] would commit:\n' + subject + '\n\n' + body.join('\n'));
  writeJSON(PICKS, d);
  commitAndPush([PICKS], subject, body, o);
}

/** Load predictions.json, creating the empty schema if missing. */
function loadPreds() {
  return fs.existsSync(PREDS) ? readJSON(PREDS) : { schema_version: 1, updated_at: new Date().toISOString(), predictions: [] };
}

/** `add-predictions <file>`: append new predictions (result defaults to pending). */
function cmdAddPredictions(file, o) {
  if (!file) usage('add-predictions needs a file');
  const incoming = readJSON(file);
  const list = Array.isArray(incoming) ? incoming : incoming.predictions;
  if (!Array.isArray(list) || !list.length) usage('file must be a non-empty array of predictions (or {predictions:[...]})');
  const doc = loadPreds();
  const existing = new Set(doc.predictions.map(p => p.id));
  const errs = [];
  list.forEach((p, i) => { if (existing.has(p.id)) errs.push(`incoming[${i}].id: "${p.id}" already exists — use grade to update it`); });
  const added = list.map(p => Object.assign({ result: 'pending' }, p));
  doc.predictions.push(...added);
  doc.updated_at = new Date().toISOString();
  failIf([...errs, ...validatePredictionsFile(doc)], 'predictions');
  const dates = [...new Set(added.map(p => p.date))].join(', ');
  const subject = `Add ${added.length} prediction(s) for ${dates}`;
  const body = added.map(p => `- ${p.id}: ${p.pick} ${p.win_prob}% (${p.game})`).concat(o.notes);
  if (o.dryRun) return console.log('[dry-run] would commit:\n' + subject + '\n\n' + body.join('\n'));
  writeJSON(PREDS, doc);
  commitAndPush([PREDS], subject, body, o);
}

/** `grade <file>` or `grade <id> <result> [final_score]`: set results on existing predictions. */
function cmdGrade(args, o) {
  let grades;
  if (args.length === 1) grades = readJSON(args[0]);
  else if (args.length >= 2) grades = [{ id: args[0], result: args[1], final_score: args[2] }];
  else usage('grade needs a file or <id> <result> [final_score]');
  if (!Array.isArray(grades)) usage('grades file must be an array of {id, result, final_score?}');
  const doc = loadPreds();
  const errs = [], lines = [];
  for (const g of grades) {
    const p = doc.predictions.find(x => x.id === g.id);
    if (!p) { errs.push(`grade ${g.id}: no such prediction`); continue; }
    if (!['win', 'loss', 'push'].includes(g.result)) { errs.push(`grade ${g.id}: result must be win|loss|push`); continue; }
    p.result = g.result;
    if (g.final_score) p.final_score = g.final_score;
    p.graded_at = new Date().toISOString();
    lines.push(`- ${p.id}: ${p.pick} ${p.win_prob}% -> ${g.result}${g.final_score ? ` (${g.final_score})` : ''}`);
  }
  doc.updated_at = new Date().toISOString();
  failIf([...errs, ...validatePredictionsFile(doc)], 'grades');
  const graded = doc.predictions.filter(p => p.result === 'win' || p.result === 'loss');
  const wins = graded.filter(p => p.result === 'win').length;
  const subject = `Grade ${lines.length} prediction(s)`;
  const body = [...lines, '', `Running record: ${wins}-${graded.length - wins}` + (graded.length ? ` (${(100 * wins / graded.length).toFixed(1)}%)` : ''), ...o.notes];
  if (o.dryRun) return console.log('[dry-run] would commit:\n' + subject + '\n\n' + body.join('\n'));
  writeJSON(PREDS, doc);
  commitAndPush([PREDS], subject, body, o);
}

/** Print usage and exit 2. */
function usage(msg) {
  if (msg) console.error('Error: ' + msg + '\n');
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => /^ \*   (node|Flags|   )/.test(l)).map(l => l.slice(3)).join('\n'));
  process.exit(2);
}

// ------------------------------------------------------------------ main

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = o.pos;
  try {
    if (cmd === 'validate') cmdValidate(rest[0] ? path.resolve(rest[0]) : PICKS);
    else if (cmd === 'picks') cmdPicks(rest[0], o);
    else if (cmd === 'add-predictions') cmdAddPredictions(rest[0], o);
    else if (cmd === 'grade') cmdGrade(rest, o);
    else usage(cmd ? `unknown command "${cmd}"` : '');
  } catch (e) {
    const isGit = e && (e.cmd || e.status !== undefined) && String(e.message).includes('git');
    console.error('✗ ' + (e.stderr ? String(e.stderr).trim() : e.message));
    process.exit(isGit ? 3 : 1);
  }
}
