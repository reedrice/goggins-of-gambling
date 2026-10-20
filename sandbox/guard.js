// Loaded before all application scripts by the sandbox server only.
(() => {
 const fetchRead=window.fetch.bind(window);
 window.fetch=(input,options={})=>{
  const method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!['GET','HEAD'].includes(method))return Promise.reject(new Error('Sandbox: external writes are disabled'));
  return fetchRead(input,options);
 };
 const open=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,...rest){
  if(!['GET','HEAD'].includes(String(method).toUpperCase()))throw new Error('Sandbox: external writes are disabled');
  return open.call(this,method,...rest);
 };
 navigator.sendBeacon=()=>false;
 document.addEventListener('submit',event=>event.preventDefault(),true);
 document.addEventListener('DOMContentLoaded',()=>{
  const notice=document.createElement('div');notice.textContent='BRANDON SANDBOX - local test data and storage - shared writes disabled';
  notice.style.cssText='background:#ffe066;color:#111;padding:10px;text-align:center;font:600 13px system-ui;position:relative;z-index:10000';
  document.body.prepend(notice);
 });
})();
