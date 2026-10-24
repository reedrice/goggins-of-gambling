/* Shared public snapshots only; never credentials or private portfolio responses. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PublicJSON=api;})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 function create({request=(...args)=>root.fetch(...args),now=()=>Date.now(),visible=()=>!root.document?.hidden}={}){
  const cache=new Map(),failures=new Map(),queue=[];let limitedUntil=0,active=0;
  const acquire=()=>new Promise(resolve=>{if(active<6){active++;resolve();}else queue.push(resolve);});
  const release=()=>{const next=queue.shift();if(next)next();else active--;};
  function get(path,{ttl=30000,version,force=false}={}){
   if(!/^(?:data\/[a-zA-Z0-9_./-]+\.json|version\.json)$/.test(path)||path.includes('..'))return Promise.reject(Error('Public JSON path required'));
   const key=path+'|'+(version||''),old=cache.get(key),time=now();
   if(old&&(old.pending||(!force&&(version||time-old.at<ttl))))return old.promise;
   if(!visible())return Promise.reject(Error('Public refresh paused while hidden'));
   if(time<limitedUntil||time<(failures.get(key)||0))return Promise.reject(Error('Public snapshot retry cooling down'));
   // Shared CDN keys avoid per-component cache busting. Publication revisions
   // keep scores fresh without waiting for the host's ten-minute cache TTL.
   const url=path+(version?'?rev='+encodeURIComponent(version):'?snapshot='+Math.floor(time/30000));
   const row={at:time,pending:true};
   row.promise=Promise.resolve().then(async()=>{
    await acquire();
    try{
     if(!visible()||now()<limitedUntil)throw Error('Public refresh paused or cooling down');
     const response=await request(url,{cache:version?'default':'no-cache',credentials:'omit',signal:AbortSignal.timeout(15000)});
     if(!response.ok){
      if(response.status===429){const retry=response.headers?.get('Retry-After');const seconds=Number(retry);const until=retry&&Number.isFinite(seconds)?now()+seconds*1000:Date.parse(retry);limitedUntil=Math.max(limitedUntil,Number.isFinite(until)?Math.max(now()+1000,until):now()+60000);}
      throw Error('Public snapshot HTTP '+response.status);
     }
     const data=await response.json();row.at=now();row.pending=false;failures.delete(key);for(const [k,v] of cache)if(k!==key&&k.startsWith(path+'|')&&!v.pending)cache.delete(k);return data;
    }catch(error){cache.delete(key);failures.set(key,now()+5000);throw error;}finally{release();}
   });
   cache.delete(key);cache.set(key,row);
   if(cache.size>512)for(const [k,v] of cache){if(!v.pending&&k!==key){cache.delete(k);if(cache.size<=512)break;}}
   return row.promise;
  }
  async function snapshot(path){
   if(path==='data/espn/index.json')return get(path);
   const index=await get('data/espn/index.json'),entry=index.snapshots?.find(s=>s.file===path);
   if(entry?.available===false)throw Error('Snapshot unavailable');
   return get(path,{version:entry?.fetched_at||index.updated_at});
  }
  async function live(slug){
   if(!/^[a-z0-9-]+$/.test(slug))throw Error('Invalid live slug');
   const index=await get('data/live/index.json');
   return get('data/live/'+slug+'.json',{version:index.games?.find(g=>g.slug===slug)?.updated});
  }
  return {get,snapshot,live};
 }
 return {...create(),create};
});
