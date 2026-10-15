import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/app.mjs';
import {createCloudApp} from './cloud-fixture.mjs';
import {digest} from '../server/member-accounts.mjs';
const build=process.env.LIAOYE_TEST_CLOUD==='1'?createCloudApp:createApp;
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const options={publicDir:join(root,'dist'),adminPassword:'fixture-account-admin-password',operatorPassword:'fixture-account-operator-password',memberPepper:'fixture-member-pepper-at-least-32-characters'};
const credentials={nickname:'同一个昵称',wechat:'fixture_reader_26',password:'fixture-member-long-password'};
const questions={recommendedBook:'测试书籍',value:'希望线下分享真实阅读体验',aiExperience:'偶尔试过',agreed:true};
const contacts=[{name:'测试群主',role:'owner',wechat:'fixture_owner_26'},{name:'测试运营',role:'operator',wechat:'fixture_operator_26'}];
let app,directory,base;
async function start(){app=await build({...options,dataDir:directory,seed:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function stop(){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();}
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'liaoye-accounts-test-'));await start();});
afterEach(async()=>{await stop();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'liaoye-accounts-test-'));await rm(directory,{recursive:true,force:true});});
async function request(path,{method='GET',data,cookie,bearer,origin}={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Liaoye-Action':'1',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:`Bearer ${bearer}`}:{ }),...(origin?{Origin:origin}:{})},body:data===undefined?undefined:JSON.stringify(data)});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],cookieHeader:r.headers.get('set-cookie'),cache:r.headers.get('cache-control')};}
const register=(data=credentials,cookie)=>request('/api/account/register',{method:'POST',data,cookie});
const login=(data=credentials,cookie)=>request('/api/account/login',{method:'POST',data:{wechat:data.wechat,password:data.password},cookie});
async function management(){const r=await request('/api/admin/login',{method:'POST',data:{password:options.operatorPassword}});assert.equal(r.status,200);return r.cookie;}

test('anonymous, legacy-cookie, admin-only and agent-only access cannot reveal private community contacts',async()=>{
  const admin=await management();assert.equal((await request('/api/admin/community-contacts',{method:'PUT',cookie:admin,data:{contacts}})).status,200);
  for(const cookie of [undefined,'liaoye_member=old-browser-token',admin])assert.equal((await request('/api/community',{cookie})).status,401);
  assert.equal((await request('/api/community',{bearer:'invalid-agent'})).status,401);
  assert.equal((await request('/api/admin/community-contacts')).status,401);
  const state=await request('/api/state');assert.doesNotMatch(JSON.stringify(state.body),/fixture_owner_26|fixture_operator_26/);
  assert.equal((await request('/api/join',{method:'POST',data:questions})).status,401);
});
test('wechat is unique across browsers and normalized case while display nicknames may repeat',async()=>{
  const first=await register();assert.equal(first.status,201);assert.equal(first.body.joined,false);assert.match(first.cookieHeader,/HttpOnly; SameSite=Strict/);
  const duplicate=await register({...credentials,wechat:' FIXTURE_READER_26 '});assert.equal(duplicate.status,409);
  const second=await register({...credentials,wechat:'fixture_reader_27'});assert.equal(second.status,201);assert.equal(second.body.nickname,first.body.nickname);assert.notEqual(second.body.id,first.body.id);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n,2);
  assert.equal((await register({...credentials,wechat:'fixture_reader_28'},first.cookie)).status,409);
});
test('account password and privilege injection are rejected and database stores only salted peppered hashes',async()=>{
  assert.equal((await register({...credentials,password:'short'})).status,400);
  assert.equal((await register({...credentials,role:'super_admin'})).status,400);
  assert.equal((await register({...credentials,joined:true})).status,400);
  assert.equal((await request('/api/account/register',{method:'POST',origin:'https://evil.invalid',data:credentials})).status,403);
  const r=await register();assert.equal(r.status,201);const row=app.store.db.prepare('SELECT * FROM member_accounts').get();assert.notEqual(row.password_hash,credentials.password);assert.match(row.password_hash,/^[a-f0-9]{64}$/);assert.ok(row.password_salt.length>=32);
  assert.doesNotMatch(JSON.stringify((await request('/api/state',{cookie:r.cookie})).body),/password_hash|password_salt|fixture_reader_26|pepper/);
});
test('registered users can read private contacts, then join once; unjoined users cannot submit or vote',async()=>{
  const admin=await management();await request('/api/admin/community-contacts',{method:'PUT',cookie:admin,data:{contacts}});
  const r=await register(),community=await request('/api/community',{cookie:r.cookie});assert.equal(community.status,200);assert.deepEqual(community.body.contacts,contacts);assert.equal(community.cache,'no-store');
  assert.equal((await request('/api/submissions',{method:'POST',cookie:r.cookie,data:{}})).status,403);
  assert.equal((await request('/api/activities/no-id/vote',{method:'POST',cookie:r.cookie,data:{voted:true}})).status,403);
  assert.equal((await request('/api/join',{method:'POST',cookie:r.cookie,data:{...questions,agreed:false}})).status,400);
  assert.equal((await request('/api/join',{method:'POST',cookie:r.cookie,data:questions})).status,201);
  assert.equal((await request('/api/join',{method:'POST',cookie:r.cookie,data:questions})).status,409);
  assert.equal((await request('/api/state',{cookie:r.cookie})).body.member.joined,true);
});
test('login works without old cookies, survives server restart, rotates the browser session and logout revokes it',async()=>{
  const first=await register();await request('/api/join',{method:'POST',cookie:first.cookie,data:questions});
  await stop();await start();const other=await login();assert.equal(other.status,200);assert.equal(other.body.id,first.body.id);assert.equal(other.body.joined,true);
  const rotated=await login(credentials,other.cookie);assert.equal(rotated.status,200);assert.equal((await request('/api/community',{cookie:other.cookie})).status,401);
  assert.equal((await request('/api/community',{cookie:first.cookie})).status,200);
  await request('/api/account/logout',{method:'POST',cookie:rotated.cookie});assert.equal((await request('/api/community',{cookie:rotated.cookie})).status,401);
  assert.equal((await login({...credentials,password:'incorrect-long-password'})).status,401);
  assert.equal((await login({...credentials,wechat:'unknown_reader_26'})).status,401);
});
test('expired and forged account sessions fail closed and cannot be replaced by a legacy browser identity',async()=>{
  const r=await register();app.store.db.prepare('UPDATE member_sessions SET expires_at=0').run();
  for(const cookie of [r.cookie,'liaoye_account=forged-token','liaoye_member=forged-token']){assert.equal((await request('/api/community',{cookie})).status,401);assert.equal((await request('/api/state',{cookie})).body.member,null);}
});
test('legacy registration can be upgraded only with its old browser proof, preserving member id and votes',async()=>{
  const legacyId='fixture-legacy-member',legacySecret='fixture-legacy-secret',date=new Date().toISOString();
  app.store.db.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(legacyId,await digest(legacySecret),'旧版昵称',JSON.stringify(questions),date);
  const activity=app.store.insert({kind:'activity',data:{title:'旧活动'},status:'published',source:'editor'});app.store.db.prepare('INSERT INTO votes VALUES(?,?,?)').run(activity.id,legacyId,date);
  const oldCookie=`liaoye_member=${legacySecret}`;assert.equal((await request('/api/community',{cookie:oldCookie})).status,401);
  const upgraded=await register(credentials,oldCookie);assert.equal(upgraded.status,201);assert.equal(upgraded.body.id,legacyId);assert.equal(upgraded.body.joined,true);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM members').get().n,1);assert.equal(app.store.db.prepare('SELECT member_id FROM votes').get().member_id,legacyId);
  assert.equal((await login()).body.id,legacyId);assert.equal((await request('/api/community',{cookie:oldCookie})).status,401);
});
test('concurrent duplicate registration is rejected atomically without orphan members',async()=>{
  const rows=await Promise.all([register(),register()]);assert.deepEqual(rows.map(r=>r.status).sort(),[201,409]);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n,1);assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM members').get().n,1);
});
test('management can add operators but neither members nor agents can edit or enumerate private contacts',async()=>{
  const admin=await management(),r=await register();assert.equal((await request('/api/admin/community-contacts',{method:'PUT',cookie:admin,data:{contacts}})).status,200);
  assert.equal((await request('/api/admin/community-contacts',{method:'PUT',cookie:r.cookie,data:{contacts}})).status,401);
  assert.equal((await request('/api/admin/community-contacts',{method:'PUT',cookie:admin,data:{contacts:[]}})).status,400);
  assert.equal((await request('/api/admin/community-contacts',{method:'PUT',cookie:admin,data:{contacts:[contacts[0],contacts[0]]}})).status,400);
  const rootLogin=await request('/api/admin/login',{method:'POST',data:{password:options.adminPassword}}),key=await request('/api/admin/keys',{method:'POST',cookie:rootLogin.cookie,data:{name:'fixture'}});
  const publicRead=await request('/api/agent/content',{bearer:key.body.key});assert.equal(publicRead.status,200);assert.doesNotMatch(JSON.stringify(publicRead.body),/fixture_owner_26|fixture_reader_26|wechat_id/);
  assert.equal((await request('/api/community',{bearer:key.body.key})).status,401);
});
