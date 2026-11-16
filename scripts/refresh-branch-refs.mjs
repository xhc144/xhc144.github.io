// Refresh only the existence of branches in repositories already selected by
// this catalog. Existing content audits and file statistics remain dated.
// Usage: node scripts/refresh-branch-refs.mjs [--json private-report.json]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const scanFile=path.join(root,'data/scan.json');
const siteFile=path.join(root,'data/repositories.json');
const scan=JSON.parse(fs.readFileSync(scanFile,'utf8'));
const site=JSON.parse(fs.readFileSync(siteFile,'utf8'));
const jsonIndex=process.argv.indexOf('--json');
if(jsonIndex>=0&&!process.argv[jsonIndex+1])throw new Error('--json requires an output filename');

async function gh(endpoint,paginate=false){
  let last;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const args=['api',endpoint,...(paginate?['--paginate','--slurp']:[])];
      const {stdout}=await run('gh',args,{encoding:'utf8',maxBuffer:16*1024*1024});
      const data=JSON.parse(stdout);
      return paginate?data.flat():data;
    }catch(error){
      last=error;
      if(/HTTP 40[134]/.test(String(error.stderr||error.message)))break;
      await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
  }
  throw new Error('Branch reference refresh failed: '+endpoint+' '+String(last.stderr||last.message).slice(0,200));
}

const queue=Object.entries(scan.repos);
const results=new Array(queue.length);
let next=0;
await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
  while(next<queue.length){
    const index=next++;
    const [full,repo]=queue[index];
    const branches=await gh(`repos/${full}/branches?per_page=100`,true);
    if(!branches.length)throw new Error('Refusing to replace a repository with an empty branch response: '+full);
    let defaultBranch=repo.defaultBranch;
    if(!branches.some(branch=>branch.name===defaultBranch))defaultBranch=(await gh(`repos/${full}`)).default_branch;
    if(!branches.some(branch=>branch.name===defaultBranch))throw new Error('Default branch absent from response: '+full);
    results[index]={full,defaultBranch,branches};
    console.log(full+': '+branches.length+' current branches');
  }
}));

// Do not mutate either tracked data file unless all repositories were read.
const checkedAt=new Date().toISOString();
const changes=[];
for(const {full,defaultBranch,branches}of results){
  const repo=scan.repos[full];
  const old=new Map(repo.branches.map(branch=>[branch.name,branch]));
  const live=new Set(branches.map(branch=>branch.name));
  const removed=repo.branches.filter(branch=>!live.has(branch.name)).map(branch=>branch.name);
  const added=branches.filter(branch=>!old.has(branch.name)).map(branch=>branch.name);
  repo.defaultBranch=defaultBranch;
  repo.branches=branches.map(branch=>{
    const prior=old.get(branch.name);
    if(prior)return {...prior,isDefault:branch.name===defaultBranch};
    return {name:branch.name,sha:branch.commit.sha,isDefault:branch.name===defaultBranch,
      ...(branch.name===defaultBranch?{}:{state:'unchecked'})};
  });
  const curated=site.repos.find(entry=>entry.full===full);
  const removedNotes=[];
  if(curated?.branchNotes){
    for(const name of Object.keys(curated.branchNotes)){
      if(!live.has(name)){removedNotes.push(name);delete curated.branchNotes[name];}
    }
    if(!Object.keys(curated.branchNotes).length)delete curated.branchNotes;
  }
  changes.push({repository:full,liveBranches:branches.length,removed,added,removedNotes});
}
scan.branchRefsCheckedAt=checkedAt;
fs.writeFileSync(scanFile,JSON.stringify(scan,null,2)+'\n');
fs.writeFileSync(siteFile,JSON.stringify(site,null,2)+'\n');
const report={checkedAt,fileStatisticsScannedAt:scan.scannedAt,repositories:changes.length,
  removed:changes.reduce((n,r)=>n+r.removed.length,0),added:changes.reduce((n,r)=>n+r.added.length,0),changes};
if(jsonIndex>=0)fs.writeFileSync(process.argv[jsonIndex+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checkedAt,repositories:report.repositories,removed:report.removed,added:report.added,fileStatisticsScannedAt:scan.scannedAt}));
