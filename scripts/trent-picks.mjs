#!/usr/bin/env node
/**
 * scripts/trent-picks.mjs — keep data/trent-picks.json (the "Fade Trent" tab) up to date.
 * HANDOFF §28 has the daily routine. The X posts themselves are read by the
 * agent with the x MCP tools (get_users_posts for user id 66287704 =
 * @BookitWithTrent); this script only merges, grades, checks and summarizes.
 *
 * USAGE
 *   node scripts/trent-picks.mjs validate
 *   node scripts/trent-picks.mjs summary
 *   node scripts/trent-picks.mjs add <new-picks.json> [--read-through ISO]   merge by id; never touches graded rows
 *   node scripts/trent-picks.mjs grade <id> <win|loss|push> --score "Packers 23, Cowboys 13" --source <url> [--note "..."]
 *   add --commit [--no-push] to any write command.
 *
 * RULES (also enforced by js/trent.js validate)
 *   - Only real picks he wrote in the post text. Pick only in an image, or bet
 *     type/side unclear -> skip it, or add it with unclear:true (never graded).
 *   - Grade from real final results only, with the score and a source link.
 *   - Postponed/cancelled -> push with a note ("no action").
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data/trent-picks.json');
const T = require(path.join(ROOT, 'js/trent.js'));
const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const flag = f => args.includes(f);
const [cmd, a1, a2] = args.filter((x, i) => !x.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--commit', '--no-push'].includes(args[i - 1])));

const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
function save(doc, msg) {
  const errs = T.validate(doc);
  if (errs.length) { console.error('Not saved, problems:\n  ' + errs.join('\n  ')); process.exit(1); }
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
  console.log('Saved data/trent-picks.json');
  if (flag('--commit')) {
    const git = (...g) => execFileSync('git', g, { cwd: ROOT, encoding: 'utf8' }).trim();
    git('add', '--', 'data/trent-picks.json'); git('commit', '-m', msg);
    if (!flag('--no-push')) { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push', 'origin', 'main'); console.log('Pushed.'); }
  }
}
function printSummary(doc) {
  const s = T.summary(doc.picks);
  const line = (k, x) => `${k}: ${x.w}-${x.l}-${x.p}${x.winPct !== null ? ` (${x.winPct}%)` : ''}, units ${x.units >= 0 ? '+' : ''}${x.units}u (${x.unitsN} with units), fade ${x.fw}-${x.fl}-${x.fp}, pending ${x.pending}, unclear ${x.unclear}`;
  console.log(line('All', s.all));
  Object.entries(s.byLeague).forEach(([k, v]) => console.log('  ' + line(k, v)));
}

if (cmd === 'validate') { const e = T.validate(load()); console.log(e.length ? e.join('\n') : 'data/trent-picks.json is valid.'); process.exit(e.length ? 1 : 0); }
else if (cmd === 'summary') printSummary(load());
else if (cmd === 'add') {
  const doc = load(), incoming = JSON.parse(fs.readFileSync(a1, 'utf8'));
  const list = Array.isArray(incoming) ? incoming : incoming.picks;
  let added = 0, updated = 0;
  for (const p of list) {
    const i = doc.picks.findIndex(x => x.id === p.id);
    if (i < 0) { doc.picks.push(Object.assign({ unclear: false, note: null, final_score: null, graded_from: null, result: 'pending' }, p)); added++; }
    else if (doc.picks[i].result === 'pending') { doc.picks[i] = Object.assign(doc.picks[i], p); updated++; }   // graded rows are kept
  }
  doc.picks.sort((x, y) => String(x.posted_at).localeCompare(String(y.posted_at)));
  if (opt('--read-through')) doc.read_through = opt('--read-through');
  save(doc, `Fade Trent: ${added} new picks, ${updated} updated`);
  printSummary(doc);
} else if (cmd === 'grade') {
  const doc = load(), p = doc.picks.find(x => x.id === a1);
  if (!p) { console.error('No pick with id ' + a1); process.exit(1); }
  if (!['win', 'loss', 'push'].includes(a2)) { console.error('Result must be win, loss or push'); process.exit(1); }
  if (!opt('--score') || !opt('--source')) { console.error('--score and --source (real final result) are required'); process.exit(1); }
  Object.assign(p, { result: a2, final_score: opt('--score'), graded_from: opt('--source') });
  if (opt('--note')) p.note = opt('--note');
  save(doc, `Fade Trent: grade ${p.pick} (${a2}, ${p.final_score})`);
  printSummary(doc);
} else { console.log('Commands: validate | summary | add <file> | grade <id> <win|loss|push> --score .. --source ..'); process.exit(2); }
