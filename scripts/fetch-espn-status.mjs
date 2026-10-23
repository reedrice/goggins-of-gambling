#!/usr/bin/env node
// Public ESPN JSON -> sourced sports-status snapshots. No scraping, keys or AI.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ct} from './scheduled-routines.mjs';
import {playerUsage} from './live-prop-quality.mjs';
import {boxPlayers,historyGame} from './nba-prop-model.mjs';
export const LEAGUES={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball',wcbb:'basketball/womens-college-basketball',mlb:'baseball/mlb',nhl:'hockey/nhl',epl:'soccer/eng.1',ucl:'soccer/uefa.champions',uel:'soccer/uefa.europa',uecl:'soccer/uefa.europa.conf',lal:'soccer/esp.1',sea:'soccer/ita.1',bun:'soccer/ger.1',fl1:'soccer/fra.1',mls:'soccer/usa.1',lmx:'soccer/mex.1',eflch:'soccer/eng.2',atp:'tennis/atp',wta:'tennis/wta',pga:'golf/pga',lpga:'golf/lpga',dpwt:'golf/eur'};
export const BASE='https://site.api.espn.com/apis/site/v2/sports/';
export function athleteIdentity(a){return {id:a.id,displayName:a.displayName,shortName:a.shortName,fullName:a.fullName,flag:a.flag?.href&&a.flag?.alt?{href:a.flag.href,alt:a.flag.alt}:undefined};}
const write=(f,d)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+'\n');};
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
export function fixtures(board){return (board.events||[]).flatMap(e=>e.groupings?.length?e.groupings.flatMap(g=>(g.competitions||[]).map(c=>({id:c.id,name:c.name||e.name,date:c.date||c.startDate||e.date,status:c.status,major:e.major,competitions:[c],tournament:e.name}))):[e]);}
export function details(summary,competition={},sport=''){
 const injuries=(summary.injuries||[]).flatMap(t=>(t.injuries||[]).map(i=>({team:t.team?.abbreviation||null,player:i.athlete?.displayName||null,position:i.athlete?.position?.abbreviation||null,status:typeof i.status==='string'?i.status:i.type?.description||null}))).filter(i=>i.player&&i.status);
 const starters=[];
 const add=(x,team,section)=>{const a=x.athlete||x;if(x.starter!==true||!a.displayName)return;starters.push({player:a.displayName,athlete_id:a.id||null,team:team?.abbreviation||null,position:a.position?.abbreviation||x.position?.abbreviation||null,evidence:section+'.starter=true'});};
 for(const r of summary.rosters||[])for(const x of r.roster||[])add(x,r.team,'rosters.roster');
 for(const t of summary.boxscore?.players||[])for(const s of t.statistics||[])for(const a of s.athletes||[])add(a,t.team,'boxscore.players.statistics.athletes');
 const unique=[...new Map(starters.map(s=>[(s.athlete_id||s.player)+'|'+s.team,s])).values()];
 const probable=(competition.competitors||[]).flatMap(c=>(c.probables||[]).map(p=>({player:p.athlete?.displayName||null,position:p.athlete?.position?.abbreviation||p.name||null,team:c.team?.abbreviation||null,status:'probable',confirmed:false}))).filter(x=>x.player);
 return {nba_players:sport==='nba'?boxPlayers(summary):undefined,player_usage:playerUsage(summary),injuries,starters:unique,starting_goalies:sport==='nhl'?unique.filter(s=>s.position==='G'):[],probables:probable,book_lines:(competition.odds||[]).filter(Boolean).map(o=>({provider:o.provider?.name||null,details:o.details||null,spread:o.spread??null,total:o.overUnder??null})),coverage:{injuries:summary.injuries?'published_report':'unavailable',starters:unique.length?'explicit_starter_flags':'unverified',goalies:sport==='nhl'&&unique.some(s=>s.position==='G')?'explicit_starter_flag':'unverified',hockey_lines:'unavailable',note:'No inferred starters, depth-chart promotions, probable-to-confirmed conversions or hockey line combinations. Tennis/golf do not have team starting lineups.'}};
}
// Reuse already-budgeted summaries for private progress; no additional requests.
export function progressBoxscore(summary){
 return {players:(summary?.boxscore?.players||[]).map(t=>({team:{abbreviation:t.team?.abbreviation},statistics:(t.statistics||[]).map(g=>({name:g.name,displayName:g.displayName,keys:g.keys,names:g.names,athletes:(g.athletes||[]).map(a=>({athlete:{displayName:a.athlete?.displayName},didNotPlay:a.didNotPlay,stats:a.stats}))}))}))};
}
export function normalizeFixture(e,league,source,at,summary=null,summarySource=null){const c=e.competitions?.[0]||{},d=details(summary||{},c,league);return {id:e.id,name:e.name||e.shortName||null,date:e.date||c.date||null,status:e.status||c.status||null,major:e.major,tournament:e.tournament,boxscore:summary?progressBoxscore(summary):undefined,competitions:[{id:c.id||e.id,date:c.date||e.date||null,status:c.status||e.status||null,round:c.round,wasSuspended:c.wasSuspended,...(league==='cfb'?{conferenceCompetition:typeof c.conferenceCompetition==='boolean'?c.conferenceCompetition:undefined,groups:c.groups?.isConference?{id:c.groups.id,name:c.groups.name,shortName:c.groups.shortName,isConference:true}:undefined}:{}),competitors:(c.competitors||[]).map(x=>({id:x.id,homeAway:x.homeAway,score:x.score,linescores:x.linescores,...(league==='cfb'?{curatedRank:Number.isInteger(x.curatedRank?.current)&&x.curatedRank.current>=1&&x.curatedRank.current<=25?{current:x.curatedRank.current}:undefined}:{}),team:x.team?{id:x.team.id,abbreviation:x.team.abbreviation,displayName:x.team.displayName,name:x.team.name,shortDisplayName:x.team.shortDisplayName,logo:x.team.logo,logos:x.team.logos}:undefined,athlete:x.athlete?athleteIdentity(x.athlete):undefined,roster:x.roster?{displayName:x.roster.displayName,athletes:(x.roster.athletes||[]).map(athleteIdentity)}:undefined}))}],...d,source_url:source,fetched_at:at,details_source_url:summarySource,details_checked_at:summary?at:null,details_available:!!summary};}
async function get(url){const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!d||typeof d!=='object')throw Error('Invalid JSON');return d;}
export async function pool(items,n,job){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const item=items[i++];await job(item);}}));}
// NBA testing history uses this existing collector, with eight extra bounded summaries per run.
export async function refreshNbaHistory(){
 const file='data/espn/nba-player-history.json',now=Date.now(),at=new Date(now).toISOString(),doc=read(file)||{schema_version:1,games:[],catalog:[],attempts:{}};
 doc.team_checks=doc.team_checks||{};doc.catalog_sources=doc.catalog_sources||[];
 if(!doc.teams||!doc.teams_checked_at||now-Date.parse(doc.teams_checked_at)>86400000){try{const list=await get(BASE+'basketball/nba/teams?limit=100');doc.teams=(list.sports?.[0]?.leagues?.[0]?.teams||[]).map(t=>String(t.team.id));doc.teams_checked_at=at;}catch(e){doc.catalog_error=e.message;}}
 const due=(doc.teams||[]).filter(id=>!doc.team_checks[id]||now-Date.parse(doc.team_checks[id])>86400000).slice(0,2);
 for(const id of due){try{
  const url='https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/teams/'+id+'/schedule',current=await get(url),year=Number(current.season?.year);
  const boards=[current];doc.catalog_sources.push(url);if(year){boards.push(await get(url+'?season='+(year-1)));doc.catalog_sources.push(url+'?season='+(year-1));}
  const events=boards.flatMap(b=>b.events||[]).filter(e=>Number(e.seasonType?.type||e.season?.type)===2&&(e.status||e.competitions?.[0]?.status)?.type?.completed&&now-Date.parse(e.date)<365*86400000).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,25).map(e=>({id:String(e.id),date:e.date}));
  doc.catalog=[...new Map([...doc.catalog,...events].map(e=>[e.id,e])).values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,400);doc.team_checks[id]=at;doc.catalog_error=null;
 }catch(e){doc.catalog_error=e.message;}}
 doc.catalog_sources=[...new Set(doc.catalog_sources)].slice(-60);doc.catalog_checked_at=at;
 const have=new Set(doc.games.map(g=>g.id)),pending=doc.catalog.filter(e=>!have.has(e.id)&&(!doc.attempts[e.id]||now-Date.parse(doc.attempts[e.id])>21600000)).slice(0,8);let requests=0;
 await pool(pending,2,async e=>{requests++;doc.attempts[e.id]=at;const source=BASE+'basketball/nba/summary?event='+e.id;try{const row=historyGame(await get(source),e.id,at,source);if(row){doc.games.push(row);delete doc.attempts[e.id];}}catch{/* Preserve prior completed history and retry at the next bounded opportunity. */}});
 doc.games=doc.games.filter(g=>now-Date.parse(g.date)<365*86400000).sort((a,b)=>b.date.localeCompare(a.date));doc.refreshed_at=at;doc.summary_budget=8;doc.summary_requests=requests;doc.coverage='Partial regular-season boxscores, bounded two-team schedules per run and newest400 catalog entries within365days; no inferred positions or roles.';write(file,doc);
 console.log('NBA player history: '+doc.games.length+' verified games; '+requests+' bounded summaries.');
}
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
 manifest.snapshots.sort((a,b)=>(a.league+a.date).localeCompare(b.league+b.date));manifest.summary_requests=32-remaining;manifest.partial=success!==jobs.length;write('data/espn/index.json',manifest);console.log('ESPN status: '+success+'/'+jobs.length+' scoreboard snapshots; '+manifest.summary_requests+' bounded event summaries.');if(!success)throw Error('All ESPN scoreboards unavailable');await (await import('./espn-history.mjs')).refreshHistory();await refreshNbaHistory();
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)(process.argv.includes('--nba-history-only')?refreshNbaHistory():main()).catch(e=>{console.error('ESPN status: '+e.message);process.exitCode=1;});

