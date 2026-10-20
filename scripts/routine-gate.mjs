#!/usr/bin/env node
/**
 * routine-gate.mjs: one switch per routine so only ONE bot runs it.
 * Reads/writes routines/owners.json (see routines/README.md).
 *
 *   node scripts/routine-gate.mjs check <id> <me>        RUN (exit 0) or SKIP (reason) (exit 3)
 *   node scripts/routine-gate.mjs stamp <id> <me> [--no-push]   record last_run_by/at, commit + push
 *   node scripts/routine-gate.mjs set <id> <owner> [--off|--on] [--no-push]   hand a routine to another bot
 *   node scripts/routine-gate.mjs list
 * Exit 2 = bad usage / unknown id. No secrets, no dollar amounts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = path.join(REPO, 'routines', 'owners.json');
export const OWNERS = ['grok', 'chatgpt', 'pablo', 'off'];
export const STALE_MIN = 30;

/** Pure: should `me` run routine `id` now? -> {run, reason} */
export function decide(doc, id, me, nowMs = Date.now()) {
  const r = doc && doc.routines && doc.routines[id];
  if (!r) return { run: false, reason: `unknown routine "${id}"` };
  if (!r.enabled || r.owner === 'off') return { run: false, reason: 'routine is turned off' };
  if (r.owner !== me) return { run: false, reason: `owner is ${r.owner}, not ${me}` };
  const t = Date.parse(r.last_run_at || '');
  if (r.last_run_by && r.last_run_by !== me && !isNaN(t) && nowMs - t < STALE_MIN * 60e3)
    return { run: false, reason: `${r.last_run_by} ran it ${Math.round((nowMs - t) / 60e3)} min ago (handover guard, ${STALE_MIN} min)` };
  return { run: true, reason: 'ok' };
}

/** Pure: new doc with the stamp applied. */
export function stamp(doc, id, me, nowIso = new Date().toISOString()) {
  const d = structuredClone(doc);
  if (!d.routines[id]) throw new Error(`unknown routine "${id}"`);
  Object.assign(d.routines[id], { last_run_by: me, last_run_at: nowIso });
  return d;
}

/** Pure: new doc with owner / enabled changed. */
export function setOwner(doc, id, owner, { off = false, on = false } = {}) {
  if (!OWNERS.includes(owner)) throw new Error(`owner must be one of ${OWNERS.join(', ')}`);
  const d = structuredClone(doc);
  const r = d.routines[id];
  if (!r) throw new Error(`unknown routine "${id}"`);
  r.owner = owner;
  if (owner === 'off' || off) r.enabled = false; else if (on || owner !== 'off') r.enabled = true;
  return d;
}

const read = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const write = d => fs.writeFileSync(FILE, JSON.stringify(d, null, 2) + '\n');
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pull = () => { try { git('pull', '-q', '--rebase', '--autostash', 'origin', 'main'); } catch { /* offline: use local copy */ } };

/** Apply fn to the freshest owners.json, commit, push; retry once on a push race. */
function commitChange(fn, msg, push) {
  for (let i = 0; i < 2; i++) {
    if (push) pull();
    write(fn(read()));
    git('add', '--', 'routines/owners.json');
    if (!git('diff', '--cached', '--name-only')) return console.log('no change');
    git('commit', '-q', '-m', msg);
    if (!push) return console.log('committed (not pushed)');
    try { git('push', '-q', 'origin', 'HEAD:main'); return console.log('pushed'); }
    catch (e) { if (i) throw e; git('reset', '-q', '--soft', 'HEAD~1'); git('checkout', '--', 'routines/owners.json'); }
  }
}

function main(argv) {
  const [cmd, id, who] = argv, push = !argv.includes('--no-push');
  if (cmd === 'list') { for (const [k, r] of Object.entries(read().routines)) console.log(`${k}: ${r.enabled ? r.owner : 'off'} (last ${r.last_run_by || '-'} ${r.last_run_at || '-'})`); return 0; }
  if (!cmd || !id || !who) { console.error('usage: check|stamp|set <id> <name>'); return 2; }
  if (cmd === 'check') {
    pull();
    const r = decide(read(), id, who);
    console.log(r.run ? 'RUN' : `SKIP (${r.reason})`);
    return r.run ? 0 : read().routines[id] ? 3 : 2;
  }
  if (cmd === 'stamp') { commitChange(d => stamp(d, id, who), `routines: ${who} ran ${id}`, push); return 0; }
  if (cmd === 'set') { commitChange(d => setOwner(d, id, who, { off: argv.includes('--off'), on: argv.includes('--on') }), `routines: ${id} owner -> ${who}${argv.includes('--off') ? ' (off)' : ''}`, push); return 0; }
  console.error('unknown command'); return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error('routine-gate:', e.message); process.exit(2); }
}
