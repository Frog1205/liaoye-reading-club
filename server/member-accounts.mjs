// Shared account contract for Node and Workers. Personal contacts never live here.
export const memberCookie='liaoye_account';
export const memberSessionSeconds=30*86400;
export const memberSessionQuery='SELECT a.member_id AS id,a.nickname,a.wechat_id,a.joined_at FROM member_sessions s JOIN member_accounts a ON a.member_id=s.member_id WHERE s.session_hash=? AND s.expires_at>?';
export const publicMember=m=>m?{id:m.id,nickname:m.nickname,joined:Boolean(m.joined_at)}:null;
export const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const randomSecret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async v=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
const scheme='pbkdf2-sha256-100000+hmac-sha256-v1';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export async function accountPassword(password,salt,pepper){
  if(typeof pepper!=='string'||pepper.length<32)throw fail(503,'账号服务暂未配置，请稍后再试');
  const bytes=new TextEncoder(),key=await crypto.subtle.importKey('raw',bytes.encode(password),'PBKDF2',false,['deriveBits']);
  // Workers caps a single PBKDF2 operation at 100k. An independent server-side
  // pepper protects database-only disclosure; never stored in D1.
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  const hmac=await crypto.subtle.importKey('raw',bytes.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',hmac,derived));
}
export function createMemberAccounts({get,run,batch,pepper}){
  const lookup=async cookie=>get(memberSessionQuery,await digest(cookie[memberCookie]||''),Date.now());
  const session=async(id,cookie)=>{
    const sid=randomSecret(),date=new Date().toISOString();
    await batch([
      ['DELETE FROM member_sessions WHERE session_hash=?',[await digest(cookie[memberCookie]||'')]],
      ['DELETE FROM member_sessions WHERE expires_at<?',[Date.now()]],
      ['INSERT INTO member_sessions VALUES(?,?,?,?)',[await digest(sid),id,Date.now()+memberSessionSeconds*1000,date]]
    ]);
    return sid;
  };
  return {
    lookup,
    async register(input,cookie){
      if(await lookup(cookie))throw fail(409,'你已登录，无需重复注册');
      if(await get('SELECT member_id FROM member_accounts WHERE wechat_id=?',input.wechat))throw fail(409,'这个微信号已注册，请直接登录');
      const legacy=cookie.liaoye_member?await get('SELECT id,answers,created_at FROM members WHERE session_hash=? AND NOT EXISTS (SELECT 1 FROM member_accounts WHERE member_id=members.id)',await digest(cookie.liaoye_member)):null;
      const id=legacy?.id||crypto.randomUUID(),salt=randomSecret(),date=new Date().toISOString(),sid=randomSecret();
      const passwordHash=await accountPassword(input.password,salt,pepper);
      let joinedAt=null;try{if(legacy&&JSON.parse(legacy.answers).agreed===true)joinedAt=legacy.created_at;}catch{}
      const statements=[];
      if(!legacy)statements.push(['INSERT INTO members(id,session_hash,nickname,answers,created_at) VALUES(?,?,?,?,?)',[id,await digest(randomSecret()),`account:${id}`,'{}',date]]);
      statements.push(['INSERT INTO member_accounts VALUES(?,?,?,?,?,?,?,?)',[id,input.nickname,input.wechat,passwordHash,salt,scheme,joinedAt,date]]);
      statements.push(['INSERT INTO member_sessions VALUES(?,?,?,?)',[await digest(sid),id,Date.now()+memberSessionSeconds*1000,date]]);
      try{await batch(statements);}catch(e){if(/UNIQUE|constraint/i.test(String(e)))throw fail(409,'这个微信号已注册，请直接登录');throw e;}
      return {sid,member:{id,nickname:input.nickname,joined:Boolean(joinedAt)}};
    },
    async login(input,cookie){
      const account=await get('SELECT * FROM member_accounts WHERE wechat_id=?',input.wechat);
      const candidate=await accountPassword(input.password,account?.password_salt||'0'.repeat(64),pepper);
      if(!account||account.password_scheme!==scheme||!equal(candidate,account.password_hash))throw fail(401,'微信号或密码不正确');
      return {sid:await session(account.member_id,cookie),member:{id:account.member_id,nickname:account.nickname,joined:Boolean(account.joined_at)}};
    },
    async logout(cookie){await run('DELETE FROM member_sessions WHERE session_hash=?',await digest(cookie[memberCookie]||''));},
    async join(member,input){
      if(member.joined_at)throw fail(409,'你已完成入群登记，无需重复提交');
      await batch([
        ['UPDATE members SET answers=? WHERE id=?',[JSON.stringify(input),member.id]],
        ['UPDATE member_accounts SET joined_at=? WHERE member_id=? AND joined_at IS NULL',[new Date().toISOString(),member.id]]
      ]);
      return {id:member.id,nickname:member.nickname,joined:true};
    }
  };
}
