// Parent-site launcher only. No credential fields, portfolio reads, messages or shared relay.
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.KalshiSync=api;})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const DEPLOY='https://deploy.workers.cloudflare.com/?url=https://github.com/reedrice/goggins-of-gambling/tree/main/kalshi-private-relay';
function personalOrigin(value){let u;try{u=new URL(value);}catch{throw Error('origin');}if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||!/^[-a-z0-9]+\.[-a-z0-9]+\.workers\.dev$/.test(u.hostname)||u.hostname.endsWith('.reedrice9.workers.dev'))throw Error('origin');return u.origin;}
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function mount(host){if(!host)return;const S=root.STR.kalshiPrivate;host.className='card';host.replaceChildren(node('h3',S.title),node('p',S.privacy,'muted small'));let saved;try{saved=root.Store.getKalshiConnection();}catch{}let origin;try{origin=saved?personalOrigin(saved):null;}catch{}
 const link=(text,url)=>{const a=node('a',text,'btn btn-sm');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 if(origin){const actions=node('div',undefined,'row');actions.append(link(S.open,origin));const remove=node('button',S.remove,'btn btn-sm');remove.type='button';remove.onclick=()=>{root.Store.setKalshiConnection(null);mount(host);};actions.append(remove);host.append(actions,node('p',origin,'muted small'));
  const frame=node('iframe');frame.src=origin+'/';frame.title=S.frame;frame.className='kalshi-private-frame';frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');host.append(frame,node('p',S.storage,'muted small'));return;
 }
 const steps=node('ol');for(const text of S.steps)steps.append(node('li',text));host.append(steps,link(S.deploy,DEPLOY));
 const form=node('form'),label=node('label',S.url),url=node('input');url.type='url';url.required=true;url.placeholder='https://private-kalshi-tracker.your-account.workers.dev';url.autocomplete='off';label.append(url);
 const verify=node('label',undefined,'kalshi-owner-check'),owned=node('input');owned.type='checkbox';owned.required=true;verify.append(owned,document.createTextNode(S.owned));
 const submit=node('button',S.connect,'btn btn-primary');submit.type='submit';const status=node('p','','muted small');status.setAttribute('role','status');form.append(label,verify,submit,status);form.onsubmit=e=>{e.preventDefault();try{if(!owned.checked)return;const origin=personalOrigin(url.value.trim());root.Store.setKalshiConnection(origin);mount(host);}catch{status.textContent=S.invalid;}};host.append(form);
}
return {mount,personalOrigin};});
