import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const target=Object.freeze({account:'3dadd336c63ba88092f6a6131544744d',project:'liaoye-reading',database:'9357071d-036a-4595-b4bd-90a148f850bb',domain:'https://liaoye.veynuq.com',repository:'Frog1205/liaoye-reading-club'});
const requiredSecrets=['ADMIN_PASSWORD_HASH','ADMIN_PASSWORD_SALT','OPERATOR_PASSWORD_HASH','OPERATOR_PASSWORD_SALT'];
const invariant=(condition,message)=>{if(!condition)throw new Error(message);};
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');

export function validateConfig(config){
  invariant(config.name===target.project,'Unexpected Pages project in configuration');
  invariant(config.pages_build_output_dir==='dist','Unexpected build output directory');
  invariant(config.d1_databases?.length===1&&config.d1_databases[0].binding==='DB'&&config.d1_databases[0].database_id===target.database,'Existing D1 binding must not be changed');
  invariant(requiredSecrets.every(k=>!(k in (config.vars||{}))),'Authentication secrets must stay in Cloudflare, outside source configuration');
}

export function snapshotProject(project){
  invariant(project.name===target.project&&project.production_branch==='main','Unexpected production project or branch');
  invariant(project.domains?.includes(new URL(target.domain).hostname),'Existing custom domain is missing');
  const production=project.deployment_configs?.production;
  const db=production?.d1_databases;
  invariant(db?.DB?.id===target.database&&Object.keys(db).length===1,'Existing production D1 binding differs');
  invariant(requiredSecrets.every(k=>production.env_vars?.[k]?.type==='secret_text'),'Existing password secrets are missing or no longer encrypted');
  return {configurationFingerprint:hash({env:production.env_vars,d1:db,domains:[...project.domains].sort()}),secretNames:requiredSecrets,database:db.DB.id};
}

export function assertPreserved(before,after){
  invariant(before.configurationFingerprint===after.configurationFingerprint,'Production variables, password secret configuration, D1 binding or domains changed; stop and investigate');
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function getProject(){
  invariant(process.env.CLOUDFLARE_ACCOUNT_ID===target.account,'Missing or incorrect Cloudflare account');
  invariant(Boolean(process.env.CLOUDFLARE_API_TOKEN),'Missing deployment credential');
  const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/pages/projects/${target.project}`,{headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(20000)});
  const data=await r.json();
  invariant(r.ok&&data.success,`Cloudflare project lookup failed (${r.status})`);
  return data.result;
}
async function publicJson(path){
  const r=await fetch(`${target.domain}${path}${path.includes('?')?'&':'?'}revision=${process.env.GITHUB_SHA}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  invariant(r.ok,`Live verification request failed (${r.status})`);
  return r.json();
}
async function run(mode){
  invariant(process.env.GITHUB_REPOSITORY===target.repository&&process.env.GITHUB_REF==='refs/heads/main','Only this repository main branch can deploy');
  invariant(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||''),'Missing valid deployment commit');
  if(mode==='stamp'){
    await writeFile('dist/deployment.json',JSON.stringify({commit:process.env.GITHUB_SHA,builtAt:new Date().toISOString()}));
    return;
  }
  const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));validateConfig(config);
  const project=await getProject(),snapshot=snapshotProject(project);
  if(mode==='before'){
    await mkdir('artifacts',{recursive:true});
    await writeFile('artifacts/ci-preservation-before.json',JSON.stringify(snapshot));
    console.log('Existing project, D1 binding, custom domain and four password secrets verified. No configuration or database changes requested.');
    return;
  }
  invariant(mode==='after','Expected stamp, before or after mode');
  assertPreserved(JSON.parse(await readFile('artifacts/ci-preservation-before.json','utf8')),snapshot);
  let live=false;
  for(let attempt=0;attempt<24;attempt++){
    try{const build=await publicJson('/deployment.json');if(build.commit===process.env.GITHUB_SHA){live=true;break;}}catch{}
    await sleep(5000);
  }
  invariant(live,'Custom domain has not served this deployment revision yet');
  const health=await publicJson('/api/health');invariant(health.ok&&health.storage==='D1','Live D1-backed health check failed');
  const state=await publicJson('/api/state');invariant(Array.isArray(state.content)&&state.admin===false&&state.adminRole===null,'Public state verification failed');
  const result={commit:process.env.GITHUB_SHA,domain:target.domain,configurationPreserved:true,databaseBindingPreserved:true,passwordSecretConfigurationPreserved:true,publicContent:state.content.length,verifiedAt:new Date().toISOString()};
  await writeFile('artifacts/ci-preservation-after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### Production deployment verified\n\n- Site: ${target.domain}\n- Commit: \`${process.env.GITHUB_SHA}\`\n- Existing D1 binding and password secret configuration preserved.\n- No schema, seed, password update or database write commands in the workflow.\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
