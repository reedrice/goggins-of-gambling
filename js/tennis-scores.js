/* Pure ESPN tennis matching and score adapter, shared by browser and feed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TennisScores=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const isTennis=slug=>/^(?:atp|wta)(?:db)?-/.test(slug||'');
const tour=slug=>slug.startsWith('wta')?'wta':'atp';
const name=c=>c.athlete?.displayName||c.roster?.displayName||'';
const aliases=a=>[a.displayName,a.fullName,a.shortName,String(a.displayName||'').split(/\s+/).pop()].filter(Boolean).map(norm);
function sideMatches(text,c){const pieces=String(text).trim().split(/\s*\/\s*|\s+&\s+/),athletes=c.roster?.athletes||[c.athlete].filter(Boolean);if(pieces.length!==athletes.length)return false;const used=new Set();return pieces.every(p=>{const matches=athletes.map((a,i)=>!used.has(i)&&aliases(a).includes(norm(p))?i:-1).filter(i=>i>=0);if(matches.length!==1)return false;used.add(matches[0]);return true;});}
function find(board,title,slug,startTime){const sides=String(title||'').split(/\s+vs\.?\s+|\s+@\s+/i);if(sides.length!==2)return null;const doubles=/^(atpdb|wtadb)-/.test(slug),day=/(\d{4}-\d{2}-\d{2})$/.exec(slug)?.[1],anchor=Date.parse(startTime||day),found=[];
for(const event of board.events||[])for(const group of event.groupings||[])for(const c of group.competitions||[]){const cs=c.competitors||[];if(cs.length!==2||cs.some(x=>!name(x))||cs.some(x=>!!x.roster!==doubles))continue;if(!Number.isFinite(anchor)||!Number.isFinite(Date.parse(c.date))||Math.abs(Date.parse(c.date)-anchor)>(startTime?18:36)*3600000)continue;if((sideMatches(sides[0],cs[0])&&sideMatches(sides[1],cs[1]))||(sideMatches(sides[0],cs[1])&&sideMatches(sides[1],cs[0])))found.push({...c,tennis:true,tournament:event.name,doubles});}
return found.length===1?found[0]:null;}
function adapt(c){return {...c,competitors:c.competitors.map(x=>({...x,score:(x.linescores||[]).filter(s=>s.winner===true).length,team:{name:name(x),displayName:name(x),shortDisplayName:name(x),abbreviation:name(x)}}))};}
function values(c,unit,set){const rows=c.competitors.map(x=>x.linescores||[]);if(rows.some(x=>!x.length)||rows[0].length!==rows[1].length)return null;if(set){if(rows.some(x=>!Number.isInteger(x[set-1]?.value)||x[set-1].value<0))return null;return rows.map(x=>x[set-1].value);}if(unit==='sets'){const completed=c.status?.type?.completed?rows[0].length:Math.max(0,(c.status?.period||1)-1);if(rows.some(x=>x.slice(0,completed).some(s=>typeof s.winner!=='boolean')))return null;return rows.map(x=>x.filter(s=>s.winner===true).length);}
// A doubles deciding match tie-break is not ten ordinary games. No inferred settlement conversion.
if(c.doubles&&rows.some(x=>x.length>=3))return null;
if(rows.some(x=>x.some(s=>!Number.isInteger(s.value)||s.value<0||s.value>7)))return null;return rows.map(x=>x.reduce((n,s)=>n+s.value,0));}
function evaluate(s,c){const game=adapt(c),status=c.status||{},state=status.type?.state,final=status.type?.name==='STATUS_FINAL'&&status.type?.completed;
if(state==='pre')return {reason:'pregame',game};if(!['in','post'].includes(state)||state==='post'&&!final||c.wasSuspended)return {reason:'noStat',game};
const text=String(s.text||''),context=[s.market,s.marketSlug,s.question,text].join(' '),setMatch=/tennis_set_([12])_winner|\(Set ([12])\)/i.exec(context),set=setMatch?Number(setMatch[1]||setMatch[2]):0;
if(!/tennis_|\b(?:games|sets|win|winner|moneyline)\b/i.test(context))return {reason:'noStat',game};
const total=/\b(Over|Under)\s+(\d+(?:\.\d+)?)/i.exec(text),spread=/([+-]\d+(?:\.\d+)?)/.exec(text),winner=/winner|\bwin\b|to win/i.test(context)&&!total&&!spread;
const unit=/sets_spread|total_sets|\(Sets\)/i.test(context)?'sets':'games';
if(set&&status.period<set)return {reason:'segmentPending',game};
const scores=values(c,winner?'sets':unit,set);if(!scores||scores.some(v=>!Number.isFinite(v)))return {reason:'noStat',game};
const segmentFinal=!!set&&(status.period>set||final),done=final||segmentFinal;
if(total){if(s.side==='no')return {reason:'noStat',game};return {kind:'threshold',value:scores[0]+scores[1],target:Number(total[2]),under:total[1].toLowerCase()==='under',stat:unit,strict:true,final:done,game};}
const pick=text.replace(/^(?:Yes|No):\s*/i,'').split(/\s+(?:to win|wins?\b|[+-]\d)/i)[0];const selected=c.competitors.map((x,i)=>({x,i})).filter(({x})=>sideMatches(pick,x));if(selected.length!==1)return {reason:'noStat',game};const i=selected[0].i,j=1-i;
if(winner){const best=Number(c.format?.regulation?.periods);if(!set&&![3,5].includes(best))return {reason:'noStat',game};if(set)return {kind:'margin',margin:(scores[i]-scores[j])*(s.side==='no'?-1:1),team:name(c.competitors[s.side==='no'?j:i]),final:done,game,unit:'games'};
const index=s.side==='no'?j:i;return {kind:'threshold',value:scores[index],target:Math.floor(best/2)+1,under:false,stat:'sets',final:done,game};}
if(spread){const margin=scores[i]-scores[j]+Number(spread[1]);return {kind:'margin',margin:s.side==='no'?-margin:margin,line:Number(spread[1]),team:name(c.competitors[s.side==='no'?j:i]),final:done,game,unit};}
return {reason:'noStat',game};}
return {isTennis,tour,name,sideMatches,find,adapt,values,evaluate};});


