#!/usr/bin/env node
// One scheduled feed pass. Old Pablo commands default to pablo and skip during takeover.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, stamp } from './routine-gate.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const owner = args.includes('--owner') ? args[args.indexOf('--owner') + 1] : 'pablo';
const noPush = args.includes('--no-push');
const ownersFile = path.join(ROOT, 'routines', 'owners.json');
const run = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit', timeout: 900000 });
try {
  run('git', ['pull', '-q', '--rebase', 'origin', 'main']);
  const owners = JSON.parse(fs.readFileSync(ownersFile, 'utf8'));
  const gate = decide(owners, 'live-feed-update', owner);
  if (!gate.run) { console.log('SKIP (' + gate.reason + ')'); process.exit(0); }
  run(process.execPath, ['scripts/live-tick.mjs']);
  fs.writeFileSync(ownersFile, JSON.stringify(stamp(owners, 'live-feed-update', owner), null, 2) + '\n');
  if (!noPush) {
    run('git', ['add', '--', 'data/live', 'routines/owners.json']);
    run('git', ['commit', '-q', '-m', 'live: ' + owner + ' refreshed feed and ownership stamp']);
    run('git', ['pull', '-q', '--rebase', '--autostash', 'origin', 'main']);
    run('git', ['push', '-q', 'origin', 'HEAD:main']);
  }
  // The connector scheduler publishes after --no-push and does not send Discord messages.
  if (!noPush && process.env.DISCORD_WEBHOOK_URL) {
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/live/index.json'), 'utf8')).games || [];
    for (const g of games.filter(g => g.status !== 'final')) run(process.execPath, ['scripts/live-discord.mjs', '--slug', g.slug]);
  }
} catch (e) {
  console.error('live-run failed (' + (e.status ?? e.code ?? 'error') + '); inspect run before marking successful');
  process.exitCode = 1;
}
