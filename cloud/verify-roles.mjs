import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='https://liaoye.veynuq.com';
const {adminPassword}=JSON.parse(await readFile('data/local-access.json','utf8'));
const {operatorPassword}=JSON.parse(await readFile('data/operator-access.json','utf8'));
async function call(path,{cookie,method='GET',data}={}){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Liaoye-Action':'1',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
  const body=await response.json();return{status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
const root=await call('/api/admin/login',{method:'POST',data:{password:adminPassword}});assert.equal(root.status,200);assert.equal(root.body.role,'super_admin');
let current=root.cookie;
try{
  const rootState=await call('/api/state',{cookie:root.cookie});assert.equal(rootState.body.adminRole,'super_admin');
  const rootDashboard=await call('/api/admin/dashboard',{cookie:root.cookie});assert.equal(rootDashboard.body.role,'super_admin');
  const operator=await call('/api/admin/login',{method:'POST',cookie:root.cookie,data:{password:operatorPassword}});assert.equal(operator.status,200);assert.equal(operator.body.role,'operator');current=operator.cookie;
  const state=await call('/api/state',{cookie:current});assert.equal(state.body.adminRole,'operator');
  const dashboard=await call('/api/admin/dashboard',{cookie:current});assert.equal(dashboard.status,200);assert.equal(dashboard.body.role,'operator');assert.deepEqual(dashboard.body.keys,[]);
  assert.equal((await call('/api/admin/dashboard',{cookie:root.cookie})).status,401);
  const blocked=await call('/api/admin/keys',{cookie:current,method:'POST',data:{name:'Role boundary verification - must be rejected'}});assert.equal(blocked.status,403);
  assert.equal((await call('/api/admin/keys/verification-only',{cookie:current,method:'DELETE'})).status,403);
  const report={domain:base,superAdminLogin:200,superAdminRole:'super_admin',operatorLogin:200,operatorRole:'operator',operatorDashboard:200,operatorKeysHidden:true,operatorKeyCreate:403,operatorKeyRevoke:403,previousRootSessionInvalidated:401,publicItems:state.body.content.length,verifiedAt:new Date().toISOString()};
  await writeFile('artifacts/role-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await call('/api/admin/logout',{method:'POST',cookie:current});}
