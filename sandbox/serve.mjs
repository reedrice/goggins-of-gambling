import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  let name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(name.split('/').some(x=>x.startsWith('.'))){res.writeHead(403);res.end();return;}
  const file=fs.realpathSync(path.resolve(root,'.'+(name==='/'?'/index.html':name)));
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()){res.writeHead(403);res.end();return;}
  let body=fs.readFileSync(file);
  if(path.extname(file)==='.html')body=Buffer.from(body.toString().replace(/<head([^>]*)>/i,'<head$1><script src="/sandbox/guard.js"></script>'));
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':body.length});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(8877,'127.0.0.1',()=>console.log('Brandon Picks sandbox: http://127.0.0.1:8877/#picks (Ctrl+C to stop)'));
