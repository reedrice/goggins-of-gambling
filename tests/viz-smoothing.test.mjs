import test from 'node:test';import assert from 'node:assert/strict';import V from '../js/viz.js';
test('overview averages dense noise without modifying source data or latest quote',()=>{
 const raw=Array.from({length:1000},(_,i)=>({t:i*1000,chance:i%2?52:48})),before=JSON.stringify(raw);
 const d=V.displaySeries(raw,0,999000,40);
 assert.equal(d.smoothed,true);assert.ok(d.points.length<=43);assert.equal(d.points[0],raw[0]);assert.equal(d.points.at(-1),raw.at(-1));
 assert.equal(JSON.stringify(raw),before);assert.ok(d.points.every(p=>p.chance>=48&&p.chance<=52));
 assert.equal(V.valueAt(raw,1000),52);
});
test('zooming into sparse quotes restores raw samples',()=>{
 const raw=[{t:0,chance:30},{t:1000,chance:60},{t:2000,chance:20},{t:3000,chance:50}];
 const d=V.displaySeries(raw,0,3000,60);assert.equal(d.smoothed,false);assert.deepEqual(d.points,raw);
});
