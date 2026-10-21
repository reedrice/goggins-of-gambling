#!/usr/bin/env node
// Source-backed replacements for the five former Grok jobs. No model calls.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {decide,stamp} from './routine-gate.mjs';
import {validatePicks,validatePredictionsFile} from './update-picks.mjs';
const req=createRequire(import.meta.url);
const BP=req('../js/bet-progress.js');
export const IDS=['daily-slate-odds-digest','lineup-goalie-check','late-scratch-check','play-money-leaderboard-update','weekly-learning-review'];
export const PATHS={nba:'basketball/nba',nhl:'hockey/nhl',nfl:'football/nfl',mlb:'baseball/mlb'};
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,d)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');};
const run=f=>execFileSync(process.execPath,['scripts/'+f],{stdio:'inherit',timeout:720000});
export function ct(ms){const d=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));const p=Object.fromEntries(d.map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};}
export function slot(id,ms){const c=ct(ms),day=new Date(c.date+'T12:00:00Z'),dow=day.getUTCDay();if(id==='weekly-learning-review'){day.setUTCDate(day.getUTCDate()-dow);if(dow===0&&c.minute<600)day.setUTCDate(day.getUTCDate()-7);return day.toISOString().slice(0,10);}
 const times=id==='daily-slate-odds-digest'?Array.from({length:288},(_,i)=>i*5):id==='lineup-goalie-check'?[720,960]:id==='late-scratch-check'?[1070]:[720,900,1020,1080,1140,1200,1260,1320,1380];const t=times.filter(t=>t<=c.minute).at(-1);return t==null?null:c.date+':'+t;}
