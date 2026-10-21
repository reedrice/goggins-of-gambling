#!/usr/bin/env node
// Deterministic CI job. No LLM calls. Regenerate against latest main after a push race.
import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {decide,stamp} from './routine-gate.mjs';import {shouldTick} from './live-tick.mjs';
export const ALLOWED=['data/live/','routines/owners.json','data/predictions.json','data/pick-history.json','data/live-record.json','data/learning.json','data/live-feedback.json'];
export const allowed=p=>ALLOWED.some(a=>a.endsWith('/')?p.startsWith(a):p===a);
export function checkFresh(games,started){const due=games.filter(g=>g.status!=='final'&&shouldTick({start:g.start_time,status:g.status},started));const stale=due.filter(g=>!Number.isFinite(Date.parse(g.updated))||Date.parse(g.updated)<started-30000);if(stale.length)throw Error('Due games were not refreshed: '+stale.map(g=>g.slug).join(', '));console.log('Fresh due games: '+due.length);}
function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='reedrice/goggins-of-gambling'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Production GitHub Actions only');
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const run=script=>execFileSync(process.execPath,script,{stdio:'inherit',timeout:900000});
 const output=v=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'updated='+v+'\n');};
 if(git('status','--porcelain'))throw Error('Refuse an initially dirty checkout');
 git('config','core.autocrlf','false');git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
 for(let attempt=0;attempt<3;attempt++){
   git('fetch','origin','main');
   // This is an isolated Actions checkout, proven clean above. Retry data are disposable.
   git('reset','--hard','origin/main');
   const owners=JSON.parse(fs.readFileSync('routines/owners.json')),r=owners.routines['live-feed-update'];
   if(process.env.ACTIONS_TAKEOVER==='true'&&r.enabled&&r.owner==='chatgpt'){r.previous_run={by:r.last_run_by,at:r.last_run_at};r.owner='github-actions';r.last_run_by=null;r.last_run_at=null;r.notes='GitHub Actions live-maintenance.yml: feed, grading, feedback and Pages deployment. No LLM or local computer required. Other bots skip. Scheduled starts may be delayed by GitHub.';}
   const gate=decide(owners,'live-feed-update','github-actions');
   if(!gate.run){console.log('SKIP: '+gate.reason);output('false');return;}
   const started=Date.now();run(['scripts/live-tick.mjs']);
   checkFresh(JSON.parse(fs.readFileSync('data/live/index.json')).games,started);
   run(['scripts/record-closeout.mjs']);run(['tests/no-instructions.test.mjs']);
   fs.writeFileSync('routines/owners.json',JSON.stringify(stamp(owners,'live-feed-update','github-actions'),null,2)+'\n');
   const tracked=git('diff','--name-only').split('\n').filter(Boolean),untracked=git('ls-files','--others','--exclude-standard').split('\n').filter(Boolean);
   if([...tracked,...untracked].some(p=>!allowed(p)))throw Error('Refuse changes outside public maintenance allowlist');
   git('add','--','data/live','routines/owners.json','data/predictions.json','data/pick-history.json','data/live-record.json','data/learning.json','data/live-feedback.json');
   if(!git('diff','--cached','--name-only')){output('true');return;}
   git('commit','-m','live: scheduled feed, verified grading and feedback refresh');
   try{git('push','origin','HEAD:main');output('true');return;}catch(e){git('fetch','origin','main');if(git('rev-parse','HEAD^')===git('rev-parse','origin/main'))throw Error('Push failed without a main race');console.log('Main advanced; regenerate against the new main.');}
 }
 throw Error('Main advanced on every retry; no stale data overwritten');
}
if(process.argv[1]?.endsWith('actions-maintenance.mjs'))try{main();}catch(e){console.error(e.message?.split('\n')[0]);process.exitCode=1;}

