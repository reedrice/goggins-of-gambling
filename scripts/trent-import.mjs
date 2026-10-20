#!/usr/bin/env node
// Import picks verified in the public X browser. This does not claim to fetch X itself.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { decide, stamp } from './routine-gate.mjs';
const require = createRequire(import.meta.url);
const T = require('../js/trent.js');

export function importPosts(doc, batch, now = new Date().toISOString()) {
  if (!['complete', 'partial'].includes(batch.coverage) || !Array.isArray(batch.posts)) throw new Error('Verified posts[] and coverage required');
  const out = structuredClone(doc);
  let added = 0;
  for (const post of batch.posts) {
    if (!/^\d{10,}$/.test(post.id) || !post.text || !Number.isFinite(Date.parse(post.posted_at))) throw new Error('Real post id, text and timestamp required');
    if (post.author !== 'BookitWithTrent') throw new Error('Wrong source author');
    const parts = new Set();
    for (const pick of post.picks || []) {
      // Stable suffix distinguishes multiple picks in one post; never use array position.
      if (!/^[a-z0-9-]+$/.test(pick.key || '') || parts.has(pick.key)) throw new Error('Unique stable pick key required');
      parts.add(pick.key);
      const id = post.id + '-' + pick.key;
      // Preserve existing rows, including manual grades and clarifications.
      if (out.picks.some(p => p.id === id || (p.post_id === post.id && p.pick === pick.pick))) continue;
      out.picks.push({id,post_id:post.id,posted_at:post.posted_at,league:pick.league,game:pick.game,pick:pick.pick,type:pick.type,odds:pick.odds ?? null,units:pick.units ?? null,result:'pending',final_score:null,graded_from:null,quote:post.text,url:T.postUrl(post.id),unclear:!!pick.unclear,note:pick.note || null,...(pick.unclear ? {needs_clarification:true,question:pick.question || 'What exactly was the pick?'} : {})});
      added++;
    }
  }
  const errors = T.validate(out);
  if (errors.length) throw new Error(errors.join('\n'));
  out.picks.sort((a,b) => a.posted_at.localeCompare(b.posted_at));
  out.monitor = {checked_at:now,coverage:batch.coverage,source:'X public profile via browser',latest_post_id:batch.posts.reduce((id,p)=>!id || BigInt(p.id)>BigInt(id)?p.id:id,null)};
  // Partial public timelines must never advance the complete-read watermark.
  if (batch.coverage === 'complete' && batch.posts.length) out.read_through = batch.posts.map(p=>p.posted_at).sort().at(-1);
  out.updated_at = now;
  return {doc:out,added};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const ownerFile = new URL('../routines/owners.json', import.meta.url);
    const owners = JSON.parse(fs.readFileSync(ownerFile,'utf8'));
    const gate = decide(owners,'trent-post-check','chatgpt');
    if (!gate.run) { console.log('SKIP (' + gate.reason + ')'); process.exit(0); }
    const file = new URL('../data/trent-picks.json', import.meta.url);
    const result = importPosts(JSON.parse(fs.readFileSync(file,'utf8')),JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
    fs.writeFileSync(file,JSON.stringify(result.doc,null,1)+'\n');
    fs.writeFileSync(ownerFile,JSON.stringify(stamp(owners,'trent-post-check','chatgpt'),null,2)+'\n');
    console.log('Imported '+result.added+' new picks; coverage '+result.doc.monitor.coverage);
  } catch (e) { console.error(e.message); process.exitCode=1; }
}