export function due(id,last,now){const s=slot(id,now);return !!s&&(!Number.isFinite(Date.parse(last))||slot(id,Date.parse(last))!==s);}
export function weeklyReport(d,at){return {schema_version:1,updated_at:at,source:'data/learning.json',sample:d.sample,calibration:d.calibration,clv:d.clv,categories:d.categories,best:d.best,worst:d.worst,note:'Measured results only. Groups below 30 graded picks are still collecting data. No automatic strategy changes or AI review.'};}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source HTTP '+r.status);return r.json();}
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function injuryNotes(summary,names){const found=[];for(const t of summary.injuries||[])for(const a of t.injuries||[]){const name=a.athlete?.displayName,status=a.status;if(name&&typeof status==='string'&&names.some(n=>normalize(n)===normalize(name))&&/^(out|doubtful|questionable|day-to-day|suspension|injured reserve)$/i.test(status))found.push({name,status});}return found;}
async function lineups(id,now){const picks=read('data/picks.json'),day=ct(now).date,boards=new Map(),rows=[];let changed=false;
 for(const list of Object.values(picks.sections))for(const p of list||[]){if(!p.start_time||Date.parse(p.start_time)<=now||ct(Date.parse(p.start_time)).date!==day)continue;
  const legs=p.legs?.length?p.legs:[p];for(const l of legs){const mid=l.market_id||p.market_id,slug=/(nba|nhl|nfl|mlb)-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}/.exec(mid||'')?.[0];if(!slug)continue;const league=slug.split('-')[0];if(!PATHS[league])continue;
   const snapshotFile='data/espn/'+league+'-'+day+'.json',snapshot=fs.existsSync(snapshotFile)?read(snapshotFile):null;const url='https://site.api.espn.com/apis/site/v2/sports/'+PATHS[league]+'/scoreboard?dates='+day.replaceAll('-','')+'&limit=1000';if(!boards.has(url))boards.set(url,snapshot&&Date.parse(snapshot.fetched_at)>=now-20*60000?snapshot:await get(url));const ev=BP.findEvent(boards.get(url),slug);if(!ev){rows.push({pick_id:p.id,market_id:mid,status:'unverified',reason:'No unambiguous ESPN fixture'});continue;}
   const source='https://site.api.espn.com/apis/site/v2/sports/'+PATHS[league]+'/summary?event='+ev.id,names=[l.player||p.player].filter(n=>typeof n==='string');
   const detail=snapshot?.events?.find(x=>String(x.id)===String(ev.id));
   const fresh=detail?.details_checked_at&&Date.parse(detail.details_checked_at)>=now-20*60000;
   const news=fresh?detail.injuries.filter(x=>names.some(n=>normalize(n)===normalize(x.player))&&/^(out|doubtful|questionable|day-to-day|suspension|injured reserve)$/i.test(x.status)).map(x=>({name:x.player,status:x.status})):[];
   const confirmed=fresh?detail.starters.filter(x=>names.some(n=>normalize(n)===normalize(x.player))):[];
   rows.push({pick_id:p.id,market_id:mid,source,checked_at:new Date(now).toISOString(),status:news.length?'reported_injury':confirmed.length?'confirmed_starter':'unverified',injuries:news,starters:confirmed,probables:fresh?detail.probables:[],reason:news.length?'Exact player-name match in ESPN injury report':confirmed.length?'Exact player name and explicit ESPN starter flag':'No verified starter/goalie or inactive confirmation; absence from an injury list is not confirmation'});
   if(news.length){const note={status:news.some(x=>/^out|injured reserve|suspension$/i.test(x.status))?'out':'at_risk',text:news.map(x=>x.name+': '+x.status).join('; ').slice(0,240),source:'ESPN injury report',source_url:source,checked_at:new Date(now).toISOString()};p.lineup_note=note;p.pending_news='ESPN reports a player availability concern.';changed=true;}
   else if(confirmed.length){p.lineup_note={status:'confirmed',text:confirmed.map(x=>x.player+': ESPN lists as starter').join('; ').slice(0,240),source:'ESPN explicit starter flag',source_url:source,checked_at:new Date(now).toISOString()};changed=true;}
  }
 }
 if(changed){picks.updated_at=new Date(now).toISOString();const errors=validatePicks(picks);if(errors.length)throw Error(errors.join('; '));write('data/picks.json',picks);}
 write('data/routines/'+id+'.json',{schema_version:1,updated_at:new Date(now).toISOString(),source:'data/espn snapshots from ESPN JSON',coverage:'Published injury reports and explicit starter flags only. Probable goalies remain probable. Hockey line combinations and unsupported status feeds remain unavailable. Unverified never means confirmed.',checks:rows});
}
export function eligible(m,side){return !(m.type==='prop'&&side==='no')&&['moneyline','total','spread','prop'].includes(m.type)&&!/(first|half|quarter|period|inning)/i.test(m.smt||'')&&m[side+'_buyable']!==false&&Number.isFinite(side==='yes'?m.yes_ask:m.no_cost)&&(side==='yes'?m.yes_ask:m.no_cost)>=5&&(side==='yes'?m.yes_ask:m.no_cost)<=95;}
export function selectMarkets(markets){const valid=markets.filter(m=>eligible(m,'yes')||eligible(m,'no'));return [...['moneyline','total','spread'].flatMap(t=>valid.filter(m=>m.type===t).sort((a,b)=>Math.abs(a.yes_ask-50)-Math.abs(b.yes_ask-50)).slice(0,3)),...valid.filter(m=>m.type==='prop'&&m.yes_ask>=35&&m.yes_ask<=70).slice(0,18)];}
export function manualGame(old,slug,day){return Object.entries(old.sections).some(([sec,list])=>sec!=='predictions'&&list.some(p=>(p.slate_date||old.slate_date)===day&&p.generated_by!=='github-actions'&&[p,...(p.legs||[])].some(l=>String(l.market_id||'').includes(slug))));}
export function selectCandidates(candidates){const seen=new Set(),out=[];let lines=0,props=0;for(const p of [...candidates].sort((a,b)=>b.edge-a.edge)){if(seen.has(p.market_id)||(p.player?props>=6:lines>=3))continue;seen.add(p.market_id);out.push(p);if(p.player)props++;else lines++;}return out;}
async function digest(now){
 // Settle/archive outgoing entries before replacing their daily display.
 run('capture-closing.mjs');run('fetch-markets.mjs');
 const idx=read('data/markets/index.json'),day=ct(now).date,old=read('data/picks.json'),preds=read('data/predictions.json');
 if(Date.parse(idx.updated_at)<now-60000)throw Error('Market discovery did not refresh');
 globalThis.Viz=req('../js/viz.js');globalThis.Vegas=req('../js/vegas.js');
 // Old manually imported book quotes are not evidence for today's prices.
 globalThis.Vegas.set([]);const OC=req('../js/our-chance.js');
 const sections={predictions:[],singles:[],props:[],parlays:[],longshots:[],lottery:[],nonsports:[]},games=[];
 for(const e of idx.events){const league=e.league||e.slug.split('-')[0];if(!req('../js/markets-core.js').LEAGUES[league]||Date.parse(e.start_time)<=now||ct(Date.parse(e.start_time)).date!==day)continue;
  const event=read('data/markets/events/'+e.slug+'.json');if(Date.parse(event.updated_at)<now-60000)throw Error('Stale event snapshot '+e.slug);
  const candidates=[];
  // Bound history requests; three nearest even-priced lines per market type, plus up to eighteen prop bets.
  const selected=selectMarkets(event.markets);let missingEvidence=0,belowEdge=0;
  for(const m of selected)for(const side of ['yes','no']){if(!eligible(m,side))continue;const price=side==='yes'?m.yes_ask:m.no_cost,text=m.type==='prop'?m.label:side==='yes'?m.side_yes_label:m.side_no_label;
   const est=await OC.estimate({marketId:m.id,side,market:price,text,question:m.label,player:m.player});if(!est||est.r?.parts?.stats==null){missingEvidence++;continue;}
   const edge=est.pct-price;if(m.type==='moneyline'&&est.pct>=50){const match=/^[^-]+-([^-]+)-([^-]+)-(\d{4}-\d{2}-\d{2})$/.exec(e.slug),team=side==='yes'?m.yes_team:m.no_team;if(match&&team){const p={id:day+'-'+match[1]+'-'+match[2],date:day,sport:league.toUpperCase(),game:e.title,pick:team.toUpperCase(),win_prob:est.pct,result:'pending',start_time:e.start_time,reasoning:est.line,source:'Rules-based Analytics from ESPN history and current Polymarket US',created_at:new Date(now).toISOString()};if(!preds.predictions.some(x=>x.id===p.id))preds.predictions.push(p);if(!sections.predictions.some(x=>x.id===p.id))sections.predictions.push(p);}}
   // NHL point/assist prop bets require fresh no-vig books, not available in this job.
   if(edge<2||m.type==='prop'&&edge<3||league==='nhl'&&m.type==='prop'&&/point|assist/i.test(m.label))continue;
   candidates.push({id:'auto-'+day+'-'+m.id+'-'+side,slate_date:day,sport:e.sport||league.toUpperCase(),event:e.title,platform:'Polymarket US',action:'wait',start_time:e.start_time,link:e.url,polymarket_url:e.url,market:m.type==='moneyline'?'Who wins':m.label,side:m.type==='moneyline'?text+' to win':text,price,fair:est.pct,edge,stake_units:0,hit_prob:est.pct,our_chance:est.pct,market_chance:price,our_chance_why:est.line,market_id:m.id,market_side:side,player:m.player||undefined,team:{league,abbr:(side==='yes'?m.yes_team:m.no_team)||m.team},reasoning:est.line+'. Rules-based comparison; lineup and goalie confirmations are unverified.',pending_news:'Starter and injury context unverified',generated_by:'github-actions'});
  }
  // One market per game avoids contradictory same-game suggestions. No automatic combos.
  const chosen=manualGame(old,e.slug,day)?[]:selectCandidates(candidates);for(const p of chosen)sections[p.player?'props':'singles'].push(p);games.push({slug:e.slug,sport:e.sport,start_time:e.start_time,qualified:chosen.length>0,published:chosen.length,evaluated:selected.length,missing_evidence:missingEvidence});
 }
 // Keep future entries and today's human-authored entries; never duplicate an existing market/side.
 for(const [sec,list] of Object.entries(old.sections))if(sec!=='predictions')for(const p of list){if((p.slate_date||old.slate_date)>day||(p.slate_date||old.slate_date)===day&&p.generated_by!=='github-actions'){sections[sec]=sections[sec].filter(x=>x.market_id!==p.market_id||x.market_side!==p.market_side);sections[sec].push(p);}}
 const doc={schema_version:1,slate_date:day,updated_at:new Date(now).toISOString(),notes:['Rules-based daily slate: exchange asks and the existing ESPN-history Analytics model. No AI calls.','ESPN availability coverage varies; missing starter/goalie confirmations stay unverified. No fresh sportsbook or social scraping.','Up to three qualifying game lines and six player prop bets per game. Unsupported historical models remain unqualified; no automatic combos or invented projections.'],sections};
 const errors=[...validatePicks(doc),...validatePredictionsFile(preds)];if(errors.length)throw Error(errors.join('; '));write('data/picks.json',doc);write('data/predictions.json',preds);
 write('data/routines/daily-slate-odds-digest.json',{schema_version:1,updated_at:new Date(now).toISOString(),date:day,games,coverage:doc.notes,counts:{game_lines:sections.singles.length,prop_bets:sections.props.length}});
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='reedrice/goggins-of-gambling'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Production GitHub Actions only');
 let owners=read('routines/owners.json');const now=Date.now(),take=process.env.ACTIONS_ROUTINES_TAKEOVER==='true';
 for(const id of IDS){let r=owners.routines[id];if(take&&r.owner==='grok'&&r.enabled){r.previous_run={by:r.last_run_by,at:r.last_run_at};r.owner='github-actions';r.last_run_by=null;r.last_run_at=null;r.notes='Rules-based GitHub Actions replacement; see routines/ACTIONS.md. No scheduled AI or private messages.';}
  if(!decide(owners,id,'github-actions').run||!take&&!due(id,r.last_run_at,now))continue;
  if(id==='daily-slate-odds-digest')await digest(now);
  else if(id==='lineup-goalie-check'||id==='late-scratch-check')await lineups(id,now);
  else if(id==='play-money-leaderboard-update'){run('capture-closing.mjs');run('play-leaderboard.mjs');run('grade-live-alerts.mjs');run('learn.mjs');}
  else {run('capture-closing.mjs');run('learn.mjs');write('data/routines/weekly-learning-review.json',weeklyReport(read('data/learning.json'),new Date(now).toISOString()));}
  owners=stamp(owners,id,'github-actions',new Date().toISOString());console.log('Completed '+id);
 }
 write('routines/owners.json',owners);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error('Scheduled routines: '+e.message.split('\n')[0]);process.exitCode=1;});
