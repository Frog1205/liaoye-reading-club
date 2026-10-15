// Uses existing Wrangler OAuth authorization; never outputs credentials.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {passwordHash} from './worker.mjs';
const config=await readFile(join(homedir(),'AppData/Roaming/xdg.config/.wrangler/config/default.toml'),'utf8');
const token=process.env.CLOUDFLARE_API_TOKEN||/oauth_token\s*=\s*"([^"]+)"/.exec(config)?.[1];
if(!token)throw new Error('Wrangler authorization missing');
const account='3dadd336c63ba88092f6a6131544744d',project='liaoye-reading';
async function api(path,method='GET',body){let last;for(let i=0;i<3;i++){try{const res=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});const data=await res.json();if(!data.success)throw new Error(JSON.stringify(data.errors));return data.result;}catch(e){last=e;if(!['GET','PATCH'].includes(method)&&!path.includes('/query'))throw e;}}throw last;}
const base=`/accounts/${account}/pages/projects/${project}`;
const cmd=process.argv[2];
if(cmd==='schema')console.log(JSON.stringify(await api(`/accounts/${account}/d1/database/9357071d-036a-4595-b4bd-90a148f850bb/query`,'POST',{sql:await readFile('cloud/schema.sql','utf8')})));
if(cmd==='migrate-roles'){
 const path=`/accounts/${account}/d1/database/9357071d-036a-4595-b4bd-90a148f850bb/query`;
 const result=await api(path,'POST',{sql:"SELECT name FROM sqlite_master WHERE type='table' AND name='management_sessions'"});
 if(result[0].results.length===0)await api(path,'POST',{sql:await readFile('cloud/migrations/0002-management-roles.sql','utf8')});
 console.log('Management session role migration ready.');
}
if(cmd==='create'){
  let existing;try{existing=await api(base);}catch{}
  if(!existing)existing=await api(`/accounts/${account}/pages/projects`,'POST',{name:project,production_branch:'main'});
  console.log(JSON.stringify({name:existing.name,subdomain:existing.subdomain}));
}
if(cmd==='secrets'){
  const {adminPassword}=JSON.parse(await readFile('data/local-access.json','utf8'));
  const salt=crypto.randomUUID(),digest=await passwordHash(adminPassword,salt);
  const vars={ADMIN_PASSWORD_HASH:{type:'secret_text',value:digest},ADMIN_PASSWORD_SALT:{type:'secret_text',value:salt},ALLOWED_HOSTS:{type:'plain_text',value:'liaoye.veynuq.com,liaoye-reading.pages.dev'},LIAOYE_TIMEZONE:{type:'plain_text',value:'America/Los_Angeles'}};
  try{
    const {operatorPassword}=JSON.parse(await readFile('data/operator-access.json','utf8'));
    if(!operatorPassword||operatorPassword===adminPassword)throw new Error('Operator password must be set and differ from super admin.');
    const operatorSalt=crypto.randomUUID();
    vars.OPERATOR_PASSWORD_HASH={type:'secret_text',value:await passwordHash(operatorPassword,operatorSalt)};
    vars.OPERATOR_PASSWORD_SALT={type:'secret_text',value:operatorSalt};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  await api(base,'PATCH',{deployment_configs:{production:{env_vars:vars,d1_databases:{DB:{id:'9357071d-036a-4595-b4bd-90a148f850bb'}}},preview:{env_vars:vars,d1_databases:{DB:{id:'9357071d-036a-4595-b4bd-90a148f850bb'}}}}});
  console.log('Production D1 binding and hashed admin authentication configured.');
}
if(cmd==='domain')console.log(JSON.stringify(await api(base+'/domains','POST',{name:'liaoye.veynuq.com'})));
if(cmd==='retry-domain')console.log(JSON.stringify(await api(base+'/domains/liaoye.veynuq.com','PATCH')));
if(cmd==='status'){const p=await api(base);console.log(JSON.stringify({name:p.name,subdomain:p.subdomain,domains:p.domains,latest:p.latest_deployment?.url,binding:p.deployment_configs?.production?.d1_databases}));console.log(JSON.stringify(await api(base+'/domains')));}
if(cmd==='seed'){
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync('data/liaoye.sqlite',{readOnly:true});
  const rows=db.prepare('SELECT * FROM content').all();
  const statements=rows.map(r=>({sql:'INSERT OR IGNORE INTO content VALUES(?,?,?,?,?,?,?,?,?)',params:[r.id,r.kind,r.status,r.data,r.source,r.source_label,r.demo,r.created_at,r.updated_at]}));
  for(const statement of statements)await api(`/accounts/${account}/d1/database/9357071d-036a-4595-b4bd-90a148f850bb/query`,'POST',statement);
  db.close();console.log(`Migrated ${rows.length} content items; no local sessions, questionnaires, or keys transferred.`);
}
