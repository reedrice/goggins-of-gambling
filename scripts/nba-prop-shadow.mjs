// Prospective NBA experiment; local public files only. Never changes live edge eligibility.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import BP from '../js/bet-progress.js';
import {contract,estimate} from './nba-prop-model.mjs';import {loadUsage} from './live-prop-quality.mjs';
const dir='data/testing/',read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}},write=(f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,1)+'\n');
export const hash=text=>createHash('sha256').update(String(text).replace(/\r\n/g,'\n')).digest('hex');
export function candidates(open,event,at){
 if(!open.slug?.startsWith('nba-'))return [];
 const result=[];
 for(const m of event.markets||[]){
  const type=/^basketball_player_(points|rebounds|assists|threes|steals|blocks)$/.exec(m.sportsMarketType||'');if(!type)continue;
  const question=m.question||'',player=/^(?:Will )?(.+?) (?:record|score|have|make|get)\b/i.exec(question)?.[1];
  const o={id:m.id,player,period:'full_game',question,sides:[]},spec=contract(o),expected={points:'pts',rebounds:'reb',assists:'ast',threes:'threes',steals:'stl',blocks:'blk'}[type[1]];
  if(!spec||spec.stat!==expected)continue;
  if(!m?.active||m.closed||m.status!=='MARKET_STATUS_OPEN')continue;
  const bid=Number(m.bestBidQuote?.value),ask=Number(m.bestAskQuote?.value);if(!(bid>0&&ask>=bid&&ask<1&&ask-bid<=.06))continue;
  for(const index of [0,1]){const side=(m.marketSides||[]).find(s=>s.long===(index===0));if(side?.tradable!==true)continue;
   if((index===0?ask:1-bid)<1/6||(index===0?ask:1-bid)>5/6)continue;
   result.push({market_id:String(o.id),player:o.player,period:o.period,question:o.question,sides:o.sides,side_index:index,ask:index===0?ask:1-bid,bid:index===0?bid:1-ask,quoted_at:at});}
 }
 return result;
}
export function mergePredictions(ledger,feeds,history,config,now){
 const out=structuredClone(ledger),seen=new Set(out.predictions.map(p=>p.id)),skips={};let added=0;
 const skip=k=>skips[k]=(skips[k]||0)+1;
 for(const {feed,event} of feeds){
  if(!feed.slug?.startsWith('nba-')||String(event?.id)!==String(feed.game_context?.event_id)||!BP.findEvent({events:event?[event]:[]},feed.slug)){skip('unverified_event');continue;}
  for(const c of feed.prop_test_candidates||[]){
   const age=Date.parse(now)-Date.parse(c.quoted_at);if(!Number.isFinite(age)||age<0||age>600000||Date.parse(c.quoted_at)<Date.parse(config.collection_not_before||config.created_at)||c.quoted_at!==feed.updated){skip('stale_quote');continue;}
   if(out.ends_at&&Date.parse(c.quoted_at)>=Date.parse(out.ends_at))continue;
   const spec=contract(c);if(!spec||!config.stats.includes(spec.stat)){skip('unsupported_contract');continue;}
   const id=[config.model_version,event.id,spec.player.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''),spec.stat,spec.target,c.side_index].join(':');if(seen.has(id))continue;
   const fit=estimate(spec,event,history,config,c.quoted_at);if(!fit.eligible){skip(fit.reason);continue;}
   const no=c.side_index===1,p=no?1-fit.p:fit.p,range=no?[1-fit.range[1],1-fit.range[0]]:fit.range;
   const lower=range[0]-c.ask-config.cost_reserve_per_contract;
   if(!out.started_at){out.started_at=c.quoted_at;out.ends_at=new Date(Date.parse(out.started_at)+config.window_days*86400000).toISOString();}
   out.predictions.push({id,model_version:config.model_version,protocol_hash:out.protocol_hash,at:c.quoted_at,recorded_at:now,slug:feed.slug,event_id:String(event.id),game_date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.date)),market_id:c.market_id,side_index:c.side_index,
    player:spec.player,stat:spec.stat,target:spec.target,ask:c.ask,bid:c.bid,estimated_probability:p,experimental_range:range,break_even_with_reserve:c.ask+config.cost_reserve_per_contract,
    conservative_margin:lower,qualifies_for_test:lower>=config.minimum_probability_margin,expected_net_return:p/c.ask-1-config.cost_reserve_per_contract/c.ask,
    estimated_ability_and_role:fit.evidence,warning:fit.warning,result:'pending',graded_at:null,graded_from:null});seen.add(id);added++;
  }
 }
 return {ledger:out,skips,added};
}
function rng(seed){let x=seed;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
export function endpointMetrics(rows,config){
 const settled=rows.filter(p=>p.qualifies_for_test&&['win','loss'].includes(p.result));
 const groups=new Map();for(const p of settled){if(!groups.has(p.game_date))groups.set(p.game_date,[]);groups.get(p.game_date).push(p);}
 const profit=p=>p.result==='win'?1/p.ask-1-config.cost_reserve_per_contract/p.ask:-1-config.cost_reserve_per_contract/p.ask;
 const stats=list=>{const n=list.length;return n?{roi:list.reduce((s,p)=>s+profit(p),0)/n,overstatement:list.reduce((s,p)=>s+p.estimated_probability-(p.result==='win'?1:0),0)/n,brier:list.reduce((s,p)=>s+(p.estimated_probability-(p.result==='win'?1:0))**2,0)/n,market_brier:list.reduce((s,p)=>s+(p.ask-(p.result==='win'?1:0))**2,0)/n}:null;};
 if(groups.size<config.min_game_dates||settled.length<config.min_settled_predictions||new Set(settled.map(p=>p.event_id)).size<config.min_distinct_games)return {coverage_met:false,decision:'inconclusive'};
 const blocks=[...groups.values()],random=rng(20261022),draws=[];
 for(let b=0;b<5000;b++)draws.push(stats(blocks.flatMap(()=>blocks[Math.floor(random()*blocks.length)])));
 const alpha=config.family_alpha/config.stats.length,rois=draws.map(x=>x.roi).sort((a,b)=>a-b),cal=draws.map(x=>x.overstatement).sort((a,b)=>a-b);
 return {coverage_met:true,metrics:stats(settled),lower_roi:rois[Math.floor(alpha*rois.length)],upper_overstatement:cal[Math.floor((1-alpha)*cal.length)],statistical_screen_passed:rois[Math.floor(alpha*rois.length)]>0&&cal[Math.floor((1-alpha)*cal.length)]<=config.calibration_overstatement_tolerance,calibration_bins:Array.from({length:5},(_,i)=>{const xs=settled.filter(p=>Math.min(4,Math.floor(p.estimated_probability*5))===i);return {lower:i/5,upper:(i+1)/5,n:xs.length,predicted:xs.length?xs.reduce((s,p)=>s+p.estimated_probability,0)/xs.length:null,observed:xs.length?xs.filter(p=>p.result==='win').length/xs.length:null};}),method:'date-block percentile bootstrap; related games/markets share blocks; Bonferroni across planned stat families',decision:'manual_review_required',power_status:config.power_status};
}
export function status(ledger,history,config,now,skips={}){
 const ended=!!ledger.ends_at&&Date.parse(now)>=Date.parse(ledger.ends_at),rows=ledger.predictions;
 return {schema_version:1,mode:'testing_only',model_version:config.model_version,protocol_hash:ledger.protocol_hash,updated_at:now,state:ended?'window_complete':rows.length?'collecting_results':'collecting_history',
  history_games:history.games?.length||0,predictions:rows.length,settled:rows.filter(p=>p.result!=='pending').length,qualified:rows.filter(p=>p.qualifies_for_test).length,
  distinct_games:new Set(rows.map(p=>p.event_id)).size,game_dates:new Set(rows.map(p=>p.game_date)).size,started_at:ledger.started_at,ends_at:ledger.ends_at,skips,
  per_stat:Object.fromEntries(config.stats.map(stat=>{const xs=rows.filter(p=>p.stat===stat);return [stat,{logged:xs.length,settled:xs.filter(p=>p.result!=='pending').length,qualified:xs.filter(p=>p.qualifies_for_test).length,...(ended?endpointMetrics(xs,config):{})}];})),
  promotion:'disabled; prospective statistical and source review required',power_status:config.power_status,criteria:{days:config.window_days,min_predictions:config.min_settled_predictions,min_games:config.min_distinct_games,min_dates:config.min_game_dates},
  limitations:['Ability uses same-team, same-position, same-starter-role regular-season history.','Role shares are proxies, not verified coaching assignments.','Count model and probability ranges remain experimental.','A fixed cost reserve is a sensitivity assumption, not verified exchange fees.','No game-clock or price-movement information is used as proof of favorable probability.','Coverage minima are not a power calculation.']};
}
export function loadLedger(){
 const metadata=read(dir+'nba-prop-shadow.json');if(!metadata)return null;
 if(Array.isArray(metadata.predictions))return metadata;
 return {...metadata,predictions:(metadata.prediction_files||[]).flatMap(file=>{if(!/^data\/testing\/nba-prop-ledger\/\d{4}-\d{2}-\d{2}\.json$/.test(file))throw Error('Invalid ledger path');const doc=read(file);if(!Array.isArray(doc?.predictions))throw Error('Missing ledger shard');return doc.predictions;})};
}
export function saveLedger(ledger){
 fs.mkdirSync(dir+'nba-prop-ledger',{recursive:true});const grouped=new Map();
 for(const p of ledger.predictions){const date=p.at.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid observation date');if(!grouped.has(date))grouped.set(date,[]);grouped.get(date).push(p);}
 const files=[];for(const [date,predictions] of grouped){const file=dir+'nba-prop-ledger/'+date+'.json',text=JSON.stringify({schema_version:1,model_version:ledger.model_version,predictions},null,1)+'\n';if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)fs.writeFileSync(file,text);files.push(file);}
 const {predictions,...metadata}=ledger;write(dir+'nba-prop-shadow.json',{...metadata,prediction_files:files.sort(),count:predictions.length});
}
export function main(){
 const config=read(dir+'nba-prop-protocol.json'),freeze=read(dir+'nba-prop-freeze.json');if(!config||!freeze)throw Error('Frozen protocol required');
 const hashes={protocol:hash(fs.readFileSync(dir+'nba-prop-protocol.json')),model:hash(fs.readFileSync('scripts/nba-prop-model.mjs')),runner:hash(fs.readFileSync('scripts/nba-prop-shadow.mjs')),matching:hash(BP.findEvent.toString()),snapshot_loader:hash(loadUsage.toString())};
 if(Object.keys(hashes).some(k=>hashes[k]!==freeze.hashes[k]))throw Error('Model/config changed: create a new version and prospective window');
 const signature=hash(JSON.stringify(hashes)),ledger=loadLedger()||{schema_version:1,model_version:config.model_version,protocol_hash:signature,started_at:null,ends_at:null,predictions:[]};
 if(ledger.protocol_hash!==signature||ledger.model_version!==config.model_version)throw Error('Refuse mixing experiment versions');
 const history=read('data/espn/nba-player-history.json')||{games:[]},now=new Date().toISOString(),index=read('data/live/index.json'),feeds=[];
 for(const g of index?.games||[]){if(!/^nba-[a-z0-9-]+$/.test(g.slug)||g.status==='final')continue;const feed=read('data/live/'+g.slug+'.json');if(feed)feeds.push({feed,event:loadUsage(g.slug,feed.game_context?.event_id)});}
 const merged=mergePredictions(ledger,feeds,history,{...config,collection_not_before:freeze.frozen_at},now);saveLedger(merged.ledger);write(dir+'nba-prop-status.json',status(merged.ledger,history,config,now,merged.skips));console.log('NBA prop testing: '+merged.added+' prospective predictions; '+history.games.length+' historical games.');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{main();}catch(error){
 console.error('::warning::NBA prop testing paused: '+error.message);
 const prior=read(dir+'nba-prop-status.json')||{};write(dir+'nba-prop-status.json',{...prior,mode:'testing_only',state:'paused',updated_at:new Date().toISOString(),error:error.message,promotion:'disabled'});
}}
