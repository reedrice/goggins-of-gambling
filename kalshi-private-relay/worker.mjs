// Stateless read-only relay. No keys stored, no logs, no write methods/endpoints.
const PARENT='https://reedrice.github.io';
export const allowed=path=>/^\/trade-api\/v2\/(api_keys|portfolio\/(positions|fills)|historical\/(positions|fills)|markets\/[A-Za-z0-9_-]{1,250})$/.test(path);
const cors={'Cache-Control':'no-store'};

export default {async fetch(req,env={},ctx){
 const u=new URL(req.url);
 if(!u.pathname.startsWith('/trade-api/')){
  if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});
  const asset=await env.ASSETS.fetch(req),out=new Response(asset.body,asset);
  out.headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors "+PARENT);
  out.headers.set('Referrer-Policy','no-referrer');out.headers.set('X-Content-Type-Options','nosniff');out.headers.set('Cache-Control','no-store');return out;
 }
 if(req.headers.has('Origin')&&req.headers.get('Origin')!==u.origin)return new Response('Forbidden',{status:403});
 if(!allowed(u.pathname))return new Response('Not found',{status:404,headers:cors});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET')return new Response('Read only',{status:405,headers:cors});
 if([...u.searchParams.keys()].some(k=>!['limit','cursor','settlement_status'].includes(k)))return new Response('Invalid query',{status:400,headers:cors});
 const headers=new Headers();for(const k of ['KALSHI-ACCESS-KEY','KALSHI-ACCESS-TIMESTAMP','KALSHI-ACCESS-SIGNATURE']){const v=req.headers.get(k);if(!v)return new Response('Missing authentication',{status:401,headers:cors});headers.set(k,v);}
 if(!/^\d{13}$/.test(headers.get('KALSHI-ACCESS-TIMESTAMP'))||Math.abs(Date.now()-Number(headers.get('KALSHI-ACCESS-TIMESTAMP')))>60000)return new Response('Expired',{status:401,headers:cors});
 try{const r=await fetch('https://external-api.kalshi.com'+u.pathname+u.search,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':'application/json'}});}catch{return new Response('Upstream unavailable',{status:502,headers:cors});}
}};
