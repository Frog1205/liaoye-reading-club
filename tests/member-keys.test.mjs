import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createApp} from '../server/app.mjs';
import {createCloudApp} from './cloud-fixture.mjs';
import {digest} from '../server/member-accounts.mjs';

const build=process.env.LIAOYE_TEST_CLOUD==='1'?createCloudApp:createApp;
const options={adminPassword:'fixture-personal-key-admin',operatorPassword:'fixture-personal-key-operator',memberPepper:'fixture-member-key-pepper-32-characters',seed:false,publicDir:resolve('dist')};
const questions={recommendedBook:'共创测试书',value:'希望在线下交流阅读经验',aiExperience:'偶尔试过',agreed:true};
const note={kind:'note',data:{title:'真实的阅读记录',bookTitle:'共创测试书',author:'冒用其他昵称',body:'这是来自本人阅读笔记的测试内容，待运营人员审阅后才能公开展示。'}};
let app,directory,base;
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'liaoye-personal-keys-'));await start();});
afterEach(async()=>{await stop();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'liaoye-personal-keys-'));await rm(directory,{recursive:true,force:true});});
async function start(){app=await build({...options,dataDir:directory});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
async function stop(){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.store.close();}
async function call(path,{method='GET',data,cookie,bearer,origin,action='1'}={}){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(action?{'X-Liaoye-Action':action}:{}),...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:`Bearer ${bearer}`}:{ }),...(origin?{Origin:origin}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],cache:response.headers.get('cache-control')};}
async function register(suffix='one',joined=false){const data={nickname:`读者${suffix}`,wechat:`fixture_keys_${suffix}`,password:'Fixture-password!'};const r=await call('/api/account/register',{method:'POST',data});assert.equal(r.status,201);if(joined)assert.equal((await call('/api/join',{method:'POST',cookie:r.cookie,data:questions})).status,201);return {...r,credentials:data};}
const create=(cookie,name='我的智能体')=>call('/api/account/keys',{method:'POST',cookie,data:{name}});
const management=async(password=options.adminPassword)=>(await call('/api/admin/login',{method:'POST',data:{password}})).cookie;

test('registered users create before joining; metadata excludes secrets; raw token is never stored',async()=>{
  const m=await register(),r=await create(m.cookie);assert.equal(r.status,201);assert.deepEqual(r.body.scope,['content:read','draft:create']);assert.match(r.body.key,/^lym_[0-9a-f]{64}$/);
  const list=await call('/api/account/keys',{cookie:m.cookie});assert.equal(list.status,200);assert.equal(list.cache,'no-store');assert.equal(list.body.maxActive,5);assert.equal(list.body.keys.length,1);assert.doesNotMatch(JSON.stringify(list.body),/key_hash|owner_member_id|wechat|password/);assert.ok(!JSON.stringify(list.body).includes(r.body.key));
  const stored=app.store.db.prepare('SELECT * FROM member_agent_keys').get();assert.equal(stored.key_hash,await digest(r.body.key));assert.equal(stored.owner_member_id,m.body.id);assert.ok(!JSON.stringify(stored).includes(r.body.key));
  assert.equal((await call('/api/agent/content',{bearer:r.body.key})).status,200);
  assert.equal((await call('/api/agent/drafts',{method:'POST',bearer:r.body.key,data:note})).status,403);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM content').get().n,0);
});

test('anonymous, management-only, forged, expired and Bearer-only identities cannot manage member keys',async()=>{
  const m=await register(),k=await create(m.cookie),admin=await management();
  for(const identity of [{},{cookie:admin},{cookie:'liaoye_account=forged'},{bearer:k.body.key}]){
    assert.equal((await call('/api/account/keys',identity)).status,401);
    assert.equal((await call('/api/account/keys',{...identity,method:'POST',data:{name:'禁止发行'}})).status,401);
    assert.equal((await call(`/api/account/keys/${k.body.id}`,{...identity,method:'DELETE'})).status,401);
  }
  app.store.db.prepare('UPDATE member_sessions SET expires_at=0').run();assert.equal((await call('/api/account/keys',{cookie:m.cookie})).status,401);
});

