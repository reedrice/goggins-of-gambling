// Participation screen, not a fair-probability model. Reads existing ESPN snapshots only.
import fs from 'node:fs';
export const BASKETBALL = {nba:48,wnba:40,cbb:40,ncaab:40,wcbb:40,ncaaw:40};
const leagueFile = {ncaab:'cbb',ncaaw:'wcbb'};
const nameKey = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function playerUsage(summary) {
  const rows=[];
  for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]) {
    const index=(group.names||group.labels||[]).findIndex(x=>/^(minutes|min)$/i.test(x));
    if(index<0)continue;
    for(const row of group.athletes||[]) {
      const raw=String(row.stats?.[index]??'');
      const minutes=/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):/^\d+:\d{2}$/.test(raw)?Number(raw.split(':')[0])+Number(raw.split(':')[1])/60:null;
      if(!row.athlete?.displayName)continue;
      rows.push({athlete_id:row.athlete.id||null,player:row.athlete.displayName,team_id:team.team?.id||null,
        minutes,did_not_play:row.didNotPlay===true,ejected:row.ejected===true,evidence:'boxscore.players.statistics.athletes'});
    }
  }
  return rows;
}
export function loadUsage(slug,eventId,dir='data/espn') {
  const league=slug.split('-')[0];if(!BASKETBALL[league]||!eventId)return null;
  // Chicago/UTC date boundaries: bounded local-file reads, no extra requests.
  const date=slug.match(/\d{4}-\d{2}-\d{2}$/)?.[0];if(!date)return null;
  const matches=[];
  for(const delta of [-1,0,1]) {
    const day=new Date(Date.parse(date+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10);
    try{const doc=JSON.parse(fs.readFileSync(`${dir}/${leagueFile[league]||league}-${day}.json`,'utf8'));
      for(const e of doc.events||[])if(String(e.id)===String(eventId))matches.push(e);
    }catch{/* Missing evidence is withheld below. */}
  }
  return matches.sort((a,b)=>Date.parse(b.details_checked_at)-Date.parse(a.details_checked_at))[0]||null;
}
export function participation(league,market,ctx,nowIso) {
  if((market.group|| (market.kind==='Player prop'?'prop':'game'))!=='prop'||!BASKETBALL[league])return null;
  const base={version:1,eligible:false,rule:'basketball-observed-minutes',league};
  const fail=reason=>({...base,reason});
  const e=ctx?.player_usage_event;
  if(!ctx?.available||!e||String(e.id)!==String(ctx.event_id))return fail('Player participation unavailable');
  const age=Date.parse(nowIso)-Date.parse(e.details_checked_at);
  if(!Number.isFinite(age)||age< -60000||age>10*60000)return fail('Player participation stale');
  const st=e.status||e.competitions?.[0]?.status||{},p=Number(st.period),clock=String(st.displayClock||'');
  const quarters=!['cbb','ncaab'].includes(league),length=quarters?BASKETBALL[league]/4:20,count=quarters?4:2;
  if(st.type?.state!=='in'||!Number.isInteger(p)||p<1||p>count||!/^\d+:\d{2}$/.test(clock))return fail('Live regulation participation not verified');
  const [m,s]=clock.split(':').map(Number),left=m+s/60;
  if(s>=60||left>length)return fail('Game clock not verified');
  const elapsed=(p-1)*length+length-left;
  if(elapsed<8)return fail('Too early to establish playing time');
  const teams=new Set([ctx.home?.id,ctx.away?.id].filter(Boolean).map(String));
  const rows=(e.player_usage||[]).filter(r=>nameKey(r.player)===nameKey(market.player)&&teams.has(String(r.team_id)));
  if(rows.length!==1)return fail('Player identity or participation not uniquely verified');
  const r=rows[0];
  if(r.did_not_play||r.ejected||!Number.isFinite(r.minutes)||r.minutes<3||r.minutes>elapsed+1)return fail('Insufficient verified playing time');
  // Require an observed share equivalent to 18 NBA / 15 other basketball minutes.
  // This is a conservative screening threshold, never a forecast of future minutes.
  const share=r.minutes/elapsed,minimum=league==='nba'?18:15;
  const evidence={...base,athlete_id:r.athlete_id,source_url:e.details_source_url,checked_at:e.details_checked_at,
    minutes:r.minutes,elapsed_minutes:+elapsed.toFixed(2),observed_share:+share.toFixed(3)};
  return {...evidence,eligible:share>=minimum/BASKETBALL[league],reason:share>=minimum/BASKETBALL[league]?null:'Limited observed playing time'};
}
