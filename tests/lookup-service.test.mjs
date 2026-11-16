import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chineseEvidence, publicItem, catalogRecords, lookupBook, validateQuery, parseLibgen, recordMatches} from '../server/lookup-core.mjs';
import {createLookupServer} from '../server/http-server.mjs';
import http from 'node:http';
import {once} from 'node:events';

const response = data => ({ok:true, headers:new Headers(), json:async()=>data, text:async()=>String(data)});

test('response body is bounded by the provider timeout', async () => {
  const started=Date.now();
  const stalled=async()=>({ok:true,status:200,headers:new Headers(),json:()=>new Promise(()=>{}),text:()=>new Promise(()=>{})});
  const result=await lookupBook('从未收录的查询',{fetchImpl:stalled,timeoutMs:20,includeAlternates:false});
  assert.equal(result.status,'unavailable');
  assert(Date.now()-started<2000);
});
test('English reprints mislabelled Chinese are rejected', () => {
  assert.equal(chineseEvidence({title:'数学分析原理 英文版',language:'Chinese'}),'no');
  assert.equal(chineseEvidence({title:'数学分析原理',language:'Chinese'}),'yes');
  assert.equal(chineseEvidence({title:'Topology',language:'Chinese'}),'uncertain');
  assert.equal(chineseEvidence({title:'SGA 3',path:'zh-CN/sga3.pdf'}),'yes');
});
test('public metadata contains exactly title, edition, year', () => {
  const item=publicItem({title:'数学分析原理 第3版',edition:'3',year:'2004',source:'private',url:'secret',author:'A'});
  assert.deepEqual(item,{title:'数学分析原理 第3版',edition:'3',year:'2004'});
  assert.equal(publicItem({title:'数学分析原理 第3版 — Z-Library https://example.com'}).title,'数学分析原理 第3版');
  assert.equal(publicItem({title:"数学分析原理 [Anna’s Archive]"}).title,'数学分析原理');
});
test('catalog ignores ZIP and source files, keeps separately translated versions', () => {
  const books=catalogRecords({native_zh:[{book:'SGA 3',part:'前半',path:'zh-CN/sga3.pdf'}, {book:'source',path:'zh-CN/sga3.tex'}],native_zh_bundles:[{path:'all.zip'}]});
  assert.equal(books.length,1); assert.equal(books[0].title,'SGA 3 · 前半');
  assert.equal(books[0].own,true);
  assert.equal(catalogRecords({official_zh:[{label:'EGA I',path:'zh-CN/official/ega.pdf'}]})[0].own,false);
});
test('a new live title outside the local 65 records can be found without credentials', async () => {
  const calls=[];
  const result=await lookupBook('未收录新书',{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return String(url).includes('/eapi/') ? response({success:1,books:[{title:'未收录新书 第2版',language:'Chinese',year:'2025'}]}) : response({});
  }});
  assert.equal(result.status,'found'); assert.equal(result.items[0].year,'2025');
  assert.equal(result.own,false); assert(calls.every(call=>!call.options?.headers?.Cookie));
  assert(!JSON.stringify(result).includes('source'));
});
test('provider failure is never a negative answer', async () => {
  assert.equal((await lookupBook('不存在的书',{fetchImpl:async()=>{throw new Error('private error');}})).status,'unavailable');
  const result=await lookupBook('不存在的书',{fetchImpl:async(url)=>String(url).includes('/eapi/')?response({success:1,books:[]}):String(url).includes('raw.githubusercontent')?response({}):response('0 results')});
  assert.equal(result.status,'not_found');
});
test('title language without matching identity stays uncertain or negative', async () => {
  const result=await lookupBook('Topology',{includeAlternates:false,fetchImpl:async(url)=>String(url).includes('/eapi/')?response({success:1,books:[{title:'Topology',language:'Chinese'}]}):response({})});
  assert.equal(result.status,'uncertain');
});
test('invalid query length and valid multiword queries',()=>{
  assert.throws(()=>validateQuery('a'));
  assert.equal(validateQuery('  SGA 3  '),'SGA 3');
});
test('author-name collision alone cannot establish book identity',()=>{
  assert.equal(recordMatches({title:'unrelated book',author:'Rudin'},'Rudin'),false);
  assert.equal(recordMatches({title:'数学分析原理',author:'Walter Rudin'},'Rudin 数学分析原理'),true);
  assert.equal(publicItem({title:'数学分析原理',edition:'2004',year:'2004'}).edition,'');
});
test('owned manuscript lookup is immediate and GTM numbers match exactly',async()=>{
  const rows=[{id:'GTM-005',series:'GTM 5',title:'范畴论',translation:{}},{id:'GTM-052',series:'GTM 52',title:'代数几何',translation:{}}];
  const result=await lookupBook('GTM 005',{ownBooks:rows,fetchImpl:async()=>{throw new Error('must not fetch');}});
  assert.equal(result.status,'found');assert.equal(result.own,true);assert.equal(result.items.length,1);assert.equal(result.items[0].title,'范畴论');
});
test('an archived published Chinese edition is not a personal manuscript',async()=>{
  const result=await lookupBook('参考书',{ownBooks:[{title:'参考书',ownedChineseEdition:true}],includeAlternates:false,fetchImpl:async(url)=>String(url).includes('/eapi/')?response({success:1,books:[]}):response({})});
  assert.equal(result.status,'found');assert.equal(result.own,false);
});
test('anonymous API must explicitly report success',async()=>{
  const result=await lookupBook('未确认书',{includeAlternates:false,fetchImpl:async(url)=>String(url).includes('/eapi/')?response({books:[]}):response({})});
  assert.equal(result.status,'unavailable');
});
test('LibGen parser reads bibliographic cells rather than mirror labels',()=>{
  const html='<tr><td><a href="edition.php?id=1">数学分析</a></td><td>Rudin</td><td>Pub</td><td>2004</td><td>Chinese</td><td>x</td><td>5MB</td><td>pdf</td><td><a href="ads.php?md5=0123456789abcdef0123456789abcdef">1</a></td></tr>';
  const rows=parseLibgen(html);assert.equal(rows[0].title,'数学分析');assert.equal(rows[0].language,'Chinese');
});
test('local HTTP serves only docs and a bounded origin-checked query API',async()=>{
  const seen=[];
  const server=createLookupServer({lookup:async query=>{seen.push(query);return {status:'found',items:[{title:query,edition:'2',year:'2025'}],own:false};}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const actualPort=server.address().port;
  const request=(path,{method='GET',body='',origin='http://127.0.0.1:8767',host='127.0.0.1:8767'}={})=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:actualPort,path,method,headers:{Host:host,Origin:origin,'Content-Type':'application/json'}},res=>{let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:data}));});req.on('error',reject);req.end(body);
  });
  try{
    assert.equal((await request('/api/health')).status,200);
    assert.equal((await request('/translations/')).status,200);
    assert((await request('/translations/config.js')).body.includes('serviceUrl:""'));
    const found=await request('/api/check',{method:'POST',body:JSON.stringify({query:'新书查询'})});
    assert.equal(JSON.parse(found.body).status,'found');assert.deepEqual(seen,['新书查询']);
    assert.equal(JSON.parse((await request('/api/check',{method:'POST',body:JSON.stringify({q:'别名参数'})})).body).status,'found');
    assert.equal((await request('/api/check',{method:'POST',body:'{}'})).status,400);
    assert.equal((await request('/api/check',{method:'POST',body:JSON.stringify({query:'a'.repeat(3000)})})).status,400);
    assert.equal((await request('/api/check',{method:'POST',origin:'https://example.com',body:JSON.stringify({query:'新书'})})).status,403);
    assert.equal((await request('/api/health',{host:'evil.example'})).status,403);
    assert.equal((await request('/..%2fAGENTS.md')).status,404);
    assert.equal((await request('/server/lookup-core.mjs')).status,404);
  }finally{server.close();await once(server,'close');}
});