test('members cannot enumerate or revoke each others keys, including administrator-issued keys',async()=>{
  const one=await register('one'),two=await register('two'),a=await create(one.cookie,'甲'),b=await create(two.cookie,'乙');
  const root=await management(),legacy=await call('/api/admin/keys',{method:'POST',cookie:root,data:{name:'原管理令牌'}});
  for(const [cookie,id] of [[two.cookie,a.body.id],[one.cookie,b.body.id],[one.cookie,legacy.body.id]])assert.equal((await call(`/api/account/keys/${id}`,{method:'DELETE',cookie})).status,404);
  const list=await call('/api/account/keys',{cookie:one.cookie});assert.deepEqual(list.body.keys.map(k=>k.id),[a.body.id]);assert.equal((await call('/api/admin/dashboard',{cookie:one.cookie})).status,401);
  assert.equal((await call('/api/agent/content',{bearer:a.body.key})).status,200);assert.equal((await call('/api/agent/content',{bearer:legacy.body.key})).status,200);
});

test('personal agents preserve membership gating, bind attribution and require human publication',async()=>{
  const m=await register('joined',true),k=await create(m.cookie,'阅读搭子');
  const r=await call('/api/agent/drafts',{method:'POST',bearer:k.body.key,data:note});assert.equal(r.status,201);assert.equal(r.body.status,'pending');assert.equal(r.body.reviewRequired,true);assert.equal(r.body.data.author,m.body.nickname);assert.equal(r.body.sourceLabel,`${m.body.nickname} · 阅读搭子`);
  const activity={kind:'activity',data:{title:'一起读书的下午',description:'这是一个一起分享真实阅读笔记的活动主题，欢迎大家讨论。',location:'待确认',proposer:'冒用群主'}};
  const a=await call('/api/agent/drafts',{method:'POST',bearer:k.body.key,data:activity});assert.equal(a.status,201);assert.equal(a.body.data.proposer,m.body.nickname);
  const book={kind:'book',data:{title:'共创测试书',author:'书籍作者',description:'本周一起读前三章，讨论一个自己的问题',category:'共读',cadence:'weekly',period:'2026-10-12'}};
  const b=await call('/api/agent/drafts',{method:'POST',bearer:k.body.key,data:book});assert.equal(b.status,201);assert.equal(b.body.data.author,'书籍作者');
  assert.equal((await call('/api/state')).body.content.length,0);assert.equal((await call('/api/agent/content',{bearer:k.body.key})).body.content.length,0);
  assert.equal((await call('/api/admin/content',{method:'POST',bearer:k.body.key,data:note})).status,401);assert.equal((await call('/api/community',{bearer:k.body.key})).status,401);
  assert.equal((await call('/api/agent/drafts',{method:'POST',bearer:k.body.key,data:{...note,status:'published'}})).status,400);
  const operator=await management(options.operatorPassword),dashboard=await call('/api/admin/dashboard',{cookie:operator});assert.equal(dashboard.body.pending.length,3);assert.deepEqual(dashboard.body.keys,[]);
  assert.equal((await call(`/api/admin/content/${r.body.id}`,{method:'PUT',cookie:operator,data:{kind:'note',data:r.body.data}})).status,200);assert.equal((await call('/api/state')).body.content.length,1);
  assert.equal((await call('/api/admin/keys',{method:'POST',cookie:operator,data:{name:'禁止全局授权'}})).status,403);
});

test('strict input and same-origin guards prevent owner/scope injection, oversized names and CSRF',async()=>{
  const m=await register();
  for(const data of [{name:'x',owner_member_id:'someone-else'},{name:'x',scope:['admin']},{name:''},{name:'x'.repeat(61)},{name:'a\u0000b'}])assert.equal((await call('/api/account/keys',{method:'POST',cookie:m.cookie,data})).status,400);
  assert.equal((await call('/api/account/keys',{method:'POST',cookie:m.cookie,data:{name:'x'},origin:'https://example.invalid'})).status,403);
  assert.equal((await call('/api/account/keys',{method:'POST',cookie:m.cookie,data:{name:'x'},action:null})).status,403);
  assert.equal((await call('/api/account/keys',{method:'POST',cookie:m.cookie,data:{name:'x'.repeat(9000)}})).status,413);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM member_agent_keys').get().n,0);
});

test('conditional insert enforces five active keys during concurrent creation; revocation frees a slot',async()=>{
  const m=await register();const results=await Promise.all(Array.from({length:8},(_,i)=>create(m.cookie,`并发${i}`)));
  assert.equal(results.filter(r=>r.status===201).length,5);assert.equal(results.filter(r=>r.status===429).length,3);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM member_agent_keys WHERE revoked_at IS NULL').get().n,5);
  const k=results.find(r=>r.status===201);assert.equal((await call(`/api/account/keys/${k.body.id}`,{method:'DELETE',cookie:m.cookie})).status,200);assert.equal((await create(m.cookie,'替换')).status,201);
});

