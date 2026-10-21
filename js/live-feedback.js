(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.LiveFeedback=api;})(typeof self!=='undefined'?self:this,function(root){
 'use strict';
 function payload(alert,rating,note=''){
  if(!alert?.id||!['win','loss','push','void'].includes(alert.result)||!['juicy','bad'].includes(rating))throw Error('invalid');
  note=String(note).trim();if(note.length>500||/[$€£]|\b(?:secret key|api key|password)\b/i.test(note))throw Error('private');
  return {schema_version:1,alert_id:alert.id,rating,note};
 }
 const body=p=>'Live alert quality feedback (not a settlement correction).\n\n<!-- live-feedback:v1 -->\n```json\n'+JSON.stringify(p,null,2)+'\n```';
 function issueURL(p,config){const q=new URLSearchParams({title:'Live feedback: '+p.rating+' — '+p.alert_id,labels:'live-feedback',body:body(p)});return 'https://github.com/'+config.repoOwner+'/'+config.repoName+'/issues/new?'+q;}
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 function mount(box,records,doc){
  const S=root.STR.liveFeedback,byId=new Map(records.map(e=>[e.id,e]));
  for(const card of box.querySelectorAll('[data-live-alert]')){
   const alert=byId.get(card.dataset.liveAlert);if(!alert||!['win','loss','push','void'].includes(alert.result))continue;
   let votes=(doc?.votes||[]).filter(v=>v.alert_id===alert.id);const area=node('div',null,'lf-controls'),row=node('div',null,'row'),status=node('p','','small');status.setAttribute('role','status');
   const buttons={};area.append(node('span',S.title,'muted small'),row,status);card.append(area);
   const paint=()=>{for(const rating of ['juicy','bad'])buttons[rating].textContent=S[rating]+' · '+votes.filter(v=>v.rating===rating).length;};
   const connect=rating=>{status.replaceChildren(node('span',S.connectNote));if(!root.GhAuth?.enabled()){status.append(node('span',S.unavailable));return;}
    const button=node('button',S.connect,'btn btn-sm');button.type='button';status.append(button);button.onclick=async()=>{button.disabled=true;
     try{const flow=await root.GhAuth.start({feedback:true});status.replaceChildren(node('span',S.authCode(flow.user_code)));
      const url=new URL(flow.verification_uri);if(url.protocol!=='https:'||url.hostname!=='github.com')throw Error('auth');
      const link=node('a',S.authorize,'btn btn-sm');link.href=url.href;link.target='_blank';link.rel='noopener';status.append(link);
      if(await flow.done){await save(rating,true);}else status.textContent=S.authFailed;
     }catch(e){status.textContent=S.authFailed;}
    };
   };
   const save=async(rating,afterConnect=false)=>{
    for(const b of Object.values(buttons))b.disabled=true;status.textContent=S.saving;
    try{
     if(root.GhAuth)await root.GhAuth.ensureFresh();const token=root.Store.getToken();if(!token){connect(rating);return;}
     const c=root.APP_CONFIG,p=payload(alert,rating),r=await fetch('https://api.github.com/repos/'+c.repoOwner+'/'+c.repoName+'/issues',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({title:'Live feedback: '+rating+' — '+alert.id,body:body(p),labels:['live-feedback']})});
     if(!r.ok){if([401,403,404].includes(r.status)&&!afterConnect)connect(rating);else status.textContent=S.failed;return;}
     const issue=await r.json();const author=issue.user?.login;if(!author)throw Error('response');votes=votes.filter(v=>v.author.toLowerCase()!==author.toLowerCase());votes.push({author,rating});paint();status.textContent=S.savedDirect;
     for(const [key,b]of Object.entries(buttons)){b.setAttribute('aria-pressed',String(key===rating));b.classList.toggle('on',key===rating);}
    }catch(e){status.textContent=S.failed;}finally{for(const b of Object.values(buttons))b.disabled=false;}
   };
   for(const rating of ['juicy','bad']){const b=node('button','','btn btn-sm');b.type='button';b.setAttribute('aria-pressed','false');b.onclick=()=>save(rating);buttons[rating]=b;row.append(b);}paint();
  }
 }
 return {payload,body,issueURL,mount};
});

