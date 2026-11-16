import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupBook, validateQuery} from './lookup-core.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DOCS=path.resolve(HERE,'..','docs');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export function createLookupServer({port=8767,lookup=lookupBook,docs=DOCS}={}) {
  let active=0;
  return http.createServer(async(req,res)=>{
    const host=req.headers.host||'';
    const origin=req.headers.origin;
    const allowedOrigin=origin&&['https://xhc144.github.io',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin);
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)||(origin&&!allowedOrigin)){send(403,{status:'unavailable',items:[],own:false});return;}
    if(allowedOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{send(400,{status:'unavailable',items:[],own:false});return;}
    if(url.pathname==='/api/health'&&req.method==='GET'){send(200,{ready:true});return;}
    if(url.pathname==='/api/check'||url.pathname==='/translations/api/check'){
      if(req.method!=='POST'){send(405,{status:'unavailable',items:[],own:false});return;}
      if(active>=2){send(429,{status:'unavailable',items:[],own:false});return;}
      try{
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048)throw new Error('invalid_request');}
        const payload=JSON.parse(body);const query=payload.query??payload.q;validateQuery(query);active++;
        try{send(200,await lookup(query));}finally{active--;}
      }catch{send(400,{status:'unavailable',items:[],own:false});}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){send(405,{status:'unavailable',items:[],own:false});return;}
    if(url.pathname==='/translations/config.js'){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
      res.end('globalThis.BOOK_LOOKUP_CONFIG = {serviceUrl:""};\n');return;
    }
    try{
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let target=path.resolve(docs,relative||'index.html');
      if(!target.startsWith(path.resolve(docs)+path.sep))throw new Error('invalid_path');
      if((await fs.stat(target)).isDirectory())target=path.join(target,'index.html');
      const actual=await fs.realpath(target);
      if(!actual.startsWith(await fs.realpath(docs)+path.sep))throw new Error('invalid_path');
      const type=MIME[path.extname(actual).toLowerCase()];if(!type)throw new Error('invalid_path');
      const bytes=await fs.readFile(actual);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.BOOK_LOOKUP_PORT||8767);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid_port');
  let ownBooks=[];try{ownBooks=JSON.parse(await fs.readFile(path.join(DOCS,'translations','books.json'),'utf8')).books||[];}catch{}
  let adapter;let lookup=query=>lookupBook(query,{ownBooks});
  if(process.env.BOOK_LOOKUP_USE_MCP==='1'){
    const {LocalMcpLookup}=await import('./mcp-adapter.mjs');adapter=new LocalMcpLookup();lookup=query=>adapter.lookup(query);
  }
  const server=createLookupServer({port,lookup});
  server.listen(port,'127.0.0.1',()=>process.stdout.write(`Book lookup ready at http://127.0.0.1:${port}/translations/\n`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();adapter?.close().finally(()=>process.exit(0));if(!adapter)process.exit(0);});
}
