import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import Theme from '../js/theme.js';
test('custom palette only accepts complete hex colors; foreground follows brightness',()=>{
 assert.equal(Theme.palette('url(https://bad.test)','#ffffff'),null);
 assert.equal(Theme.palette('#ffffff','red;display:none'),null);
 assert.equal(Theme.palette('#ffffff','#eeeeee')['--text-primary'],'#000000');
 assert.equal(Theme.palette('#0A0E17','#112233')['--text-primary'],'#FFFFFF');
 assert.equal(Theme.palette('#0A0E17','#ffffff')['--action-text'],'#000000');
});
function browser(saved=new Map()){
 const vars=new Map(),html={dataset:{},style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)}},meta={};
 const doc={documentElement:html,querySelector:()=>meta};
 const context={window:{document:doc},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},getComputedStyle:()=>({getPropertyValue:k=>vars.get(k)||'#0A0E17'}),crypto:{randomUUID:()=> 'test'}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/storage.js','utf8'),context);vm.runInContext(fs.readFileSync('js/theme.js','utf8'),context);return {context,saved,vars,html,meta};
}
test('saved scheme survives a fresh page without touching account data',()=>{
 const a=browser();assert.equal(a.html.dataset.colorScheme,'aurora');
 a.context.window.Store.setPrefs({colorScheme:'violet'});
 const b=browser(a.saved);assert.equal(b.html.dataset.colorScheme,'violet');
 assert.deepEqual([...b.saved.keys()],['betdash_prefs']);
});
test('switching away from custom clears overrides and rejects unknown scheme ids',()=>{
 const b=browser(),s=b.context.window.Store,t=b.context.window.MibTheme;
 s.setPrefs({colorScheme:'custom',customCanvas:'#f0f4fa',customAccent:'#2468ab'});t.apply(s,b.context.window.document);
 assert.equal(b.vars.get('--canvas'),'#f0f4fa');
 s.setPrefs({colorScheme:'teal'});t.apply(s,b.context.window.document);assert.equal(b.vars.size,0);assert.equal(b.html.dataset.colorScheme,'teal');
 s.setPrefs({colorScheme:'invalid'});t.apply(s,b.context.window.document);assert.equal(b.html.dataset.colorScheme,'aurora');
});


test('Aurora is available and an explicit existing Ocean preference is preserved',()=>{
 assert.ok(Theme.schemes.includes('aurora'));
 const a=browser();a.context.window.Store.setPrefs({colorScheme:'ocean'});
 assert.equal(browser(a.saved).html.dataset.colorScheme,'ocean');
});
test('custom colorways opt out of decorative background layers',()=>{
 const css=fs.readFileSync('css/theme.css','utf8');
 assert.match(css,/:root\[data-color-scheme="custom"\]\s*\{\s*--canvas-atmosphere: none;/);
 assert.match(css,/background-image: var\(--canvas-atmosphere\)/);
});
