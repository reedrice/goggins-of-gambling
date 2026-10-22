const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../js/polymarket-sync.js'),LB=require('../js/live-bets.js');
const BP=require('../js/bet-progress.js');
const half='tsc-cfb-jmad-applst-2026-10-22-fh-spread-4pt5';
const positions={
 [half]:{netPositionDecimal:'-0.25',netPosition:'0'},
 [half+'-other-line']:{netPosition:'2'},
 full:{netPosition:'3'},sold:{netPositionDecimal:'0',netPosition:'5'},
 expired:{netPosition:'2',expired:true},unknown:{netPosition:'bad'},
 combo:{netPosition:'2',comboLegDetails:[{slug:half,outcomeSide:'OUTCOME_SIDE_SHORT'}]},
 'crossd-no-metadata':{netPosition:'1'}
};
test('exact slug and signed outcome identify holdings without title guesses',()=>{
 assert.equal(P.matchesPosition(positions,half,'no'),true);
 assert.equal(P.matchesPosition(positions,half,'yes'),false);
 assert.equal(P.matchesPosition(positions,half.replace('-fh-','-sh-'),'no'),false);
 assert.equal(P.matchesPosition(positions,half.replace('4pt5','5pt5'),'no'),false);
 assert.equal(P.matchesPosition(positions,'full','yes'),true);
 assert.equal(P.matchesPosition(positions,'full','no'),false);
 assert.equal(P.matchesPosition(positions,'same team name','yes'),false);
});
test('sold, expired, unknown and combo positions cannot flag a straight bet',()=>{
 for(const slug of ['sold','expired','unknown','combo','crossd-no-metadata'])for(const side of ['yes','no'])assert.equal(P.matchesPosition(positions,slug,side),false,slug);
 assert.equal(P.matchesPosition({},half,'no'),false);
 assert.equal(P.matchesPosition(positions,half,'0'),false);
});
test('live card outcome comes from an unambiguous matching market key',()=>{
 assert.equal(LB.holdingSide({market_id:'123',key:'123:0',side:'Different display name'}),'yes');
 assert.equal(LB.holdingSide({market_id:'123',key:'123:1',side:'Mountaineers +4.5'}),'no');
 for(const key of ['456:1','123','123:2','123:','123:1:0'])assert.equal(LB.holdingSide({market_id:'123',key}),null);
});
test('locked account exposes no snapshot, keys, positions or holdings',()=>{
 assert.deepEqual(P.holdingsStatus(),{unlocked:false,checkedAt:null,error:false,busy:false});
 assert.equal(P.isHolding(half,'no'),false);
});
test('numeric IDs resolve through one shared public request; missing IDs abstain',async()=>{
 const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(url,options)=>{
  requests++;assert.equal(url,'https://gateway.polymarket.us/v1/events/slug/cfb-jmad-applst-2026-10-22');
  assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
  return {ok:true,json:async()=>({event:{markets:[{id:'123',slug:half,marketSides:[{long:true,description:'Yes'},{long:false,description:'No'}]}]}})};
 };
 try{
  const result=await Promise.all([BP.marketIdentity('cfb-jmad-applst-2026-10-22','123'),BP.marketIdentity('cfb-jmad-applst-2026-10-22','123')]);
  assert.deepEqual(result,[half,half]);assert.equal(requests,1);
  assert.equal(await BP.marketIdentity('cfb-jmad-applst-2026-10-22','999'),null);
  assert.equal(await BP.marketIdentity('invalid-event','123'),null);
 }finally{globalThis.fetch=original;}
});
