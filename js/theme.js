/* Per-device appearance only. No network, account data, timers or backend changes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MibTheme=api;api.apply(root.Store,root.document);}})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const schemes=['ocean','violet','teal','custom'];
  const properties=['--canvas','--accent','--focus-ring','--action-fill','--action-text','--selection-fill','--scrim','--text-primary','--text-secondary','--surface-glass','--surface-border','--track'];
  const validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const luminance=c=>rgb(c).map(n=>{const v=n/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  function palette(canvas,accent){
    if(!validColor(canvas)||!validColor(accent))return null;
    const light=luminance(canvas)>.179,primary=light?'#000000':'#FFFFFF',secondary=light?'#263244':luminance(canvas)>.04?'#D7DEE8':'#8E9AA8';
    const channels=rgb(accent).join(', '),shade=light?'0, 0, 0':'255, 255, 255';
    return {'--canvas':canvas,'--accent':accent,'--focus-ring':accent,'--action-fill':accent,'--action-text':luminance(accent)>.179?'#000000':'#FFFFFF','--selection-fill':'rgba('+channels+', 0.14)','--scrim':'rgba('+rgb(canvas).join(', ')+', 0.76)','--text-primary':primary,'--text-secondary':secondary,'--surface-glass':'rgba('+shade+', 0.03)','--surface-border':'rgba('+shade+', 0.05)','--track':'rgba('+shade+', 0.1)'};
  }
  function apply(store,doc){
    if(!store||!doc)return;
    const p=store.getPrefs(),scheme=schemes.includes(p.colorScheme)?p.colorScheme:'ocean',el=doc.documentElement;
    properties.forEach(k=>el.style.removeProperty(k));el.dataset.colorScheme=scheme;
    const custom=scheme==='custom'&&palette(p.customCanvas,p.customAccent);
    if(custom)Object.entries(custom).forEach(([k,v])=>el.style.setProperty(k,v));
    const meta=doc.querySelector('meta[name="theme-color"]');if(meta)meta.content=getComputedStyle(el).getPropertyValue('--canvas').trim();
  }
  return {schemes,validColor,luminance,palette,apply};
});
