// Experimental stat-specific model. No market prices, requests or automatic tuning.
export const STATS=['pts','reb','ast','threes','stl','blk'];
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const number=s=>/^\d+(?:\.\d+)?$/.test(String(s??''))?Number(s):null;
export const position=s=>/G/.test(s)&&!/F/.test(s)?'G':s==='C'?'C':/F/.test(s)?'F':null;
export function boxPlayers(summary){
 const rows=[];
 for(const team of summary.boxscore?.players||[])for(const group of team.statistics||[]){
  const keys=(group.names||group.labels||[]).map(norm);
  const val=(a,aliases,part=null)=>{const i=keys.findIndex(k=>aliases.includes(k));if(i<0)return null;let x=a.stats?.[i];if(part!==null)x=String(x||'').split('-')[part];return number(x);};
  for(const a of group.athletes||[]){const athlete=a.athlete||{},i=keys.findIndex(k=>['min','minutes'].includes(k)),raw=String(a.stats?.[i]??'');
   const minutes=/^\d+:\d{2}$/.test(raw)?Number(raw.split(':')[0])+Number(raw.split(':')[1])/60:number(raw);
   if(!athlete.id||!athlete.displayName)continue;
   rows.push({athlete_id:String(athlete.id),player:athlete.displayName,team_id:String(team.team?.id||''),position:position(athlete.position?.abbreviation||''),starter:typeof a.starter==='boolean'?a.starter:null,
    minutes,dnp:a.didNotPlay===true,ejected:a.ejected===true,pts:val(a,['pts','points']),reb:val(a,['reb','rebounds','totalrebounds']),ast:val(a,['ast','assists']),stl:val(a,['stl','steals']),blk:val(a,['blk','blocks']),
    threes:val(a,['3pt','threepointfieldgoalsmadethreepointfieldgoalsattempted'],0),fga:val(a,['fg','fieldgoalsmadefieldgoalsattempted'],1),tpa:val(a,['3pt','threepointfieldgoalsmadethreepointfieldgoalsattempted'],1),pf:val(a,['pf','fouls','personalfouls'])});
  }
 }
 return rows;
}
export function historyGame(summary,id,at,source){
 const c=summary.header?.competitions?.[0],season=summary.header?.season;
 if(!c?.status?.type?.completed||c.status.type.state!=='post'||Number(season?.type)!==2||Date.parse(c.date)>=Date.parse(at))return null;
 const players=boxPlayers(summary);if(!players.length)return null;
 return {id:String(id),date:c.date,season:season.year,season_type:2,recorded_at:at,source_url:source,players};
}
export function contract(m){
 if(m.period!=='full_game'||!m.player||/\b(?:first|second|third|fourth|1st|2nd|3rd|4th)\s+(?:half|quarter)\b|\bQ[1-4]\b/i.test(m.question||''))return null;
 const text=String(m.question||m.sides?.[0]||'').replace(/^(?:Yes: |Will )/i,'');
 const match=/^(.+?) (?:record|score|have|make|get)( at least)? (\d+)(\+)?(?: total)? (three-point field goals made|points|rebounds|assists|steals|blocks)\b/i.exec(text);
 if(!match||norm(match[1])!==norm(m.player)||!match[2]&&!match[4])return null;
 return {player:m.player,target:Number(match[3]),stat:({'three-point field goals made':'threes',points:'pts',rebounds:'reb',assists:'ast',steals:'stl',blocks:'blk'})[match[5].toLowerCase()]};
}
export function elapsed(status){
 if(status?.type?.state!=='in'||!Number.isInteger(status.period)||status.period<1||status.period>4||!/^\d+:\d{2}$/.test(status.displayClock||''))return null;
 const [m,s]=status.displayClock.split(':').map(Number);if(m>12||s>59||m===12&&s>0)return null;return (status.period-1)*12+12-m-s/60;
}
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const opportunity=stat=>stat==='pts'?'fga':stat==='threes'?'tpa':stat;
function share(game,p,stat){const key=opportunity(stat),team=game.players.filter(x=>x.team_id===p.team_id&&!x.dnp);if(team.some(x=>x[key]===null))return null;const total=team.reduce((n,x)=>n+x[key],0);return total>0?p[key]/total:null;}
// Gamma-Poisson posterior predictive tail. A count-model approximation, including points.
export function tail(needed,shape,rate,minutes){
 if(needed<=0)return 1;if(!(shape>0&&rate>0&&minutes>0))return 0;
 const p=rate/(rate+minutes),q=1-p;let mass=Math.pow(p,shape),cdf=mass;
 for(let k=1;k<needed;k++){mass*=((k-1+shape)/k)*q;cdf+=mass;}
 return Math.max(0,Math.min(1,1-cdf));
}
function random(seed){let x=2166136261;for(const c of seed)x=Math.imul(x^c.charCodeAt(0),16777619);return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function estimate(spec,event,history,config,now){
 const fail=reason=>({eligible:false,reason});const age=Date.parse(now)-Date.parse(event?.details_checked_at);
 if(!event?.details_available||!Number.isFinite(age)||age<0||age>600000)return fail('missing_or_stale_boxscore');
 const t=elapsed(event.status);if(t===null||t<config.min_elapsed||t>config.max_elapsed)return fail('outside_live_evaluation_window');
 const teams=new Set((event.competitions?.[0]?.competitors||[]).map(c=>String(c.team?.id)));
 const found=(event.nba_players||[]).filter(p=>norm(p.player)===norm(spec.player)&&teams.has(p.team_id));
 if(found.length!==1)return fail('ambiguous_player_or_game');const p=found[0];
 if(!p.position||typeof p.starter!=='boolean'||p.dnp||p.ejected||p.minutes===null||p.minutes<config.min_minutes||p.minutes>t+1||p[spec.stat]===null)return fail('unverified_role_or_stat');
 if(p.minutes/t<18/48||p.pf===null||p.pf>=5)return fail('limited_minutes_or_foul_risk');
 if((event.injuries||[]).some(i=>norm(i.player)===norm(p.player)&&/out|doubtful|questionable/i.test(i.status||'')))return fail('availability_uncertain');
 const scores=(event.competitions?.[0]?.competitors||[]).map(c=>number(c.score));if(scores.length!==2||scores.some(x=>x===null||!Number.isFinite(x)))return fail('unverified_score');
 if(t>=36&&Math.abs(scores[0]-scores[1])>=20)return fail('late_blowout');
 if(p[spec.stat]>=spec.target)return fail('target_already_reached');
 const cutoff=Date.parse(event.date),games=(history.games||[]).filter(g=>g.season_type===2&&Date.parse(g.date)<cutoff&&Date.parse(g.recorded_at)<=Date.parse(now)&&cutoff-Date.parse(g.date)<=config.historical_days*86400000);
 const valid=x=>!x.dnp&&x.minutes>=3&&x[spec.stat]!==null;
 let own=games.map(g=>({g,p:g.players.find(x=>x.athlete_id===p.athlete_id&&x.team_id===p.team_id)})).filter(x=>x.p&&valid(x.p)&&x.p.position===p.position&&x.p.starter===p.starter).sort((a,b)=>b.g.date.localeCompare(a.g.date)).slice(0,config.max_player_games);
 if(own.length<config.min_player_games)return fail('insufficient_same_team_position_role_history');
 const recent=own.slice(0,5).map(x=>share(x.g,x.p,spec.stat)).filter(x=>x!==null);if(recent.length<3)return fail('stat_specific_role_unavailable');const role=median(recent);
 own=own.filter(x=>{const s=share(x.g,x.p,spec.stat);return s!==null&&Math.abs(s-role)<=config.role_share_tolerance;});
 if(own.length<config.min_player_games)return fail('insufficient_comparable_role_history');
 const peers=games.flatMap(g=>g.players.filter(x=>x.athlete_id!==p.athlete_id&&x.position===p.position&&x.starter===p.starter&&valid(x)).map(x=>({g,p:x})));
 if(new Set(peers.map(x=>x.g.id)).size<config.min_position_games)return fail('insufficient_position_prior');
 const prior=peers.reduce((s,x)=>s+x.p[spec.stat],0)/peers.reduce((s,x)=>s+x.p.minutes,0);
 if(!(prior>0))return fail('insufficient_stat_specific_prior');
 const needed=spec.target-p[spec.stat],remaining=48-t;
 const probability=sample=>{const shape=sample.reduce((s,x)=>s+x.p[spec.stat],0)+prior*config.prior_minutes,rate=sample.reduce((s,x)=>s+x.p.minutes,0)+config.prior_minutes;
  return mean(sample.map(x=>{const projected=.5*x.p.minutes+.5*Math.min(48,p.minutes/t*48),future=Math.max(0,Math.min(remaining,projected-p.minutes));return tail(needed,shape,rate,future);}));};
 const probabilityYes=probability(own),rng=random(p.athlete_id+':'+event.id+':'+spec.stat+':'+spec.target),samples=[];
 for(let b=0;b<config.bootstrap_replicates;b++)samples.push(probability(own.map(()=>own[Math.floor(rng()*own.length)])));samples.sort((a,b)=>a-b);
 return {eligible:true,p:probabilityYes,range:[samples[Math.floor(samples.length*.05)],samples[Math.floor(samples.length*.95)]],
  evidence:{athlete_id:p.athlete_id,team_id:p.team_id,position:p.position,starter:p.starter,stat:spec.stat,current:p[spec.stat],target:spec.target,elapsed:t,minutes:p.minutes,role_proxy:opportunity(spec.stat)+' share',recent_role_share:role,
   historical_games:own.length,history_ids:own.map(x=>x.g.id),historical_inputs:own.map(x=>({id:x.g.id,date:x.g.date,minutes:x.p.minutes,stat:x.p[spec.stat],role_share:share(x.g,x.p,spec.stat)})),historical_stat_per_minute:own.reduce((s,x)=>s+x.p[spec.stat],0)/own.reduce((s,x)=>s+x.p.minutes,0),position_prior_per_minute:prior,
   current_player:p,game_status:event.status,game_scores:scores,checked_at:event.details_checked_at,source_url:event.details_source_url,history_checked_at:history.refreshed_at},
  warning:'Experimental count model and observational role proxies. Range is model-based, not validated coverage; unmodeled injury/rotation changes remain possible.'};
}
