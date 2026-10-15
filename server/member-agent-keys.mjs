import {z} from 'zod';
import {digest,randomSecret} from './member-accounts.mjs';

export const personalKeySchema=z.object({name:z.string().trim().min(1).max(60).refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'名称不能包含控制字符')}).strict();
export const personalKeyScope=['content:read','draft:create'];
export const maxPersonalKeys=5;
const metadata='id,name,prefix,created_at,last_used_at,revoked_at';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const changes=r=>r?.meta?.changes??r?.changes??0;

// Both adapters execute a single conditional INSERT so concurrent requests cannot
// exceed the quota. Only the digest is retained; owner always comes from a session.
export function createPersonalKeys({get,all,run,audit}){
  return {
    async list(member){return {keys:await all(`SELECT ${metadata} FROM member_agent_keys WHERE owner_member_id=? ORDER BY created_at DESC,rowid DESC`,member.id),maxActive:maxPersonalKeys,scope:personalKeyScope};},
    async create(member,input){
      const {name}=personalKeySchema.parse(input),id=crypto.randomUUID(),key='lym_'+randomSecret(),date=new Date().toISOString();
      const result=await run('INSERT INTO member_agent_keys(id,owner_member_id,name,key_hash,prefix,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM member_agent_keys WHERE owner_member_id=? AND revoked_at IS NULL)<?',id,member.id,name,await digest(key),key.slice(0,10),date,member.id,maxPersonalKeys);
      if(!changes(result))throw fail(429,'每个账号最多保留5枚有效令牌，请先撤销不再使用的令牌');
      await audit('create_member_agent_key',`${member.id}:${id}`);
      return {id,name,key,scope:personalKeyScope};
    },
    async revoke(member,id){
      const result=await run('UPDATE member_agent_keys SET revoked_at=? WHERE id=? AND owner_member_id=? AND revoked_at IS NULL',new Date().toISOString(),id,member.id);
      if(!changes(result))throw fail(404,'令牌不存在或已撤销');
      await audit('revoke_member_agent_key',`${member.id}:${id}`);return {ok:true};
    },
    async authenticate(token){
      const row=await get('SELECT k.*,a.nickname AS owner_nickname,a.joined_at AS owner_joined_at FROM member_agent_keys k JOIN member_accounts a ON a.member_id=k.owner_member_id WHERE k.key_hash=? AND k.revoked_at IS NULL',await digest(token));
      return row||null;
    },
    async used(id){await run('UPDATE member_agent_keys SET last_used_at=? WHERE id=?',new Date().toISOString(),id);}
  };
}

export function memberAgentDraft(agent,input){
  if(!agent.owner_member_id)return {input,sourceLabel:agent.name};
  if(!agent.owner_joined_at)throw fail(403,'请先登录网站，在加入社群页面完成入群问答，再让智能体提交草稿');
  if(input.kind==='note')input.data.author=agent.owner_nickname;
  if(input.kind==='activity')input.data.proposer=agent.owner_nickname;
  return {input,sourceLabel:`${agent.owner_nickname} · ${agent.name}`};
}
