#!/usr/bin/env node
/**
 * bump-version.mjs — ONE step to ship new css/js to phones (HANDOFF §49).
 * Sets the same stamp in: index.html ?v= on every include, window.APP_VERSION
 * in index.html, and version.json. The page compares APP_VERSION with
 * version.json on load / when shown again and reloads once if they differ.
 * USAGE  node scripts/bump-version.mjs [stamp]   (default: now in CT, YYYYMMDD-HHMM)
 *        node scripts/bump-version.mjs --check   (exit 1 if the three disagree)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDX = path.join(REPO, 'index.html'), VER = path.join(REPO, 'version.json');
export function nowStamp(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}
export function stamps(html) {
  return { app: (/window\.APP_VERSION = '([^']+)'/.exec(html) || [])[1], v: [...new Set([...html.matchAll(/\?v=([0-9-]+)"/g)].map(m => m[1]))] };
}
const arg = process.argv[2];
let html = fs.readFileSync(IDX, 'utf8');
if (arg === '--check') {
  const s = stamps(html), j = JSON.parse(fs.readFileSync(VER, 'utf8')).version;
  const ok = s.v.length === 1 && s.v[0] === s.app && s.app === j;
  console.log(ok ? `version ok: ${j}` : `version MISMATCH: APP_VERSION ${s.app}, ?v= ${s.v.join(',')}, version.json ${j}`);
  process.exit(ok ? 0 : 1);
}
const v = arg || nowStamp();
if (!/^[0-9-]+$/.test(v)) { console.error('stamp must be digits and dashes'); process.exit(1); }
html = html.replace(/\?v=[0-9-]+"/g, `?v=${v}"`).replace(/window\.APP_VERSION = '[^']*'/, `window.APP_VERSION = '${v}'`);
fs.writeFileSync(IDX, html);
fs.writeFileSync(VER, JSON.stringify({ version: v }) + '\n');
console.log('version ->', v);
