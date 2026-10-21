import test from 'node:test';import assert from 'node:assert/strict';import V from '../js/viz.js';
test('paired tennis and spread charts replace duplicate colors including fallback blue',()=>{
 for(const marketType of ['moneyline','spreads'])for(const colorPrimary of ['#4c8dff','#3fb950','#345cff']){
  const ev={markets:[{slug:'pair',marketType,sportsMarketType:marketType==='moneyline'?'winner':'spread',marketSides:[{long:true,description:'A',team:{colorPrimary}},{long:false,description:'B',team:{colorPrimary}}]}]};
  const pair=V.pairSides(ev,{slug:'pair'});assert.equal(pair.pair,true);assert.notEqual(pair.sides[0].color,pair.sides[1].color);
 }
});
test('distinct provider colors remain unchanged',()=>{
 const ev={markets:[{slug:'pair',marketType:'moneyline',sportsMarketType:'winner',marketSides:[{long:true,team:{colorPrimary:'#3fb950'}},{long:false,team:{colorPrimary:'#4c8dff'}}]}]};
 assert.deepEqual(V.pairSides(ev,{slug:'pair'}).sides.map(s=>s.color),['#3fb950','#4c8dff']);
});
test('the reported tennis pair uses visibly contrasting colors rather than two slightly different blues',()=>{
 const ev={markets:[{slug:'pair',marketType:'moneyline',sportsMarketType:'winner',marketSides:[{long:true,team:{colorPrimary:'#2e5cff'}},{long:false,team:{colorPrimary:'#4c8dff'}}]}]};
 assert.deepEqual(V.pairSides(ev,{slug:'pair'}).sides.map(s=>s.color),['#2e5cff','#3fb950']);
});
