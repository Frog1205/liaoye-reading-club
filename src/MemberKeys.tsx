import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,Copy,KeyRound,LoaderCircle,Plus,ShieldCheck} from 'lucide-react';
import {api} from './api';
import {Modal} from './components';
import type {AgentKey,State} from './types';

type KeyList={keys:AgentKey[];maxActive:number;scope:string[]};
export default function MemberKeys({member,openAccount,join,notify}:{member:State['member'];openAccount:()=>void;join:()=>void;notify:(message:string)=>void}){
  if(!member)return <section className="panel personal-keys" id="personal-keys"><span className="round-icon"><KeyRound size={23}/></span><h2>每个人，都可以带上自己的智能体</h2><p className="muted">注册并登录后，就能创建个人令牌。你的智能体可以读取公开书单，整理内容并提交待审草稿。</p><button className="button" onClick={openAccount}>登录 / 注册，创建个人令牌<ArrowRight size={15}/></button></section>;
  return <KeyManager key={member.id} member={member} join={join} notify={notify}/>;
}

function KeyManager({member,join,notify}:{member:NonNullable<State['member']>;join:()=>void;notify:(message:string)=>void}){
  const [data,setData]=useState<KeyList|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState(''),[secret,setSecret]=useState(''),[revoke,setRevoke]=useState<AgentKey|null>(null),[retry,setRetry]=useState(0);
  const load=useCallback(async()=>{const result=await api<KeyList>('/api/account/keys');setData(result);},[]);
  useEffect(()=>{let active=true;void api<KeyList>('/api/account/keys').then(result=>{if(active){setData(result);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry]);
  const count=data?.keys.filter(k=>!k.revoked_at).length||0;
  async function create(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await api<{key:string}>('/api/account/keys','POST',{name});setSecret(result.key);setName('');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function confirmRevoke(){if(!revoke||busy)return;setBusy(true);setError('');try{await api(`/api/account/keys/${revoke.id}`,'DELETE');setRevoke(null);await load();notify('个人令牌已撤销，已提交的草稿会保留');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel personal-keys" id="personal-keys"><div className="section-heading"><h2><KeyRound size={19}/>我的个人令牌</h2><span className="small-tag">{member.nickname} · {count}/{data?.maxActive||5} 枚有效</span></div><p className="muted">给每个阅读搭子一枚独立令牌，由你随时撤销。这里只显示你自己的令牌，不需要管理口令。</p>
    {!member.joined&&<div className="form-note">注册账号后即可创建和连接令牌。提交共创草稿前，请先完成入群问答。<button className="text-button" onClick={join}>去完成问答<ArrowRight size={14}/></button></div>}
    {error&&<div><p className="form-error" role="alert">{error}</p><button className="text-button" disabled={busy} onClick={()=>setRetry(v=>v+1)}>重新加载令牌列表</button></div>}
    {!data&&!error?<p className="muted" role="status">正在读取你的令牌…</p>:data&&<><form className="personal-key-form" onSubmit={create}><label>智能体名称<input value={name} onChange={e=>setName(e.target.value)} required maxLength={60} placeholder="例如：我的 Codex" disabled={busy}/></label><button className="button" disabled={busy||count>=data.maxActive}>{busy?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>}创建个人令牌</button></form>{count>=data.maxActive&&<p className="form-hint">已达到有效令牌上限，请先撤销不再使用的令牌。</p>}
    {!data.keys.length?<p className="personal-key-empty">还没有授权智能体。从创建第一枚令牌开始吧。</p>:<div className="key-list">{data.keys.map(k=><div className="key-row" key={k.id}><span className="round-icon small-icon"><KeyRound size={16}/></span><div><strong>{k.name}</strong><p>{k.prefix}•••• · {k.revoked_at?'已撤销':k.last_used_at?'已连接使用':'等待首次连接'}</p><p>创建于 {new Date(k.created_at).toLocaleString('zh-CN')}{k.last_used_at?` · 最近使用 ${new Date(k.last_used_at).toLocaleString('zh-CN')}`:''}</p></div>{!k.revoked_at&&<button className="text-button danger" disabled={busy} aria-label={`撤销令牌 ${k.name}`} onClick={()=>setRevoke(k)}>撤销</button>}</div>)}</div>}</>}
    <p className="form-hint personal-key-permissions"><ShieldCheck size={14}/>仅可读取公开内容、提交草稿。不能发布、读取社群联系人或管理其他人的令牌。</p>
    {secret&&<Modal title="保存你的个人令牌" subtitle="完整令牌仅在创建后显示一次，关闭后不能再次查看。" close={()=>setSecret('')}><div className="secret-box"><code>{secret}</code></div><p className="form-hint">将它保存在智能体的私有环境变量 LIAOYE_AGENT_KEY 中，网站地址设为 https://liaoye.veynuq.com。不要发到群聊或提交到仓库。</p><button className="button" onClick={()=>void navigator.clipboard.writeText(secret).then(()=>notify('已复制个人令牌，请妥善保存')).catch(()=>notify('复制失败，请手动选择复制'))}><Copy size={15}/>复制个人令牌</button><p className="form-hint">遗失时撤销旧令牌，再创建一枚。</p><button className="text-button" onClick={()=>setSecret('')}>我已保存，关闭</button></Modal>}
    {revoke&&<Modal title={`撤销「${revoke.name}」？`} subtitle="撤销后不能恢复，该智能体将无法继续读取或提交，已有草稿会保留。" close={()=>{if(!busy)setRevoke(null);}}><button className="button danger-button" disabled={busy} onClick={()=>void confirmRevoke()}>{busy?<LoaderCircle className="spin" size={15}/>:<KeyRound size={15}/>}确认撤销个人令牌</button><button className="text-button" disabled={busy} onClick={()=>setRevoke(null)}>取消</button></Modal>}
  </section>;
}
