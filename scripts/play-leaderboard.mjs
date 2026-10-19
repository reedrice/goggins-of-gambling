#!/usr/bin/env node
/**
 * scripts/play-leaderboard.mjs — builds the shared PLAY MONEY leaderboard
 * (data/play/leaderboard.json) from "Post my score" GitHub issues.
 *
 * HOW SHARING WORKS (no server, no keys)
 *   On the site, "Post my score" opens a pre-filled GitHub issue titled
 *   "Play score: <name>" whose body has a ```json block (js/play.js
 *   submission(): name + the newest 40 bets: market id, side, price, stake).
 *   This script reads those PUBLIC issues, keeps each GitHub user's newest
 *   one, RE-SETTLES every bet itself from real Polymarket US results (the
 *   statuses people's browsers show are not trusted), drops bets the points
 *   couldn't cover, and writes the table. Run it from the daily job (or hourly
 *   during games).
 *
 * USAGE
 *   node scripts/play-leaderboard.mjs            # write data/play/leaderboard.json
 *   node scripts/play-leaderboard.mjs --dry-run  # print the table only
 *   node scripts/play-leaderboard.mjs --commit   # write + commit + pull --rebase + push (only if it changed)
 *
 * AUTH: none needed (public issues, 60 GitHub API calls/hour unauthenticated).
 *   If GITHUB_TOKEN is set in the environment it is sent ONLY to api.github.com
 *   to raise that limit. It is never printed, logged or written anywhere.
 *
 * PRIVACY: points only (play money). Shows display name + GitHub login (the
 *   issue is public anyway). No dollars, no "$" text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = require(path.join(ROOT, 'js/play.js'));
const OUT = path.join(ROOT, 'data/play/leaderboard.json');
const REPO = 'reedrice/goggins-of-gambling';
const GATEWAY = 'https://gateway.polymarket.us';
const args = process.argv.slice(2);

/** GitHub API GET (token only if the env has one; never echoed). */
async function gh(url) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'play-leaderboard' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const r = await fetch(url, { headers: h });
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  return r.json();
}

/** Every "Play score:" issue, newest first (up to 500). */
async function submissions() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`);
    for (const i of list) if (!i.pull_request && String(i.title).startsWith(P.ISSUE_PREFIX)) out.push(i);
    if (list.length < 100) break;
  }
  return out;
}

const evCache = new Map();
/** Polymarket US event for a game slug (cached; null when missing). */
async function event(slug) {
  if (!evCache.has(slug)) evCache.set(slug, fetch(`${GATEWAY}/v1/events/slug/${slug}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return evCache.get(slug);
}

/** Settle one submitted bet from real results. */
async function settleBet(b) {
  const results = [];
  for (const l of b.legs) { const slug = P.gameSlug(l.marketId); results.push(slug ? P.legResult(await event(slug), l.marketId, l.side) : null); }
  return Object.assign({}, b, P.settle(b, results));
}

export async function build(issues) {
  const seen = new Set(), rows = [];
  for (const i of issues) {                       // newest first: first one per login wins
    const login = i.user && i.user.login;
    if (!login || seen.has(login)) continue;
    const sub = P.parseSubmission(i.body);
    if (!sub) continue;
    seen.add(login);
    const settled = P.replay(await Promise.all(sub.bets.map(settleBet)));
    const s = P.stats(settled);
    rows.push({ name: sub.name, github: login, points: s.points, w: s.w, l: s.l, p: s.p, open: s.open,
      roi: s.roi == null ? null : +s.roi.toFixed(3), best: s.best, bets: settled.length, posted_at: i.created_at, issue: i.html_url });
  }
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return { schema_version: 1, note: 'Play money, just for fun. Points only. Built by scripts/play-leaderboard.mjs from "Play score:" issues.', rows };
}

async function main() {
  const doc = await build(await submissions());
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const same = old && JSON.stringify(old.rows) === JSON.stringify(doc.rows);
  doc.updated_at = same ? old.updated_at : new Date().toISOString();
  for (const r of doc.rows) console.log(`${String(r.points).padStart(6)} pts  ${r.w}-${r.l}  ${r.name} (@${r.github})`);
  if (!doc.rows.length) console.log('No "Play score:" issues yet.');
  if (args.includes('--dry-run')) return;
  if (same) { console.log('Leaderboard unchanged.'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  console.log('Wrote data/play/leaderboard.json');
  if (args.includes('--commit')) {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
    git('add', '--', 'data/play/leaderboard.json');
    git('commit', '-q', '-m', `Play money leaderboard: ${doc.rows.length} player(s)`);
    git('pull', '-q', '--rebase'); git('push', '-q', 'origin', 'HEAD:main');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error('play-leaderboard:', e.message); process.exit(1); });
