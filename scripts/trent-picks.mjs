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
 *   node scripts/trent-picks.mjs questions                          open dev questions (needs_clarification)
 *   node scripts/trent-picks.mjs ask <id> --question "..." [--issue]   flag a pick unclear + ask (--issue: GitHub issue, label trent-clarify, @mentions collaborators)
 *   node scripts/trent-picks.mjs ask <id> --question "..." --issue --option "Label|key=value,key=value" [--option ...]   dev vote: one comment per option (A, B, C...), 👍 to vote
 *   node scripts/trent-picks.mjs tally <id> [--commit]             count 👍 per option, apply the winner, comment + close (tie: reedrice's 👍 decides, else stays open)
 *   node scripts/trent-picks.mjs clarify <id> --set key=value [--set ...] --answer "..."   answer -> data/trent-overrides.json (closes the pick's issue if any)
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
const OVF = path.join(ROOT, 'data/trent-overrides.json');
const loadOv = () => { try { const o = JSON.parse(fs.readFileSync(OVF, 'utf8')); o.overrides = o.overrides || {}; return o; } catch { return { schema_version: 1, overrides: {} }; } };
// GitHub issue per question (HANDOFF §58): needs an authenticated `gh`. Mentions every current
// collaborator (fetched each time). Body holds only the bet text, post link and question (no money, no secrets).
const gh = (...g) => execFileSync('gh', g, { cwd: ROOT, encoding: 'utf8' }).trim();
function openIssue(p) {
  const who = gh('api', 'repos/{owner}/{repo}/collaborators', '--jq', '.[].login').split('\n').filter(Boolean).map(l => '@' + l).join(' ');
  try { gh('label', 'create', 'trent-clarify', '--color', 'ff5a1f', '--description', 'Fade Trent pick needs a dev answer'); } catch { /* exists */ }
  const body = [`**Pick:** ${p.pick}`, p.game ? `**Game:** ${p.game}` : '', `**Post:** ${T.postUrl(p.post_id)}`, `**Quote:** ${p.quote || ''}`, '', `**Question:** ${p.question}`, '',
    `Answer with: \`node scripts/trent-picks.mjs clarify ${p.id} --set key=value --answer "..." --commit\` (closes this issue).`, '', who].filter(x => x !== null).join('\n');
  const url = gh('issue', 'create', '--title', `Trent clarify: ${p.pick}`.slice(0, 120), '--label', 'trent-clarify', '--body', body);
  const n = Number((/\/issues\/(\d+)/.exec(url) || [])[1]); console.log('Opened ' + url); return n || null;
}
function closeIssue(n, answer) { try { gh('issue', 'close', String(n), '--comment', `Answered: ${answer}`); console.log('Closed issue #' + n); } catch (e) { console.error('Could not close issue #' + n + ': ' + e.message.split('\n')[0]); } }
function save(doc, msg, extra = []) {
  const errs = T.validate(doc);
  if (errs.length) { console.error('Not saved, problems:\n  ' + errs.join('\n  ')); process.exit(1); }
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n');
  console.log('Saved data/trent-picks.json');
  if (flag('--commit')) {
    const git = (...g) => execFileSync('git', g, { cwd: ROOT, encoding: 'utf8' }).trim();
    git('add', '--', 'data/trent-picks.json', ...extra.map(f => path.relative(ROOT, f))); git('commit', '-m', msg);
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
    // Always store the tweet link, built from the REAL post id (from the x tools: the
    // post's "id"). post_id may be given, or it is read from the row id ("<postid>" or
    // "<postid>-tb") or an existing url. No real id -> refuse (never invent a link).
    const pid = String(p.post_id || (String(p.url || '').match(/status\/(\d+)/) || [])[1] || (String(p.id || '').match(/^(\d{10,})/) || [])[1] || '');
    if (!/^\d{10,}$/.test(pid)) { console.error(`Pick ${p.id}: no real X post id; skipped`); continue; }
    p.post_id = pid; p.url = T.postUrl(pid);
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
} else if (cmd === 'questions') {
  const qs = T.openQuestions(T.applyOverrides(load().picks, loadOv()));
  if (!qs.length) console.log('No open questions.');
  qs.forEach(q => console.log(`${q.id}  ${q.pick}${q.game ? ' · ' + q.game : ''}\n  Q: ${q.question}\n  ${q.url}${q.issue ? `\n  issue #${q.issue}` : ''}`));
} else if (cmd === 'ask') {
  const doc = load(), p = doc.picks.find(x => x.id === a1);
  if (!p || !opt('--question')) { console.error('Usage: ask <id> --question "..." [--issue]'); process.exit(1); }
  Object.assign(p, { needs_clarification: true, question: opt('--question'), unclear: true, result: 'pending' });
  const opts = []; args.forEach((x, i) => { if (x === '--option') { const [label, kv = ''] = String(args[i + 1] || '').split('|'); const set = {};
    kv.split(',').filter(Boolean).forEach(pair => { const [k, ...v] = pair.split('='); if (!T.OVERRIDE_KEYS.includes(k)) { console.error('Allowed keys: ' + T.OVERRIDE_KEYS.join(', ')); process.exit(1); } let val = v.join('='); if (k === 'units' && /^\d+(\.\d+)?$/.test(val)) val = Number(val); if (val === 'true' || val === 'false') val = val === 'true'; set[k] = val; });
    opts.push({ key: String.fromCharCode(65 + opts.length), label, set }); } });
  if (opts.length) p.options = opts;
  if (flag('--issue')) { p.issue = openIssue(p); if (p.issue && opts.length) for (const o of opts) o.comment_id = Number(gh('api', `repos/{owner}/{repo}/issues/${p.issue}/comments`, '-f', `body=**Option ${o.key}:** ${o.label}\n\nVote with 👍 on this comment.`, '--jq', '.id')); }
  save(doc, `Fade Trent: question on ${p.pick}`);
} else if (cmd === 'clarify') {
  const doc = load(), p = doc.picks.find(x => x.id === a1);
  if (!p || !opt('--answer')) { console.error('Usage: clarify <id> --set key=value [--set ...] --answer "..."'); process.exit(1); }
  const set = {};
  args.forEach((x, i) => { if (x === '--set') { const [k, ...v] = String(args[i + 1] || '').split('='); let val = v.join('='); if (!T.OVERRIDE_KEYS.includes(k)) { console.error('Allowed keys: ' + T.OVERRIDE_KEYS.join(', ')); process.exit(1); } if (/^-?\d+(\.\d+)?$/.test(val) && k === 'units') val = Number(val); if (val === 'true' || val === 'false') val = val === 'true'; set[k] = val; } });
  const ov = loadOv(); ov.overrides[p.id] = { set, answer: opt('--answer'), answered_at: new Date().toISOString() };
  const check = T.validate({ ...doc, picks: T.applyOverrides(doc.picks, ov) });
  if (check.length) { console.error('Override makes the data invalid:\n' + check.join('\n')); process.exit(1); }
  fs.writeFileSync(OVF, JSON.stringify(ov, null, 1) + '\n');
  p.needs_clarification = false;
  if (p.issue) closeIssue(p.issue, opt('--answer'));
  save(doc, `Fade Trent: clarify ${p.pick}`, [OVF]);
} else if (cmd === 'tally') {
  const doc = load(), p = doc.picks.find(x => x.id === a1 || String(x.issue) === String(a1));
  if (!p || !p.issue || !(p.options || []).length) { console.error('tally <pick id or issue number>: pick needs an issue with options (ask --issue --option ...)'); process.exit(1); }
  const votes = p.options.map(o => { const users = gh('api', `repos/{owner}/{repo}/issues/comments/${o.comment_id}/reactions`, '--jq', '[.[] | select(.content=="+1") | .user.login] | join(",")').split(',').filter(Boolean); return { o, n: users.length, users }; });
  votes.forEach(v => console.log(`Option ${v.o.key} (${v.o.label}): ${v.n} 👍 ${v.users.join(' ')}`));
  const top = Math.max(...votes.map(v => v.n)), lead = votes.filter(v => v.n === top);
  let win = top > 0 && lead.length === 1 ? lead[0] : top > 0 ? lead.find(v => v.users.includes('reedrice')) : null;   // tie: Reed decides
  if (!win) { console.log(top ? 'Tie. Waiting for reedrice to 👍 one of the tied options.' : 'No votes yet.'); if (top) gh('issue', 'comment', String(p.issue), '--body', `Tie between ${lead.map(v => v.o.key).join(' / ')}. @reedrice decides: 👍 one of them.`); process.exit(0); }
  const ov = loadOv(); ov.overrides[p.id] = { set: win.o.set, answer: `Option ${win.o.key}: ${win.o.label} (${win.n} 👍)`, answered_at: new Date().toISOString(), issue: p.issue };
  const check = T.validate({ ...doc, picks: T.applyOverrides(doc.picks, ov) });
  if (check.length) { console.error('Winning option makes the data invalid:\n' + check.join('\n')); process.exit(1); }
  fs.writeFileSync(OVF, JSON.stringify(ov, null, 1) + '\n'); p.needs_clarification = false;
  closeIssue(p.issue, `Option ${win.o.key} wins (${votes.map(v => v.o.key + ' ' + v.n).join(', ')}): ${win.o.label}. Applied to the site.`);
  save(doc, `Fade Trent: vote result for ${p.pick} (option ${win.o.key})`, [OVF]);
} else { console.log('Commands: validate | summary | questions | add <file> | grade <id> <win|loss|push> --score .. --source .. | ask <id> --question .. [--issue] | clarify <id> --set k=v --answer ..'); process.exit(2); }
