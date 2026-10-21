// Stateless read-only relay. No keys stored, no logs, no write methods/endpoints.
const ORIGIN='https://reedrice.github.io';
export const allowed=path=>/^\/trade-api\/v2\/(api_keys|portfolio\/(positions|fills)|historical\/(positions|fills)|markets\/[A-Za-z0-9_-]{1,250})$/.test(path);
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'KALSHI-ACCESS-KEY,KALSHI-ACCESS-TIMESTAMP,KALSHI-ACCESS-SIGNATURE','Cache-Control':'no-store','Vary':'Origin'};
export default {async fetch(req,env={},ctx){
 if(req.headers.get('Origin')!==ORIGIN)return new Response('Forbidden',{status:403});
 const u=new URL(req.url);if(!allowed(u.pathname))return new Response('Not found',{status:404,headers:cors});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET')return new Response('Read only',{status:405,headers:cors});
 if([...u.searchParams.keys()].some(k=>!['limit','cursor','settlement_status'].includes(k)))return new Response('Invalid query',{status:400,headers:cors});
 const headers=new Headers();for(const k of ['KALSHI-ACCESS-KEY','KALSHI-ACCESS-TIMESTAMP','KALSHI-ACCESS-SIGNATURE']){const v=req.headers.get(k);if(!v)return new Response('Missing authentication',{status:401,headers:cors});headers.set(k,v);}
 if(!/^\d{13}$/.test(headers.get('KALSHI-ACCESS-TIMESTAMP'))||Math.abs(Date.now()-Number(headers.get('KALSHI-ACCESS-TIMESTAMP')))>60000)return new Response('Expired',{status:401,headers:cors});
 try{const r=await fetch('https://external-api.kalshi.com'+u.pathname+u.search,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':'application/json'}});}catch{return new Response('Upstream unavailable',{status:502,headers:cors});}
}};
