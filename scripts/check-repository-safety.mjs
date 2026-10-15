// Fail closed. Reports filenames/rule names only; never prints matched secrets.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

const git=(...args)=>{try{return execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw new Error('Cannot read Git metadata; safety check stopped.');}};
const root=git('rev-parse','--show-toplevel').trim();
process.chdir(root);
const mode=process.argv[2]||'--staged';
if(!['--staged','--history'].includes(mode))throw new Error('Use --staged or --history.');

// The real local values remain local. They are used only as in-memory scan inputs.
const knownSecrets=[];
for(const name of ['data/local-access.json','data/operator-access.json']){
  const path=resolve(root,name);
  if(!existsSync(path))continue;
  let values;try{values=JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('Cannot read local credential input; safety check stopped.');}
  for(const [key,value]of Object.entries(values))if(/password|token|secret/i.test(key)&&typeof value==='string'&&value.length>=8)knownSecrets.push(value);
}
for(const name of ['.env','.dev.vars']){
  if(!existsSync(name))continue;
  for(const line of readFileSync(name,'utf8').split(/\r?\n/)){
    const m=/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if(m&&/PASSWORD|TOKEN|SECRET|API_KEY|PRIVATE_KEY/.test(m[1])){
      const value=m[2].replace(/^(['"])(.*)\1$/,'$2');
      if(value.length>=8)knownSecrets.push(value);
    }
  }
}

const forbiddenPath=path=>/(^|\/)(data|artifacts|node_modules|dist|\.wrangler|backups?|exports)(\/|$)/i.test(path)
  || /(^|\/)(local-access|operator-access|credentials)\.json$/i.test(path)
  || /(^|\/)\.(dev\.vars|npmrc|netrc)(\.|$)/i.test(path)
  || /(^|\/)\.env(?:\..*)?$/i.test(path)&&path.split('/').at(-1)!=='.env.example'
  || /\.(?:sqlite(?:3)?(?:-.*)?|db(?:-.*)?|pem|key|p12|pfx|log|dump|bak)$/i.test(path)
  || /\.sql$/i.test(path)&&path!=='cloud/schema.sql'&&!/^cloud\/migrations\//.test(path);

const patterns=[
  ['private-key',/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['agent-token',/\bly_[A-Za-z0-9_-]{40,}\b/],
  ['model-api-key',/\bsk-(?:proj-|ant-[A-Za-z0-9]+-)?[A-Za-z0-9_-]{24,}\b/],
  ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['slack-token',/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['credential-json',/"(?:adminPassword|operatorPassword|oauth_token|access_token|refresh_token|client_secret|api_key|key_hash|session_hash)"\s*:\s*"[^"\r\n]{12,}"/i],
  ['environment-secret',/^[ \t]*(?:LIAOYE_(?:ADMIN|OPERATOR)_PASSWORD|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)[ \t]*=[ \t]*[^\s#'"\r\n][^\r\n]{10,}$/m],
  ['sqlite-binary',/SQLite format 3\x00/],
];

const entries=[];
if(mode==='--staged'){
  for(const entry of git('ls-files','--stage','-z').split('\0').filter(Boolean)){
    const tab=entry.indexOf('\t'),header=entry.slice(0,tab).split(' '),path=entry.slice(tab+1);
    if(header[2]!=='0')throw new Error('Unresolved index entries; safety check stopped.');
    entries.push({path,ref:header[1]});
  }
}else{
  const unique=new Set();
  for(const commit of git('rev-list','--all').split('\n').filter(Boolean)){
    for(const entry of git('ls-tree','-r','-z',commit).split('\0').filter(Boolean)){
      const tab=entry.indexOf('\t'),header=entry.slice(0,tab).split(' '),path=entry.slice(tab+1);
      if(header[1]!=='blob')continue;
      const sha=header[2],key=path+'\0'+sha;
      if(unique.has(key))continue;
      unique.add(key);entries.push({path,ref:sha});
    }
  }
}
if(!entries.length)throw new Error('No repository files to scan; refusing an empty safety check.');
const findings=[];
let batch;try{batch=execFileSync('git',['cat-file','--batch'],{input:entries.map(e=>e.ref).join('\n')+'\n',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});}catch{throw new Error('Cannot read Git objects; safety check stopped.');}
let offset=0;
for(const {path}of entries){
  const newline=batch.indexOf(10,offset),header=batch.subarray(offset,newline).toString('utf8').split(' '),size=Number(header[2]);
  if(newline<offset||header[1]!=='blob'||!Number.isSafeInteger(size)||size<0||newline+size+2>batch.length)throw new Error('Unexpected Git object; safety check stopped.');
  const text=batch.subarray(newline+1,newline+1+size).toString('utf8');offset=newline+size+2;
  if(forbiddenPath(path)){findings.push({path,rule:'forbidden-file'});continue;}
  if(knownSecrets.some(secret=>text.includes(secret)))findings.push({path,rule:'known-local-secret'});
  for(const [rule,re]of patterns)if(re.test(text))findings.push({path,rule});
}
knownSecrets.length=0;
const result={mode,status:findings.length?'FAIL':'PASS',scannedFiles:entries.length,findings};
console.log(JSON.stringify(result,null,2));
if(findings.length)process.exitCode=1;
