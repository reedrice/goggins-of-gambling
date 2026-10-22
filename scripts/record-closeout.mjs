#!/usr/bin/env node
// Read-only sources; prepare public Record data, never push or touch account data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import BP from '../js/bet-progress.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PATHS={NBA:'basketball/nba',WNBA:'basketball/wnba',NHL:'hockey/nhl',NFL:'football/nfl',MLB:'baseball/mlb',NCAAF:'football/college-football',NCAAB:'basketball/mens-college-basketball',WNCAAB:'basketball/womens-college-basketball'};
export function closedDays(games){
 const groups=new Map();
 for(const g of games||[]){const start=Date.parse(g.start_time), day=Number.isFinite(start)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(start)):/\d{4}-\d{2}-\d{2}/.exec(g.slug||'')?.[0];if(day){if(!groups.has(day))groups.set(day,[]);groups.get(day).push(g);}}
 return [...groups].filter(([,rows])=>rows.length&&rows.every(g=>g.status==='final')).map(([day])=>day);
}
export function predictionResult(p,board){
 const match=/^(\d{4}-\d{2}-\d{2})-([a-z0-9]+)-([a-z0-9]+)$/.exec(p.id||'');if(!match)return null;
 const event=BP.findEvent(board,p.sport.toLowerCase()+'-'+match[2]+'-'+match[3]+'-'+match[1]);
 const game=event?.competitions?.[0],status=event?.status||game?.status;
 if(!game||!status?.type?.completed)return null;
 const teams=game.competitors||[];if(teams.length!==2)return null;
 const selected=BP.selectedTeam(teams,{text:p.pick,team:p.pick});if(!selected)return null;
 const scores=teams.map(t=>/^\d+$/.test(String(t.score))?Number(t.score):null);if(scores.some(v=>v===null))return null;
 const own=scores[teams.indexOf(selected)],other=scores[teams.indexOf(selected)===0?1:0];
 // Draw markets require explicit market settlement rather than a guessed push.
 if(own===other)return null;
 return {result:own>other?'win':'loss',final_score:teams.map((t,i)=>t.team.abbreviation+' '+scores[i]).join(' – '),graded_from:'https://www.espn.com/'+p.sport.toLowerCase()+'/game/_/gameId/'+event.id};
}
async function main(){
 const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8'));
 execFileSync(process.execPath,[path.join(ROOT,'scripts/sync-live-feedback.mjs')],{cwd:ROOT,stdio:'inherit',timeout:60000});
 const days=new Set(closedDays(read('data/live/index.json').games));
 if(!days.size){execFileSync(process.execPath,[path.join(ROOT,'scripts/grade-live-alerts.mjs')],{cwd:ROOT,stdio:'inherit',timeout:240000});console.log('Record closeout: waiting for a complete tracked slate.');return;}
 const doc=read('data/predictions.json'),cache=new Map();let changed=0;
 for(const p of doc.predictions||[]){if(p.result!=='pending'||!days.has(p.date)||!PATHS[p.sport])continue;
  const key=p.sport+':'+p.date;if(!cache.has(key)){const url='https://site.api.espn.com/apis/site/v2/sports/'+PATHS[p.sport]+'/scoreboard?dates='+p.date.replaceAll('-','')+'&limit=1000';const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Official scoreboard unavailable: '+p.sport);cache.set(key,await r.json());}
  const grade=predictionResult(p,cache.get(key));if(grade){Object.assign(p,grade,{graded_at:new Date().toISOString()});changed++;}
 }
 if(changed){doc.updated_at=new Date().toISOString();fs.writeFileSync(path.join(ROOT,'data/predictions.json'),JSON.stringify(doc,null,2)+'\n');}
 for(const script of ['capture-closing.mjs','grade-live-alerts.mjs','learn.mjs'])execFileSync(process.execPath,[path.join(ROOT,'scripts',script)],{cwd:ROOT,stdio:'inherit',timeout:240000});
 console.log('Record closeout: '+changed+' official prediction result(s); settled history refreshed. Unsettled markets remain pending.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Record closeout failed: '+e.message);process.exitCode=1;});
