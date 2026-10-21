(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KalshiNetwork=api;})(globalThis,function(){
'use strict';
const ORIGIN='https://external-api.kalshi.com';
const pathAllowed=p=>/^\/trade-api\/v2\/(api_keys|portfolio\/(positions|fills)|historical\/(positions|fills)|markets\/[A-Za-z0-9_-]{1,250})$/.test(p);
function validate(value,options={}){const u=new URL(value);if(u.origin!==ORIGIN||u.username||u.password||u.hash||!pathAllowed(u.pathname)||options.method!=='GET'||options.body!==undefined||options.credentials!=='omit'||options.redirect!=='error')throw Error('endpoint');for(const k of u.searchParams.keys())if(!['limit','cursor','settlement_status'].includes(k))throw Error('endpoint');return u.href;}
function reader(nativeFetch){return (value,options)=>nativeFetch(validate(value,options),options);}
return {validate,reader};});
