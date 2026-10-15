import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='https://liaoye.veynuq.com',results={domain:base,checkedAt:new Date().toISOString()};
async function request(path,options={}){for(let i=0;i<3;i++){try{return await fetch(base+path,{...options,signal:AbortSignal.timeout(20000)});}catch(e){if(i===2)throw e;}}}
for(const path of ['/','/api/health','/api/state','/agent-guide.md']){const response=await request(path);assert.equal(response.status,200);results[path]=200;if(path==='/api/health')assert.equal((await response.json()).storage,'D1');if(path==='/api/state'){const data=await response.json();results.publicContent=data.content.length;assert.equal(data.admin,false);}}
const denied=await request('/api/admin/dashboard');assert.equal(denied.status,401);results.unauthenticatedAdmin=401;
const {adminPassword}=JSON.parse(await readFile('data/local-access.json','utf8'));
const login=await request('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','X-Liaoye-Action':'1',Origin:base},body:JSON.stringify({password:adminPassword})});assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/Secure/);assert.match(setCookie,/HttpOnly/);const cookie=setCookie.split(';')[0];
try{const admin=await request('/api/admin/dashboard',{headers:{Cookie:cookie}});assert.equal(admin.status,200);results.authenticatedAdmin=200;results.secureSession=true;}finally{await request('/api/admin/logout',{method:'POST',headers:{Cookie:cookie,'X-Liaoye-Action':'1'}});}
const insecure=await fetch('http://liaoye.veynuq.com/',{redirect:'manual'});results.httpRedirect=insecure.status;assert.ok([301,302,307,308].includes(insecure.status));assert.ok(insecure.headers.get('location').startsWith('https://'));
await writeFile('artifacts/cloud-domain-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
