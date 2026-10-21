#!/usr/bin/env node
// Public ESPN JSON -> sourced sports-status snapshots. No scraping, keys or AI.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ct} from './scheduled-routines.mjs';
export const LEAGUES={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball',wcbb:'basketball/womens-college-basketball',mlb:'baseball/mlb',nhl:'hockey/nhl',epl:'soccer/eng.1',ucl:'soccer/uefa.champions',uel:'soccer/uefa.europa',uecl:'soccer/uefa.europa.conf',lal:'soccer/esp.1',sea:'soccer/ita.1',bun:'soccer/ger.1',fl1:'soccer/fra.1',mls:'soccer/usa.1',lmx:'soccer/mex.1',eflch:'soccer/eng.2',atp:'tennis/atp',wta:'tennis/wta',pga:'golf/pga',lpga:'golf/lpga',dpwt:'golf/eur'};
export const BASE='https://site.api.espn.com/apis/site/v2/sports/';
const write=(f,d)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');};
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
export function fixtures(board){return (board.events||[]).flatMap(e=>e.groupings?.length?e.groupings.flatMap(g=>(g.competitions||[]).map(c=>({id:c.id,name:c.name||e.name,date:c.date||c.startDate||e.date,status:c.status,competitions:[c],tournament:e.name}))):[e]);}
export function details(summary,competition={},sport=''){
 const injuries=(summary.injuries||[]).flatMap(t=>(t.injuries||[]).map(i=>({team:t.team?.abbreviation||null,player:i.athlete?.displayName||null,position:i.athlete?.position?.abbreviation||null,status:typeof i.status==='string'?i.status:i.type?.description||null}))).filter(i=>i.player&&i.status);
 const starters=[];
 const add=(x,team,section)=>{const a=x.athlete||x;if(x.starter!==true||!a.displayName)return;starters.push({player:a.displayName,athlete_id:a.id||null,team:team?.abbreviation||null,position:a.position?.abbreviation||x.position?.abbreviation||null,evidence:section+'.starter=true'});};
 for(const r of summary.rosters||[])for(const x of r.roster||[])add(x,r.team,'rosters.roster');
 for(const t of summary.boxscore?.players||[])for(const s of t.statistics||[])for(const a of s.athletes||[])add(a,t.team,'boxscore.players.statistics.athletes');
 const unique=[...new Map(starters.map(s=>[(s.athlete_id||s.player)+'|'+s.team,s])).values()];
 const probable=(competition.competitors||[]).flatMap(c=>(c.probables||[]).map(p=>({player:p.athlete?.displayName||null,position:p.athlete?.position?.abbreviation||p.name||null,team:c.team?.abbreviation||null,status:'probable',confirmed:false}))).filter(x=>x.player);
 return {injuries,starters:unique,starting_goalies:sport==='nhl'?unique.filter(s=>s.position==='G'):[],probables:probable,book_lines:(competition.odds||[]).filter(Boolean).map(o=>({provider:o.provider?.name||null,details:o.details||null,spread:o.spread??null,total:o.overUnder??null})),coverage:{injuries:summary.injuries?'published_report':'unavailable',starters:unique.length?'explicit_starter_flags':'unverified',goalies:sport==='nhl'&&unique.some(s=>s.position==='G')?'explicit_starter_flag':'unverified',hockey_lines:'unavailable',note:'No inferred starters, depth-chart promotions, probable-to-confirmed conversions or hockey line combinations. Tennis/golf do not have team starting lineups.'}};
}
export function normalizeFixture(e,league,source,at,summary=null,summarySource=null){const c=e.competitions?.[0]||{},d=details(summary||{},c,league);return {id:e.id,name:e.name||e.shortName||null,date:e.date||c.date||null,status:e.status||c.status||null,competitions:[{id:c.id||e.id,date:c.date||e.date||null,status:c.status||e.status||null,competitors:(c.competitors||[]).map(x=>({id:x.id,homeAway:x.homeAway,score:x.score,linescores:x.linescores,team:x.team?{id:x.team.id,abbreviation:x.team.abbreviation,displayName:x.team.displayName}:undefined,athlete:x.athlete?{id:x.athlete.id,displayName:x.athlete.displayName}:undefined}))}],...d,source_url:source,fetched_at:at,details_source_url:summarySource,details_checked_at:summary?at:null,details_available:!!summary};}
async function get(url){const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!d||typeof d!=='object')throw Error('Invalid JSON');return d;}
export async function pool(items,n,job){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const item=items[i++];await job(item);}}));}
async function main(){const now=Date.now(),at=new Date(now).toISOString(),today=ct(now).date,tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),manifest={schema_version:1,updated_at:at,source:'ESPN public JSON endpoints',date_basis:'America/Chicago; queries also include adjacent UTC date',coverage:'Published data only; availability varies by league. Missing starter, goalie or hockey-line evidence remains unverified. No private data or AI.',summary_budget:32,snapshots:[]};let remaining=32;
 const jobs=Object.entries(LEAGUES).flatMap(([league,route])=>[today,tomorrow].map(date=>({league,route,date})));let success=0;
 await pool(jobs,4,async({league,route,date})=>{const file='data/espn/'+league+'-'+date+'.json',source=BASE+route+'/scoreboard?dates='+date.replaceAll('-','')+'&limit=1000'+(league==='cfb'?'&groups=80':/^(cbb|wcbb)$/.test(league)?'&groups=50':''),old=read(file);
  try{const raw=await get(source);if(!Array.isArray(raw.events))throw Error('Missing events array');write('.cache/espn/'+league+'-'+date+'.json',raw);const rows=[];
   for(const e of fixtures(raw)){let summary=null,summarySource=null;const c=e.competitions?.[0]||{},status=e.status||c.status,starts=Date.parse(e.date||c.date),teamSport=!route.startsWith('tennis/')&&!route.startsWith('golf/');
    // Detail queries only for current or next-24-hour games; never one request per athlete.
    if(teamSport&&e.id&&status?.type?.state!=='post'&&(status?.type?.state==='in'||Number.isFinite(starts)&&starts>=now-6*3600000&&starts<=now+24*3600000)&&remaining>0){remaining--;summarySource=BASE+route+'/summary?event='+encodeURIComponent(e.id);try{summary=await get(summarySource);}catch{summarySource=null;}}
    rows.push(normalizeFixture(e,league,source,at,summary,summarySource));
   }
   const doc={schema_version:1,league,query_date:date,source_url:source,fetched_at:at,events:rows};write(file,doc);success++;manifest.snapshots.push({league,date,file,available:true,fetched_at:at,events:rows.length,details:rows.filter(x=>x.details_available).length});
  }catch(e){manifest.snapshots.push({league,date,file,available:false,last_success_at:old?.fetched_at||null,error:e.message});console.error('::warning::ESPN '+league+' '+date+' unavailable; prior snapshot preserved.');}
 });
 manifest.snapshots.sort((a,b)=>(a.league+a.date).localeCompare(b.league+b.date));manifest.summary_requests=32-remaining;manifest.partial=success!==jobs.length;write('data/espn/index.json',manifest);console.log('ESPN status: '+success+'/'+jobs.length+' scoreboard snapshots; '+manifest.summary_requests+' bounded event summaries.');if(!success)throw Error('All ESPN scoreboards unavailable');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error('ESPN status: '+e.message);process.exitCode=1;});
