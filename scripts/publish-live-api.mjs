#!/usr/bin/env node
// Publish prepared local changes using gh's credential storage, without a Git Bash helper.
// Refuse races; the next attempt must reconcile and regenerate from latest main.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const repo = 'repos/reedrice/goggins-of-gambling';
const messageIndex = process.argv.indexOf('--message');
const message = messageIndex >= 0 ? process.argv[messageIndex + 1] : null;
const git = (...args) => execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const api = (endpoint, body) => JSON.parse(execFileSync('gh', ['api', endpoint, ...(body ? ['--method', 'POST', '--input', '-'] : [])], {encoding:'utf8',input:body ? JSON.stringify(body) : undefined,stdio:['pipe','pipe','pipe']}));
try {
  const parent = git('rev-parse', 'origin/main');
  const head = api(repo + '/git/ref/heads/main').object.sha;
  if (head !== parent) throw new Error('Main changed. Fetch, reconcile and regenerate before publishing.');
  const paths = git('diff', 'origin/main', '--name-only').split(/\r?\n/).filter(Boolean);
  if (!paths.length) { console.log('No changes to publish.'); process.exit(0); }
  // Maintenance code must already be committed locally for a reviewable record.
  const allowed = new Set(git('diff', 'origin/main', 'HEAD', '--name-only').split(/\r?\n/));
  for (const p of paths) if (!allowed.has(p) && !p.startsWith('data/live/') && p !== 'routines/owners.json') throw new Error('Unexpected uncommitted file: ' + p);
  const base = api(repo + '/git/commits/' + parent).tree.sha;
  const tree = api(repo + '/git/trees', {base_tree:base,tree:paths.map(p => ({path:p,mode:'100644',type:'blob',content:fs.readFileSync(p,'utf8')}))});
  const commit = api(repo + '/git/commits', {message:message || 'live: ChatGPT maintenance takeover and verified feed refresh\n\nPreserve latest published openings and history; fix Windows paths, gate ownership and report runner failures. Handoff and operation notes are in routines/LIVE-FEED.md and HANDOFF section 61.',tree:tree.sha,parents:[parent]});
  execFileSync('gh', ['api', repo + '/git/refs/heads/main', '--method','PATCH','--input','-'], {input:JSON.stringify({sha:commit.sha,force:false}),stdio:['pipe','ignore','pipe']});
  console.log('Published ' + commit.sha + ' (' + paths.length + ' files)');
} catch (e) { console.error(e.message?.split('\n')[0] || 'Publication failed'); process.exitCode=1; }
