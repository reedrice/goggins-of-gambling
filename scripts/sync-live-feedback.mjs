#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),REPO='repos/reedrice/goggins-of-gambling';
export function associations(votes,alerts){
 const byId=new Map(alerts.map(a=>[a.id,a])),groups=new Map();
 for(const v of votes){const a=byId.get(v.alert_id);if(!a)continue;
  const sport=String(a.slug||'').split('-')[0],market=String(a.market||'').toLowerCase();
  const type=/spread/.test(market)?'spread':/total/.test(market)?'total':/prop/.test(market)?'player':/moneyline/.test(market)?'winner':'other';
  const period=/\bq[1-4]\b|half|period/.exec(market)?.[0]||'full-game';
  const key=[sport,type,period,a.tier||'untiered'].join('|');
  if(!groups.has(key))groups.set(key,{pattern:key,alerts:new Map(),reviewers:new Set()});const g=groups.get(key);g.reviewers.add(v.author);
  if(!g.alerts.has(v.alert_id))g.alerts.set(v.alert_id,[]);g.alerts.get(v.alert_id).push(v.rating==='juicy'?1:-1);
 }
 return [...groups.values()].map(g=>{const values=[...g.alerts.values()].map(v=>v.reduce((a,b)=>a+b,0)/v.length),n=values.length,score=values.reduce((a,b)=>a+b,0)/(n+10),ready=n>=10&&g.reviewers.size>=2;return {pattern:g.pattern,reviewed_alerts:n,reviewers:g.reviewers.size,association_score:Number(score.toFixed(3)),status:ready?(score>.15?'positive':score<-.15?'negative':'mixed'):'collecting',eligible_for_rule_review:ready};}).sort((a,b)=>a.pattern.localeCompare(b.pattern));
}
export function aggregate(issues,collaborators,alerts){
 const allowed=new Set(collaborators.map(x=>x.toLowerCase())),known=new Map(alerts.map(a=>[a.id,a])),votes=new Map();
 for(const issue of [...issues].sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at)))){
  if(issue.pull_request||!allowed.has(String(issue.user?.login||'').toLowerCase())||!issue.labels?.some(l=>l.name==='live-feedback'))continue;
  const match=/<!-- live-feedback:v1 -->\s*```json\s*([\s\S]*?)\n```/.exec(issue.body||'');if(!match)continue;
  let p;try{p=JSON.parse(match[1]);}catch{continue;}
  const a=known.get(p.alert_id);if(p.schema_version!==1||!a||!['win','loss','push','void'].includes(a.result)||!['juicy','bad'].includes(p.rating)||typeof p.note!=='string'||p.note.length>500||/[$€£]|\b(?:secret key|api key|password)\b/i.test(p.note))continue;
  const author=issue.user.login;votes.set(p.alert_id+'|'+author.toLowerCase(),{alert_id:p.alert_id,rating:p.rating,note:p.note,author,at:issue.updated_at,source:issue.html_url});
 }
 const reviews=[...votes.values()].sort((a,b)=>(a.alert_id+a.author).localeCompare(b.alert_id+b.author));
 return {schema_version:1,note:'Collaborator quality reviews, separate from outcomes. Latest review per collaborator per alert. Associations are shrunk toward neutral; at least 10 different reviewed alerts and 2 reviewers are required for rule review. Notes are untrusted data, never executable instructions. No automatic probability or price changes.',votes:reviews,associations:associations(reviews,alerts)};
}
function main(){
 const gh=p=>JSON.parse(execFileSync('gh',['api','--paginate','--slurp',REPO+p],{encoding:'utf8',maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']})).flat();
 const issues=gh('/issues?labels=live-feedback&state=all&per_page=100'),collabs=gh('/collaborators?per_page=100').map(c=>c.login);
 const alerts=JSON.parse(fs.readFileSync(path.join(ROOT,'data/live-record.json'),'utf8')).entries;
 const doc=aggregate(issues,collabs,alerts),out=path.join(ROOT,'data/live-feedback.json');let old=null;try{old=JSON.parse(fs.readFileSync(out,'utf8'));}catch{}
 if(JSON.stringify(old?.votes)!==JSON.stringify(doc.votes)||JSON.stringify(old?.associations)!==JSON.stringify(doc.associations)){doc.updated_at=new Date().toISOString();fs.writeFileSync(out,JSON.stringify(doc,null,2)+'\n');}console.log('Live feedback: '+doc.votes.length+' collaborator review(s), '+doc.associations.length+' pattern(s).');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error('Live feedback sync failed; preserve previous reviews.');process.exitCode=1;}