test('key churn is limited per account even after revoking every key',async()=>{
  const m=await register();for(let i=0;i<10;i++){const k=await create(m.cookie,`轮换${i}`);assert.equal(k.status,201);assert.equal((await call(`/api/account/keys/${k.body.id}`,{method:'DELETE',cookie:m.cookie})).status,200);}
  assert.equal((await create(m.cookie,'超过频率')).status,429);assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM member_agent_keys').get().n,10);
});

test('all personal tokens and manual posts share the same member draft budget',async()=>{
  const m=await register('budget',true),a=await create(m.cookie,'甲'),b=await create(m.cookie,'乙');
  assert.equal((await call('/api/submissions',{method:'POST',cookie:m.cookie,data:note})).status,201);
  for(let i=0;i<19;i++)assert.equal((await call('/api/agent/drafts',{method:'POST',bearer:i%2?a.body.key:b.body.key,data:note})).status,201);
  assert.equal((await call('/api/agent/drafts',{method:'POST',bearer:a.body.key,data:note})).status,429);
  assert.equal((await call('/api/submissions',{method:'POST',cookie:m.cookie,data:note})).status,429);
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM content').get().n,20);
});

test('read budget is shared across personal keys; other accounts stay independent',async()=>{
  const m=await register('read'),a=await create(m.cookie,'甲'),b=await create(m.cookie,'乙'),other=await register('other'),c=await create(other.cookie);
  for(let i=0;i<60;i++)assert.equal((await call('/api/agent/content',{bearer:i%2?a.body.key:b.body.key})).status,200);
  assert.equal((await call('/api/agent/content',{bearer:b.body.key})).status,429);assert.equal((await call('/api/agent/content',{bearer:c.body.key})).status,200);
});

test('logout and restart retain owned keys, while member or super-admin revocation blocks future reads and drafts',async()=>{
  const m=await register('persist',true),a=await create(m.cookie,'本人撤销'),b=await create(m.cookie,'应急撤销');
  await call('/api/account/logout',{method:'POST',cookie:m.cookie});assert.equal((await call('/api/account/keys',{cookie:m.cookie})).status,401);
  await stop();await start();const login=await call('/api/account/login',{method:'POST',data:{wechat:m.credentials.wechat,password:m.credentials.password}});assert.equal(login.status,200);
  const list=await call('/api/account/keys',{cookie:login.cookie});assert.equal(list.body.keys.length,2);assert.ok(!JSON.stringify(list.body).includes(a.body.key));
  assert.equal((await call(`/api/account/keys/${a.body.id}`,{method:'DELETE',cookie:login.cookie})).status,200);
  const operator=await management(options.operatorPassword);assert.equal((await call(`/api/admin/keys/${b.body.id}`,{method:'DELETE',cookie:operator})).status,403);
  const root=await management(),dashboard=await call('/api/admin/dashboard',{cookie:root});assert.equal(dashboard.body.keys.length,2);assert.equal(dashboard.body.keys[0].owner_nickname,m.body.nickname);assert.doesNotMatch(JSON.stringify(dashboard.body),/key_hash|owner_member_id/);assert.ok(!JSON.stringify(dashboard.body).includes(b.body.key));
  assert.equal((await call(`/api/admin/keys/${b.body.id}`,{method:'DELETE',cookie:root})).status,200);
  for(const token of [a.body.key,b.body.key]){assert.equal((await call('/api/agent/content',{bearer:token})).status,401);assert.equal((await call('/api/agent/drafts',{method:'POST',bearer:token,data:note})).status,401);}
  assert.equal((await call(`/api/account/keys/${a.body.id}`,{method:'DELETE',cookie:login.cookie})).status,404);
});

test('rerunning the additive migration preserves existing accounts, content and administrator keys',async()=>{
  const m=await register('migration'),root=await management(),old=await call('/api/admin/keys',{method:'POST',cookie:root,data:{name:'历史令牌'}});await create(m.cookie);
  const item=app.store.insert({kind:'note',data:note.data,status:'published'});
  const account=app.store.db.prepare('SELECT * FROM member_accounts').get();
  const migration=await readFile(new URL('../cloud/migrations/0005-member-agent-keys.sql',import.meta.url),'utf8');app.store.db.exec(migration);app.store.db.exec(migration);
  assert.deepEqual(app.store.db.prepare('SELECT * FROM member_accounts').get(),account);assert.equal(app.store.get(item.id).status,'published');assert.equal((await call('/api/agent/content',{bearer:old.body.key})).status,200);assert.equal((await call('/api/account/keys',{cookie:m.cookie})).body.keys.length,1);
});
