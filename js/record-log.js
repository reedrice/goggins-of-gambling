(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RecordLog=api;})(typeof self!=='undefined'?self:this,function(){
 function group(picks){const out={lines:[],singles:[],combos:[]};for(const p of picks||[]){const legs=p.legs||[];if(legs.length>1)out.combos.push(p);else if(['moneyline','spread','total'].includes(legs[0]?.type||p.type)||/^(aec|asc|tsc)-/.test(legs[0]?.market_id||''))out.lines.push(p);else out.singles.push(p);}return out;}
 return {group};
});
