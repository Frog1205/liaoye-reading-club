import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'https://liaoye-reading.pages.dev';
const {adminPassword}=JSON.parse(await readFile('data/local-access.json','utf8'));
let cookie,key,draft;
async function call(path,method='GET',body,bearer){let response;for(let i=0;i<3;i++){try{response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Liaoye-Action':'1',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});break;}catch(e){if(method!=='GET'||i===2)throw e;}}const data=await response.json();return{status:response.status,data,headers:response.headers};}
const health=await call('/api/health');assert.equal(health.status,200);assert.equal(health.data.storage,'D1');
const login=await call('/api/admin/login','POST',{password:adminPassword});assert.equal(login.status,200,JSON.stringify(login.data));assert.match(login.headers.get('set-cookie'),/Secure/);assert.match(login.headers.get('set-cookie'),/HttpOnly/);cookie=login.headers.get('set-cookie').split(';')[0];
try{
  const before=await call('/api/state');assert.equal(before.data.admin,true);
  const created=await call('/api/admin/keys','POST',{name:'部署自检（验证后撤销）'});assert.equal(created.status,201);key=created.data;
  const submitted=await call('/api/agent/drafts','POST',{kind:'note',data:{title:'【部署自检】云端草稿持久化验证',bookTitle:'系统自检，不作为书评',author:'部署检查',body:'这是一条部署自检内容，用于验证云端数据库、智能体令牌和人工审核边界，验证后退回，不作为社群真实分享。'}},key.key);assert.equal(submitted.status,201);draft=submitted.data;assert.equal(draft.status,'pending');
  const publicState=await call('/api/state');assert.ok(!publicState.data.content.some(c=>c.id===draft.id));
  const dashboard=await call('/api/admin/dashboard');assert.ok(dashboard.data.pending.some(c=>c.id===draft.id));
  await call(`/api/admin/content/${draft.id}/reject`,'POST');
  await call(`/api/admin/keys/${key.id}`,'DELETE');
  const revoked=await call('/api/agent/content','GET',undefined,key.key);assert.equal(revoked.status,401);
  const report={base,health:200,storage:'D1',adminLogin:200,secureCookie:true,publicContent:publicState.data.content.length,agentDraft:201,draftPersisted:true,draftNotPublic:true,draftRejected:true,revokedToken:401,checkedAt:new Date().toISOString()};await writeFile('artifacts/cloud-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await call('/api/admin/logout','POST');}
