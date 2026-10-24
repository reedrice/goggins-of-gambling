import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import LB from '../js/live-bets.js';import BP from '../js/bet-progress.js';import PM from '../js/polymarket-sync.js';
test('closed history/activity builds nothing until opened and frees its content when collapsed',()=>{
 let builds=0,listener;const d={open:false,children:[],addEventListener:(event,fn)=>{assert.equal(event,'toggle');listener=fn;},append(body){this.children.push(body);}};
 LB.lazyDetails(d,()=>{builds++;const body={remove(){d.children.splice(d.children.indexOf(body),1);}};return body;});
 assert.equal(builds,0);d.open=true;listener();assert.equal(builds,1);assert.equal(d.children.length,1);listener();assert.equal(builds,1);d.open=false;listener();assert.equal(d.children.length,0);d.open=true;listener();assert.equal(builds,2);
});
test('unchanged live data has a stable view key; real feed, scores, filters, details, holdings and staleness changes invalidate it',()=>{
 const d={edges:[{key:'a',now_odds:'+110'}]},ui={sport:'nba',filter:'all',details:new Set(),espnRevision:'one'};const key=LB.viewKey(d,ui,1,false);
 assert.equal(LB.viewKey(structuredClone(d),ui,1,false),key);
 for(const change of [{filter:'big'},{game:5},{activity:true},{reasons:true},{conference:'top25'},{boardGame:'nba:123'},{espnRevision:'two'},{details:new Set(['a'])}])assert.notEqual(LB.viewKey(d,{...ui,...change},1,false),key);
 assert.notEqual(LB.viewKey({edges:[{key:'a',now_odds:'+115'}]},ui,1,false),key);assert.notEqual(LB.viewKey(d,ui,2,false),key);assert.notEqual(LB.viewKey(d,ui,1,true),key);
});
test('holdings badge revision ignores price/cost/order changes but tracks exact outcome, expiry and combo eligibility',()=>{
 const a={'nba-a-b-full-line':{netPosition:'2',cost:100},'nba-a-b-half-line':{netPosition:'-3'}};
 const key=PM.holdingKey(a);assert.equal(PM.holdingKey({'nba-a-b-half-line':{netPosition:'-4',unrealized:99},'nba-a-b-full-line':{netPosition:'8',cost:500}}),key);
 for(const changed of [{...a,'nba-a-b-full-line':{netPosition:'-2'}},{...a,'nba-a-b-full-line':{netPosition:'0'}},{...a,'nba-a-b-full-line':{netPosition:'2',expired:true}},{...a,'nba-a-b-full-line':{netPosition:'2',comboLegDetails:[{}]}}])assert.notEqual(PM.holdingKey(changed),key);
 assert.notEqual(PM.holdingKey({'nba-a-b-quarter-line':{netPosition:'2'}}),key);
});
class Node{constructor(tag){this.tag=tag;this.children=[];this.style={};this.writes=0;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;this.writes++;}setAttribute(){}closest(){return null;}querySelector(){return null;}}
test('progress DOM stays in place when unchanged, but values, source timestamps, stale state and finals still repaint',()=>{
 const context={window:{},module:{exports:{}}};context.self=context.window;vm.createContext(context);vm.runInContext(fs.readFileSync('js/strings.js','utf8'),context);vm.runInContext(fs.readFileSync('js/bet-progress.js','utf8'),context);context.document={createElement:tag=>new Node(tag)};
 const api=context.module.exports,host=new Node('div'),spec={text:'Over 10 points'},first={kind:'threshold',target:10,value:3,stat:'points',checkedAt:'2026-10-24T01:00:00Z'};
 api.render(host,spec,first);assert.equal(host.writes,1);const original=host.children;api.render(host,spec,structuredClone(first));assert.equal(host.writes,1);assert.equal(host.children,original);
 api.render(host,spec,{...first,value:6});assert.equal(host.writes,2);api.render(host,spec,{...first,value:6,final:true});assert.equal(host.writes,3);api.render(host,spec,{reason:'stale',checkedAt:first.checkedAt});assert.equal(host.writes,4);api.render(host,spec,{...first,checkedAt:'2026-10-24T01:05:00Z'});assert.equal(host.writes,5);
});
test('scrolling performance styles preserve tokens and reserve blur for navigation and sheets',()=>{
 const css=fs.readFileSync('css/theme.css','utf8').split('/* Scrolling performance:')[1];assert.ok(css);assert.match(css,/background-attachment: scroll/);assert.match(css,/backdrop-filter: none/);assert.ok(!css.includes('.topbar'));assert.ok(!css.includes('.sheet'));assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css));
});
