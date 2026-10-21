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
   const votes=(doc?.votes||[]).filter(v=>v.alert_id===alert.id),area=node('div',null,'lf-controls'),row=node('div',null,'row');
   area.append(node('span',S.title,'muted small'));
   for(const rating of ['juicy','bad']){const b=node('button',S[rating]+' · '+votes.filter(v=>v.rating===rating).length,'btn btn-sm');b.type='button';b.onclick=()=>form(area,alert,rating);row.append(b);}area.append(row);
   if(votes.length){const details=node('details'),summary=node('summary',S.notes);details.append(summary);for(const v of votes){const p=node('p',v.author+' · '+S[v.rating]+(v.note?' — '+v.note:''),'small');details.append(p);}area.append(details);}
   card.append(area);
  }
 }
 function form(area,alert,rating){
  area.querySelector('.lf-form')?.remove();const S=root.STR.liveFeedback,c=root.APP_CONFIG,wrap=node('form',null,'lf-form');
  wrap.append(node('strong',S[rating]),node('p',S.publicNote,'muted small'));
  const label=node('label',S.note),text=node('textarea');text.maxLength=500;text.rows=3;label.append(text);wrap.append(label);
  const submit=node('button',S.submit,'btn btn-sm btn-primary');submit.type='submit';const status=node('p','','small');status.setAttribute('role','status');wrap.append(submit,status);area.append(wrap);
  wrap.onsubmit=async e=>{e.preventDefault();let p;try{p=payload(alert,rating,text.value);}catch(err){status.textContent=S.invalid;return;}submit.disabled=true;
   const fallback=()=>{status.replaceChildren(node('span',S.continue));const link=node('a',S.github,'btn btn-sm');link.href=issueURL(p,c);link.target='_blank';link.rel='noopener';status.append(link);submit.disabled=false;};
   try{
    if(root.GhAuth)await root.GhAuth.ensureFresh();const token=root.Store.getToken();if(!token){fallback();return;}
    const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
    const r=await fetch('https://api.github.com/repos/'+c.repoOwner+'/'+c.repoName+'/issues',{method:'POST',headers,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({title:'Live feedback: '+rating+' — '+alert.id,body:body(p),labels:['live-feedback']})});
    if(!r.ok){fallback();return;}status.textContent=S.saved;text.disabled=true;
   }catch(err){fallback();}
  };
 }
 return {payload,body,issueURL,mount};
});
