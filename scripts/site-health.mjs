// Native watchdog: diagnose public snapshots and dispatch only the existing gated job.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {shouldTick} from './live-tick.mjs';
const REPO='reedrice/goggins-of-gambling', WORKFLOW='live-maintenance.yml';
export function age(time,now){const t=Date.parse(time);return Number.isFinite(t)&&t<=now+60000?now-t:Infinity;}
export function problems(index,espn,stamp,now=Date.now()){
 const errors=[];
 if(age(stamp,now)>5*60000)errors.push('Public maintenance stamp is older than 5 minutes or invalid');
 if(!Array.isArray(index?.games))errors.push('Live index has no games array');
 else {const stale=index.games.filter(g=>shouldTick({start:g.start_time,status:g.status},now)&&age(g.updated,now)>5*60000);if(stale.length)errors.push(`${stale.length} due games have stale or invalid timestamps`);}
 if(!Array.isArray(espn?.snapshots)||age(espn?.updated_at,now)>5*60000)errors.push('ESPN snapshot index is missing or stale');
 return errors;
}
export function recoveryDecision(runs,now=Date.now(),publicUpdated=null){
 if(runs.some(r=>r.status!=='completed'&&age(r.created_at,now)<35*60000))return 'active';
 if(runs.some(r=>r.event==='workflow_dispatch'&&r.status==='completed'&&r.conclusion!=='success'&&age(r.created_at,now)<60*60000))return 'cooldown';
 const unpublished=runs.find(r=>r.event==='workflow_dispatch'&&r.status==='completed'&&r.conclusion==='success'&&Number.isFinite(publicUpdated)&&Date.parse(r.created_at)>publicUpdated&&age(r.created_at,now)<60*60000);
 if(unpublished)return age(unpublished.updated_at,now)<2*60000?'active':'cooldown';
 return 'dispatch';
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Production main Actions only');
 const owners=JSON.parse(fs.readFileSync('routines/owners.json')),gate=owners.routines['live-feed-update'];
 if(!gate.enabled||gate.owner!=='github-actions'){console.log('Watchdog skipped: feed is not Actions-owned and enabled');return;}
 const api=(endpoint,method)=>JSON.parse(execFileSync('gh',['api',endpoint,...(method?['--method',method]:[])],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'null');
 const read=async file=>{const r=await fetch(`https://reedrice.github.io/goggins-of-gambling/${file}?health=${Date.now()}`,{signal:AbortSignal.timeout(15000),cache:'no-store'});if(!r.ok)throw Error(`${file}: HTTP ${r.status}`);return r.json();};
 let errors=[],publicUpdated=null;
 // Allow a completed Pages deployment time to propagate before declaring failure.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const [index,espn]=await Promise.all(['data/live/index.json','data/espn/index.json'].map(read));
   errors=problems(index,espn,gate.last_run_at);
   const due=(index.games||[]).filter(g=>shouldTick({start:g.start_time,status:g.status},Date.now()));
   publicUpdated=Math.min(Date.parse(espn.updated_at),...due.map(g=>Date.parse(g.updated)));
   // Verify actual served game files too, not just a fresh index or repository stamp.
   const now=Date.now(),sample=(index.games||[]).filter(g=>g.status!=='final'&&Date.parse(g.start_time)<=now&&now-Date.parse(g.start_time)<86400000).sort((a,b)=>String(a.updated).localeCompare(String(b.updated))).slice(0,5);
   await Promise.all(sample.map(async g=>{try{const d=await read(`data/live/${g.slug}.json`);publicUpdated=Math.min(publicUpdated,Date.parse(d.updated));if(d.slug!==g.slug||age(d.updated,now)>5*60000)errors.push(`Public game file stale or mismatched: ${g.slug}`);}catch(e){errors.push(e.message);}}));
  }catch(e){
   errors=[e.message];
  }
  if(!errors.length)break;
  if(attempt<2)await new Promise(r=>setTimeout(r,20000));
 }
 // Public record schemas need not change until official results exist, but must remain readable.
 for(const file of ['data/predictions.json','data/pick-history.json','data/live-record.json','data/live-feedback.json'])try{const data=await read(file);if(!data||typeof data!=='object')errors.push(`${file}: invalid JSON shape`);}catch(e){errors.push(e.message);}
 if(!errors.length){console.log('Healthy: feed, due games, ESPN and public record JSON');if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'healthy=true\n');return;}
 const runs=api(`repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=30`).workflow_runs;
 const decision=recoveryDecision(runs,Date.now(),publicUpdated);
 const report=['## Site health',...errors.map(e=>'- '+e),`Recovery: ${decision}.`].join('\n');
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report+'\n');
 console.log(report);
 if(decision==='active'){console.log('Existing maintenance is active; no duplicate dispatched');return;}
 if(decision==='dispatch'){
  execFileSync('gh',['api',`repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,'--method','POST','-f','ref=main'],{stdio:['ignore','pipe','pipe']});
  console.log('Dispatched the existing maintenance workflow; its completion triggers another health check');
  return;
 }
 throw Error('Still unhealthy during the one-hour recovery cooldown; inspect the Actions summary');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
