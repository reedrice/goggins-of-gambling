import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=process.argv[2];
if(!out||!path.isAbsolute(out))throw Error('Provide an absolute output folder');
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw Error('Output folder must be empty; existing files preserved');
fs.mkdirSync(out,{recursive:true});
for(const f of ['manifest.json','background.js','network.js','bootstrap.js','panel.html','README.md'])fs.copyFileSync(path.join(root,'extensions/kalshi-desktop',f),path.join(out,f));
for(const f of ['strings.js','vault.js','kalshi-sync.js','style.css'])fs.copyFileSync(path.join(root,'kalshi-private-relay/public',f),path.join(out,f));
fs.appendFileSync(path.join(out,'style.css'),'\nbody{max-width:960px;margin:auto}header{padding:12px 16px}input,textarea{max-width:100%}\n');
console.log('Built private extension prototype: '+out);
