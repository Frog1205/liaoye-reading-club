import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../server/app.mjs';
import {createCloudApp} from './cloud-fixture.mjs';
import {verifyRegistration} from '../server/registration-security.mjs';
const cloud=process.env.LIAOYE_TEST_CLOUD==='1',build=cloud?createCloudApp:createApp;
const baseOptions={publicDir:resolve('dist'),seed:false,adminPassword:'fixture-security-administrator',operatorPassword:'fixture-security-operator',memberPepper:'fixture-security-pepper-at-least-32-characters'};
const credentials={nickname:'安全自检',wechat:'fixture_security_user',password:'Fixture-member-long-password!'};
const questions={recommendedBook:'安全测试书籍',value:'希望与真实读者分享阅读',aiExperience:'偶尔试过',agreed:true};
let app,directory,base;
async function start(turnstile){app=await build({...baseOptions,dataDir:directory,turnstile});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function stop(){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();}
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'liaoye-security-test-'));await start();});
afterEach(async()=>{await stop();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'liaoye-security-test-'));await rm(directory,{recursive:true,force:true});});
async function request(path,{method='GET',data,cookie,headers={}}={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Liaoye-Action':'1',...(cookie?{Cookie:cookie}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const register=(data=credentials,headers={})=>request('/api/account/register',{method:'POST',data,headers});
const count=()=>app.store.db.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n;
const challenge={required:true,siteKey:'fixture-public-site-key',secret:'fixture-private-turnstile-secret'};

test('mandatory verification refuses missing, invalid, reused and wrong-host/action tokens without creating accounts',async()=>{
  await stop();const spent=new Set();await start({...challenge,fetcher:async(url,options)=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');const body=JSON.parse(options.body);assert.equal(body.secret,challenge.secret);assert.ok(body.idempotency_key);const token=body.response;const success=token!=='invalid'&&!spent.has(token);spent.add(token);return Response.json({success,hostname:token==='wrong-host'?'other.example':'127.0.0.1',action:token==='wrong-action'?'login':'register'});}});
  const config=await request('/api/account/security');assert.equal(config.body.required,true);assert.equal(config.body.available,true);assert.ok(!JSON.stringify(config.body).includes(challenge.secret));
  assert.equal((await register()).status,403);
  for(const token of ['invalid','wrong-host','wrong-action'])assert.equal((await register({...credentials,turnstileToken:token})).status,403);
  assert.equal(count(),0);
  assert.equal((await register({...credentials,turnstileToken:'valid-once'})).status,201);assert.equal(count(),1);
  // Reuse is independently checked without consuming the HTTP burst quota.
  await assert.rejects(verifyRegistration({...challenge,token:'valid-once',hostname:'127.0.0.1',fetcher:async()=>Response.json({success:false,'error-codes':['timeout-or-duplicate']})}),e=>e.status===403);
});

test('verification outage or missing configuration fails closed while login remains available',async()=>{
  assert.equal((await register()).status,201);await stop();await start({...challenge,fetcher:async()=>{throw new Error('fixture network failure');}});
  assert.equal((await register({...credentials,wechat:'fixture_security_other',turnstileToken:'valid-looking'})).status,503);assert.equal(count(),1);
  assert.equal((await request('/api/account/login',{method:'POST',data:{wechat:credentials.wechat,password:credentials.password}})).status,200);
  await stop();await start({required:true,siteKey:challenge.siteKey});assert.equal((await request('/api/account/security')).body.available,false);assert.equal((await register({...credentials,wechat:'fixture_security_third',turnstileToken:'anything'})).status,503);assert.equal(count(),1);
});

test('production test sitekeys and mismatched verification results cannot bypass the guard',async()=>{
  for(const siteKey of ['1x00000000000000000000AA','2x00000000000000000000AB'])await assert.rejects(verifyRegistration({...challenge,siteKey,token:'fake',hostname:'localhost'}),e=>e.status===503);
  for(const result of [{success:false},{success:true,hostname:'localhost',action:'login'},{success:true,hostname:'elsewhere',action:'register'}])await assert.rejects(verifyRegistration({...challenge,token:'fake',hostname:'localhost',fetcher:async()=>Response.json(result)}),e=>e.status===403);
});

test('short registration burst is limited despite rotating forwarded IP headers and malformed payloads',async()=>{
  for(let i=0;i<5;i++)assert.equal((await register({...credentials,nickname:''},{'X-Forwarded-For':`192.0.2.${i+1}`})).status,400);
  for(let i=0;i<3;i++)assert.equal((await register({...credentials,wechat:`fixture_attack_${i}`},{'X-Forwarded-For':`198.51.100.${i+1}`})).status,429);
  assert.equal(count(),0);
  if(cloud)assert.ok(app.store.db.prepare('SELECT MAX(count) AS n FROM rate_limits').get().n<=6);
});

test('registration and login reject oversized bodies before account writes or password derivation',async()=>{
  assert.equal((await register({...credentials,nickname:'x'.repeat(9000)})).status,413);
  assert.equal((await request('/api/account/login',{method:'POST',data:{wechat:credentials.wechat,password:'x'.repeat(9000)}})).status,413);assert.equal(count(),0);
});

test('control-character nicknames, blank passwords and SQL-bearing wechat values are rejected',async()=>{
  for(const patch of [{nickname:'正常\u0000隐藏'},{nickname:'正常\u202e伪装'},{password:' '.repeat(16)},{wechat:"x';DROP TABLE members;--"}])assert.equal((await register({...credentials,...patch})).status,400);
  assert.equal(count(),0);assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM members').get().n,0);
});

test('SQL-like display text is bound as data and cannot execute or remove tables',async()=>{
  const nickname="');DROP TABLE members;--";const r=await register({...credentials,nickname});assert.equal(r.status,201);assert.equal(r.body.nickname,nickname);
  assert.equal(app.store.db.prepare('SELECT nickname FROM member_accounts').get().nickname,nickname);assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM members').get().n,1);
  assert.equal((await request('/api/community',{cookie:r.cookie})).status,200);
});

test('only management may pause registration and paused registration never blocks existing login',async()=>{
  const member=await register();assert.equal(member.status,201);
  assert.equal((await request('/api/admin/registration',{method:'PUT',data:{enabled:false}})).status,401);
  assert.equal((await request('/api/admin/registration',{method:'PUT',data:{enabled:false},cookie:member.cookie})).status,401);
  const management=await request('/api/admin/login',{method:'POST',data:{password:baseOptions.operatorPassword}});assert.equal(management.status,200);
  assert.equal((await request('/api/admin/registration',{method:'PUT',data:{enabled:false},cookie:management.cookie})).status,200);
  assert.equal((await request('/api/account/security')).body.enabled,false);assert.equal((await register({...credentials,wechat:'fixture_paused_user'})).status,403);assert.equal(count(),1);
  assert.equal((await request('/api/account/login',{method:'POST',data:{wechat:credentials.wechat,password:credentials.password}})).status,200);
  assert.equal((await request('/api/admin/registration',{method:'PUT',data:{enabled:true},cookie:management.cookie})).status,200);assert.equal((await register({...credentials,wechat:'fixture_resumed_user'})).status,201);
  assert.equal(app.store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='update_registration'").get().n,2);
});

test('concurrent join requests cannot overwrite the first committed answers',async()=>{
  const member=await register();const results=await Promise.all([request('/api/join',{method:'POST',data:questions,cookie:member.cookie}),request('/api/join',{method:'POST',data:{...questions,value:'第二条内容不得覆盖首次登记'},cookie:member.cookie})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const stored=app.store.db.prepare('SELECT answers FROM members WHERE id=?').get(member.body.id).answers;
  assert.equal((await request('/api/join',{method:'POST',data:{...questions,value:'再次篡改'},cookie:member.cookie})).status,409);assert.equal(app.store.db.prepare('SELECT answers FROM members WHERE id=?').get(member.body.id).answers,stored);
});

test('cloud rate counters prune expired rows in bounded batches without deleting live limits',{skip:!cloud?'Node local limits are process-memory entries, not D1 rows':false},async()=>{
  for(let i=0;i<250;i++)app.store.db.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('expired-fixture-'+i,1,Date.now()-1000);
  app.store.db.prepare('INSERT INTO rate_limits VALUES(?,?,?)').run('live-fixture',1,Date.now()+3600000);
  assert.equal((await register({...credentials,nickname:''})).status,400);
  const expired=app.store.db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE expires_at<?').get(Date.now()).n;assert.ok(expired>=50&&expired<250);assert.ok(app.store.db.prepare('SELECT key FROM rate_limits WHERE key=?').get('live-fixture'));
});

test('hourly registration quota persists across multiple burst windows',async t=>{
  let clock=Math.floor(Date.now()/3600000)*3600000+120000;t.mock.method(Date,'now',()=>clock);
  for(let window=0;window<2;window++){for(let i=0;i<5;i++)assert.equal((await register({...credentials,nickname:''})).status,400);clock+=61000;}
  assert.equal((await register()).status,429);assert.equal(count(),0);
});

test('malformed UTF-8 cannot silently become replacement characters in stored account data',async()=>{const r=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json','X-Liaoye-Action':'1'},body:Buffer.from([123,34,110,105,99,107,110,97,109,101,34,58,34,255,34,125])});assert.equal(r.status,400);assert.equal(count(),0);});
