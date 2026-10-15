import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,Check,Copy,KeyRound,LoaderCircle,LockKeyhole,LogOut,MessageCircle,Plus,Trash2,Users} from 'lucide-react';
import {api} from './api';
import {JoinForm} from './components';
import {type CommunityContact,type State} from './types';
import {RegistrationGuard,type RegistrationConfig} from './RegistrationGuard';

export function AccountForm({done}:{done:()=>Promise<void>}){
  const [mode,setMode]=useState<'login'|'register'>('login'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [security,setSecurity]=useState<RegistrationConfig|null>(null),[token,setToken]=useState(''),[challenge,setChallenge]=useState(0),[configRetry,setConfigRetry]=useState(0);
  useEffect(()=>{let active=true;setToken('');setSecurity(null);if(mode==='register')void api<RegistrationConfig>('/api/account/security').then(v=>{if(active)setSecurity(v);}).catch(()=>{if(active)setError('无法读取注册安全配置，请重试');});return()=>{active=false;};},[mode,configRetry]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget),password=String(f.get('password')||'');setError('');
    if(mode==='register'&&password!==f.get('confirm')){setError('两次输入的密码不一致');return;}
    if(mode==='register'&&(!security?.enabled||!security.available||(security.required&&!token))){setError('注册暂不可用或尚未完成安全验证');return;}
    setBusy(true);try{await api(`/api/account/${mode}`,'POST',{wechat:f.get('wechat'),password,...(mode==='register'?{nickname:f.get('nickname'),...(security?.required?{turnstileToken:token}:{})}:{})});await done();}catch(e){setError((e as Error).message);if(mode==='register'){setToken('');setChallenge(n=>n+1);}}finally{setBusy(false);}
  }
  return <><div className="segmented account-tabs" aria-label="账号操作"><button type="button" disabled={busy} className={mode==='login'?'selected':''} onClick={()=>{setMode('login');setError('');}}>已有账号，登录</button><button type="button" disabled={busy} className={mode==='register'?'selected':''} onClick={()=>{setMode('register');setError('');}}>第一次来，注册</button></div><form key={mode} className="form" onSubmit={submit}>
    {mode==='register'&&<label>昵称<input name="nickname" autoComplete="nickname" maxLength={24} required placeholder="大家怎么称呼你"/></label>}
    <label>微信号<input name="wechat" autoComplete="username" minLength={6} maxLength={64} required placeholder="填写微信号，不是微信昵称" autoCapitalize="none" spellCheck={false}/></label>
    <label>密码<input name="password" type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={mode==='register'?6:1} maxLength={128} required placeholder={mode==='register'?'设置至少 6 位密码':'输入本站账号密码'}/></label>
    {mode==='register'&&<label>确认密码<input name="confirm" type="password" autoComplete="new-password" minLength={6} maxLength={128} required placeholder="再次输入密码"/></label>}
    <p className="form-hint">{mode==='register'?'微信号用于本站登录与社群联络，不向其他成员公开。同一微信号只能注册一次，昵称可以重名。注册后即可在其他浏览器登录。':'使用微信号和本站密码登录；不是微信官方授权登录。忘记密码请在已有社群渠道联系管理员核实处理。'}</p>
    {mode==='register'&&(!security?<p className="form-hint">正在读取注册安全配置… <button type="button" className="text-button" onClick={()=>setConfigRetry(n=>n+1)}>重新加载</button></p>:!security.enabled?<p className="form-error" role="alert">新账号注册暂时关闭，已有账号可切换到登录。</p>:!security.available?<p className="form-error" role="alert">注册安全验证暂不可用，请稍后重试。</p>:security.required&&<RegistrationGuard key={challenge} siteKey={security.siteKey} onToken={setToken}/>)}
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy||(mode==='register'&&(!security?.enabled||!security?.available||(security.required&&!token)))}>{busy?<LoaderCircle className="spin" size={16}/>:<KeyRound size={16}/>} {mode==='register'?'注册并登录':'登录账号'}</button>
  </form></>;
}

