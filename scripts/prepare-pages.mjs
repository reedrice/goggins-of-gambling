#!/usr/bin/env node
// Only public, tracked static assets enter the Pages artifact. Never package local vaults/cache.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const base=process.cwd(),out=path.join(base,'.cache/pages');
fs.mkdirSync(out,{recursive:true});
const files=execFileSync('git',['ls-files','-z','--','index.html','config.js','version.json','.nojekyll','js','css','data'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){if(file.startsWith('data/archive/'))continue;const src=path.join(base,file),dest=path.join(out,file);if(!fs.lstatSync(src).isFile())throw Error('Not a regular static file: '+file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
console.log('Prepared '+files.length+' tracked public assets. No local cache, credentials or private accounts.');

