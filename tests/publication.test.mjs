import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mayPublishMetadata,selectPublishedRepositories} from '../scripts/publication-policy.mjs';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
assert.equal(mayPublishMetadata('example/new-public',{private:false}),true);
assert.equal(mayPublishMetadata('example/new-private',{private:true}),false);
assert.equal(mayPublishMetadata('example/unknown',{}),false);
assert.equal(mayPublishMetadata('xhc144-notes/ai-study-notes',{private:true}),true);
assert.deepEqual(Object.keys(selectPublishedRepositories({
  'example/public':{private:false},'example/private':{private:true}
})),['example/public']);
const forbidden=['course-materials','yupin-lecture-notes','tsinghua-math-exams','qiuzhen-supplementary-library'];
for(const file of ['data/repositories.json','data/scan.json','docs/materials/catalog.json','docs/index.html','docs/repos/index.html','README.md']){
  const body=read(file);
  for(const value of forbidden) assert(!body.includes(value),file+' must not disclose removed archive navigation');
}
for(const file of ['docs/index.html','docs/repos/index.html','docs/materials/index.html','README.md']){
  const body=read(file);
  assert(!/私有|有权限的|按可见性筛选/.test(body),file+' has no private markers');
  assert(body.includes('translations/'),file+' links to book translation search');
}
const catalog=JSON.parse(read('docs/materials/catalog.json'));
for(const value of ['清北学堂模拟卷','深圳中学试卷','阮禾课堂讲义系列']) assert(!read('docs/materials/app.js').includes(value),'no removed archive quick entries');
assert(!catalog.repositories.some(repo=>repo.id==='course-materials'));
assert(!catalog.navigation.sections.some(section=>section.id==='papers'));
assert(catalog.repositories.flatMap(repo=>repo.items).filter(item=>item.kind==='PDF').length>200,'published lectures and books remain available');
console.log('Publication policy and generated public catalog checks passed');