type CommunityData={member:{id:string;nickname:string;wechat:string;joined:boolean};contacts:CommunityContact[]};
export default function Community({state,refresh,openAccount,notify}:{state:State;refresh:()=>Promise<void>;openAccount:()=>void;notify:(text:string)=>void}){
  const [data,setData]=useState<CommunityData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const memberId=state.member?.id,joined=state.member?.joined;
  useEffect(()=>{let active=true;setData(null);setError('');if(memberId)void api<CommunityData>('/api/community').then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[memberId,joined,retry]);
  async function logout(){setBusy(true);try{await api('/api/account/logout','POST');setData(null);await refresh();notify('已退出账号，之后可使用微信号和密码重新登录');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <><div className="page-heading"><div><span className="eyebrow">JOIN THE CONVERSATION</span><h1>从认识，到相见<span className="heading-dot">.</span></h1><p>先有一个可以回来登录的账号，再一起把书读下去。</p></div>{state.member&&<button className="button secondary" disabled={busy} onClick={()=>void logout()}><LogOut size={15}/>退出账号</button>}</div>
    {!state.member?<section className="community-gate panel"><span className="round-icon"><LockKeyhole size={26}/></span><h2>加入聊也，先认识一下。</h2><p>注册只需昵称、微信号与本站密码。登录后才能查看群主、运营人员的微信，并填写入群问答。</p><div className="community-steps"><span>01 注册／登录账号</span><ArrowRight size={16}/><span>02 填写三个问题</span><ArrowRight size={16}/><span>03 添加联系人，由对方邀你入群</span></div><button className="button" onClick={openAccount}><Users size={16}/>登录 / 注册，加入社群</button><p className="form-hint">公开书单和心得可以直接阅读。网站登记不会自动加入微信群。</p></section>:<>
      <section className="member-welcome panel"><div><span className="eyebrow">YOUR READING ACCOUNT</span><h2>欢迎回来，{state.member.nickname}。</h2><p>{data?`登录微信号：${data.member.wechat}`:'正在读取账号资料…'}</p></div><span className="small-tag">{joined?'已完成入群问答':'账号已注册 · 问答待填写'}</span></section>
      {error&&<div className="panel"><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={()=>setRetry(v=>v+1)}>重新加载</button></div>}
      <div className="community-columns">{!joined&&<section className="panel"><div className="section-heading"><h2>三个问题，开始共读</h2></div><JoinForm done={async()=>{await refresh();notify('入群登记已完成，添加联系人并备注昵称，由对方邀请入群');}}/></section>}
      <section className="panel community-contacts"><div className="section-heading"><h2><MessageCircle size={19}/>社群加入入口</h2><span className="small-tag"><LockKeyhole size={12}/>仅登录成员可见</span></div><p className="muted">添加群主或运营人员的微信，备注“聊也读书＋你的注册昵称”，由对方邀请入群。不要向联系人索要本站密码。</p>{!data&&!error?<p className="muted">正在打开加入入口…</p>:data?.contacts.length?<div className="contact-list">{data.contacts.map(c=><article className="contact-card" key={c.wechat}><div><span className="small-tag">{c.role==='owner'?'群主':'社群运营'}</span><h3>{c.name}</h3><p className="contact-wechat">微信号：<strong>{c.wechat}</strong></p></div><button className="button secondary small-button" onClick={()=>void navigator.clipboard.writeText(c.wechat).then(()=>notify('已复制微信号')).catch(()=>notify('复制失败，请手动复制微信号'))}><Copy size={14}/>复制</button></article>)}</div>:data&&<p className="form-hint">联系方式正在补充，请稍后回来查看。</p>}<p className="form-hint">只有登录账号才能通过本站接口读取这些联系方式；退出后将不再显示。</p></section></div>
    </>}
  </>;
}

export function CommunityContactsEditor({notify}:{notify:(text:string)=>void}){
  const [contacts,setContacts]=useState<CommunityContact[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void api<{contacts:CommunityContact[]}>('/api/admin/community-contacts').then(v=>{if(active)setContacts(v.contacts.length?v.contacts:[{name:'',wechat:'',role:'owner'}]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  function edit(index:number,key:keyof CommunityContact,value:string){setContacts(rows=>rows?.map((c,i)=>i===index?{...c,[key]:value}:c)||null);}
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/api/admin/community-contacts','PUT',{contacts});notify('社群联系方式已保存，仅登录成员可见');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel"><div className="section-heading"><h2><MessageCircle size={18}/>社群加入联系人</h2><span className="small muted">仅向登录账号开放</span></div><p className="muted">可维护群主微信，并追加运营人员。联系方式只保存在服务端，不写入公开页面或源码。</p>{error&&<p className="form-error" role="alert">{error}</p>}{contacts?<form className="form" onSubmit={save}>{contacts.map((c,i)=><div className="contact-edit-row" key={i}><label>称呼<input required maxLength={30} aria-label={`联系人${i+1}称呼`} value={c.name} onChange={e=>edit(i,'name',e.target.value)}/></label><label>身份<select value={c.role} aria-label={`联系人${i+1}身份`} onChange={e=>edit(i,'role',e.target.value)}><option value="owner">群主</option><option value="operator">运营人员</option></select></label><label>微信号<input required minLength={6} maxLength={64} aria-label={`联系人${i+1}微信号`} value={c.wechat} onChange={e=>edit(i,'wechat',e.target.value)} autoCapitalize="none" spellCheck={false}/></label><button type="button" className="icon-button danger" disabled={busy||contacts.length<=1} aria-label={`删除联系人${i+1}`} onClick={()=>setContacts(rows=>rows?.filter((_,n)=>n!==i)||null)}><Trash2 size={17}/></button></div>)}<div className="contact-editor-actions"><button type="button" className="button secondary" disabled={busy||contacts.length>=10} onClick={()=>setContacts(rows=>[...(rows||[]),{name:'',wechat:'',role:'operator'}])}><Plus size={15}/>添加运营联系人</button><button className="button" disabled={busy}>{busy?<LoaderCircle className="spin" size={15}/>:<Check size={15}/>}保存联系方式</button></div></form>:!error&&<p className="muted">正在读取联系人…</p>}</section>;
}
