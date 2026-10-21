// Persistent, ESPN-sourced display identities. Five bounded weekly history requests.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const tours={atp:'tennis/atp',wta:'tennis/wta',pga:'golf/pga',lpga:'golf/lpga',dpwt:'golf/eur'};
export function athletes(board){const out=[];for(const e of board.events||[])for(const c of [...(e.competitions||[]),...(e.groupings||[]).flatMap(g=>g.competitions||[])])for(const p of c.competitors||[])for(const a of [p.athlete,...(p.roster?.athletes||[])].filter(Boolean))if(a.flag?.href&&a.flag?.alt)out.push({displayName:a.displayName,fullName:a.fullName,shortName:a.shortName,flag:{href:a.flag.href,alt:a.flag.alt}});return out;}
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
export async function main(){const file='data/espn/athlete-flags.json',old=read(file)||{},now=Date.now(),at=new Date(now).toISOString(),backfill=!old.backfill_at||now-Date.parse(old.backfill_at)>7*86400000,profiles=new Map((old.profiles||[]).map(p=>[p.league+':'+p.athlete.displayName,p]));let complete=true;const sources=new Set(old.sources||[]);
 for(const [league,route] of Object.entries(tours)){const add=(a,source)=>profiles.set(league+':'+a.displayName,{league,athlete:a,source_url:source});const ix=read('data/espn/index.json');for(const s of ix?.snapshots||[])if(s.league===league){const d=read(s.file);if(d)for(const a of athletes(d))add(a,d.source_url);}
 if(backfill){const date=n=>new Date(n).toISOString().slice(0,10).replaceAll('-',''),url='https://site.api.espn.com/apis/site/v2/sports/'+route+'/scoreboard?dates='+date(now-90*86400000)+'-'+date(now)+'&limit=1000';try{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(r.status);const d=await r.json();if(!Array.isArray(d.events))throw Error('events missing');for(const a of athletes(d))add(a,url);sources.add(url);}catch(e){complete=false;console.error('::warning::Country history '+league+' unavailable; prior identities preserved');}}
 }
 fs.writeFileSync(file,JSON.stringify({schema_version:1,updated_at:at,backfill_at:backfill&&complete?at:old.backfill_at||null,source:'ESPN published athlete country flags; display metadata only',sources:[...sources],profiles:[...profiles.values()].sort((a,b)=>(a.league+a.athlete.displayName).localeCompare(b.league+b.athlete.displayName))},null,1)+'\n');console.log('ESPN country identities: '+profiles.size);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
