import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {classifyRecords, publicItem, validateQuery} from './lookup-core.mjs';

export class LocalMcpLookup {
  constructor({root=process.env.BOOK_LOOKUP_MCP_ROOT || path.join(os.homedir(),'.codex','mcp','zlibrary-mcp-complete-hardened')}={}) {
    this.root=root;this.client=null;this.starting=null;
  }
  async connect() {
    if(this.client)return this.client;
    if(this.starting)return this.starting;
    this.starting=(async()=>{
      const sdk=path.join(this.root,'node_modules','@modelcontextprotocol','sdk','dist','esm','client');
      const [{Client},{StdioClientTransport}]=await Promise.all([import(pathToFileURL(path.join(sdk,'index.js'))),import(pathToFileURL(path.join(sdk,'stdio.js')))]);
      const client=new Client({name:'book-lookup-service',version:'1.0.0'});
      const transport=new StdioClientTransport({command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.root,'launch-mcp.ps1')],cwd:this.root,stderr:'pipe'});
      // Keep launcher or provider diagnostics out of public HTTP responses.
      transport.stderr?.on('data',()=>{});
      await client.connect(transport,{timeout:20000});this.client=client;return client;
    })();
    try{return await this.starting;}finally{this.starting=null;}
  }
  async query(name,args) {
    const client=await this.connect();
    const response=await client.callTool({name,arguments:args},undefined,{timeout:45000});
    let payload=response.structuredContent;
    if(!payload)for(const entry of response.content||[])if(entry.type==='text'){
      try{payload=JSON.parse(entry.text);break;}catch{}
    }
    if(response.isError){
      const message=(response.content||[]).filter(entry=>entry.type==='text').map(entry=>entry.text).join(' ');
      // The current MCP throws this exact empty diagnostic for a successful zero-result catalog.
      if(name==='search_multi_source'&&/All selected sources failed:\s*["'}\s]*$/u.test(message))return [];
      throw new Error('provider_unavailable');
    }
    if(!Array.isArray(payload?.books))throw new Error('provider_unavailable');
    return payload.books;
  }
  async lookup(rawQuery) {
    const query=validateQuery(rawQuery);const probes=[];
    const probe=async(name,args)=>{
      try{const books=await this.query(name,args);const match=classifyRecords(books,query);const value={ok:true,...match,books};probes.push(value);return value;}
      catch{const value={ok:false,confirmed:[],uncertain:[],books:[]};probes.push(value);return value;}
    };
    await Promise.all([probe('search_books',{query,count:20,languages:['chinese']}),probe('search_multi_source',{query,count:20,source:'catalog'})]);
    if(!probes.some(result=>result.confirmed.length))await Promise.all(['libgen','annas'].map(source=>probe('search_multi_source',{query,count:20,source})));
    const confirmed=probes.flatMap(result=>result.confirmed);
    const uncertain=probes.flatMap(result=>result.uncertain);
    const items=(confirmed.length?confirmed:uncertain).map(publicItem).filter((item,index,all)=>all.findIndex(other=>JSON.stringify(other)===JSON.stringify(item))===index).slice(0,12);
    return {status:confirmed.length?'found':uncertain.length?'uncertain':probes.every(result=>result.ok)?'not_found':'unavailable',items,own:confirmed.some(book=>book.own===true||/\/zh-CN\/native-reconstruction\//i.test(String(book.url||book.local_path||'')))};
  }
  async close(){if(this.client){await this.client.close();this.client=null;}}
}
