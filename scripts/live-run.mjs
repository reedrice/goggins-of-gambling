#!/usr/bin/env node
/**
 * live-run.mjs — one scheduled Live Bets pass (Pablo / Richie's bot).
 * WHAT: git pull, `live-tick.mjs --push` (prices, edges, alerts for every live/soon game),
 *       then `live-discord.mjs --slug X` for each non-final game in data/live/index.json.
 * WHY:  the Discord step used to run with no --slug, so it defaulted to the old MNF game and
 *       never posted tonight's edges (HANDOFF "Live Bets fix, Oct 20").
 * Never prints secrets; Discord is skipped when DISCORD_WEBHOOK_URL is not set. Always exits 0.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', timeout: 240000 }); return true; }
  catch (e) { console.error(`live-run: ${cmd} ${args[0] || ''} failed (${e.status ?? e.code})`); return false; }
};

console.log(`--- live-run ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`);
run('git', ['pull', '-q', '--rebase', 'origin', 'main']);
run('node', ['scripts/live-tick.mjs', '--push']);

if (!process.env.DISCORD_WEBHOOK_URL) { console.log('live-run: no Discord webhook set, skipping Discord'); process.exit(0); }
let games = [];
try { games = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/live/index.json'), 'utf8')).games || []; } catch { /* no index yet */ }
for (const g of games.filter(g => g.status !== 'final')) run('node', ['scripts/live-discord.mjs', '--slug', g.slug]);
process.exit(0);
