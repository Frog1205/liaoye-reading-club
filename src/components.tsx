import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, Heart, MapPin, Sparkles, X, LoaderCircle, Pencil, MessageCircle, ChevronRight } from 'lucide-react';
import { api, monday } from './api';
import { type ContentData, type EditorState, type Entry, type State, kindNames } from './types';

export function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle?: string; children: ReactNode; close:()=>void; wide?:boolean }) {
  const ref = useRef<HTMLDivElement>(null), titleId = useId();
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(()=>{
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow; document.body.style.overflow='hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]') || []);
    focusable()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if(event.key==='Escape') closeRef.current();
      if(event.key==='Tab') { const items=focusable(),first=items[0],last=items[items.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();} else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();} }
    };
    document.addEventListener('keydown',handler);
    return()=>{ document.body.style.overflow=overflow; document.removeEventListener('keydown',handler); previous?.focus(); };
  },[]);
  return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)close();}}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${wide?'wide':''}`}><div className="modal-head"><div><span className="eyebrow">LIAOYE READING CLUB</span><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={close} aria-label="关闭弹窗"><X size={20}/></button></div>{children}</div></div>;
}

export function Empty({ title='这里还留着一页空白', description='第一份分享，可以从你开始。', action }: {title?:string;description?:string;action?:ReactNode}) {
  return <div className="empty"><BookOpen size={32} strokeWidth={1.3}/><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function BookCover({ entry, large = false }: {entry:Entry;large?:boolean}) {
  return <div className={`cover cover-${entry.data.cover || 'sage'} ${large?'large':''}`} aria-hidden="true"><div className="cover-rule"/><span className="cover-kicker">聊也 · 共读藏书</span><strong>{entry.data.title}</strong><span className="cover-author">{entry.data.author}</span><div className="cover-art"><span/><span/><span/></div><span className="cover-imprint">A BOOK, A CONVERSATION.</span><div className="book-spine"/></div>;
}

export function BookCard({entry,open,edit}:{entry:Entry;open:()=>void;edit?:()=>void}) {
  return <article className="book-card"><button className={`book-art art-${entry.data.cover}`} onClick={open} aria-label={`查看《${entry.data.title}》`}><BookCover entry={entry}/>{entry.demo&&<span className="demo-badge">示例书单</span>}<span className="book-open"><ArrowUpRight size={17}/></span></button><div className="book-info"><span className="category">{entry.data.category}</span><h3><button onClick={open}>{entry.data.title}</button></h3><p className="book-author">{entry.data.author}</p><p className="book-description">{entry.data.description}</p><div className="book-foot"><span><BookOpen size={13}/>{entry.data.cadence==='weekly'?'本周慢读':'本月共读'}</span>{edit?<button onClick={edit}><Pencil size={13}/>编辑</button>:<button onClick={open} aria-label={`阅读《${entry.data.title}》介绍`}><ArrowUpRight size={17}/></button>}</div></div></article>;
}

export function NoteCard({entry,open,compact=false}:{entry:Entry;open:()=>void;compact?:boolean}) {
  return <article className={`note-card ${compact?'compact':''}`}><div className="note-top"><span className="note-book"><BookOpen size={13}/>《{entry.data.bookTitle}》</span>{entry.demo&&<span className="small-tag">示例</span>}</div><h3><button onClick={open}>{entry.data.title}</button></h3><p>{entry.data.body?.replace('这是一篇用于展示排版的示例心得。','').trim().slice(0,110)}</p><div className="note-foot"><span className="author-avatar">{entry.data.author?.slice(0,1)}</span><span>{entry.data.author}</span>{entry.source==='agent'&&<Sparkles size={12}/>}<button onClick={open} aria-label={`阅读心得：${entry.data.title}`}>读一读<ArrowUpRight size={15}/></button></div></article>;
}

export function ActivityCard({entry,state,open,onVote}:{entry:Entry;state:State;open:()=>void;onVote:(entry:Entry)=>void}) {
  const enoughVotes = (entry.votes || 0)>=state.community.proposalThreshold;
  const enoughMembers = state.community.firstMeetingHeld || (state.community.groupSize || 0)>=state.community.firstMeetingThreshold;
  return <article className="activity-card"><div className="activity-number"><MessageCircle size={28} strokeWidth={1.1}/><span>一起相见</span></div><div className="activity-main"><div className="inline-tags"><span className="small-tag">{entry.demo?'活动示例':enoughVotes&&enoughMembers?'可筹备 · 待确认时间':enoughVotes?'已有 3 人支持':'征集同行'}</span>{!entry.demo&&!enoughMembers&&<span className="muted small">首场待群满 100 人</span>}</div><h3><button onClick={open}>{entry.data.title}</button></h3><p>{entry.data.description}</p><div className="activity-meta"><span><MapPin size={14}/>{entry.data.location}</span><span>{entry.data.proposer} 发起</span></div></div><div className="vote-area"><strong>{entry.votes || 0}<small> / 3</small></strong><span>位朋友支持</span><button className={entry.voted?'button small-button secondary':'button small-button'} onClick={()=>onVote(entry)} disabled={entry.demo}>{entry.demo?<BookOpen size={14}/>:entry.voted?<Check size={14}/>:<Heart size={14}/>} {entry.demo?'示例暂不投票':entry.voted?'已支持 · 取消':'我想参加'}</button></div></article>;
}

export function JoinForm({done}:{done:()=>Promise<void>}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true);setError('');
    try { await api('/api/join','POST',{recommendedBook:form.get('book'),value:form.get('value'),aiExperience:form.get('ai'),agreed:form.get('agreed')==='on'});await done(); }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="form"><label><span className="form-number">01</span>如果推荐一本书，你会推荐什么？<input name="book" placeholder="书名，以及你想说的一句话" maxLength={100} required/></label><label><span className="form-number">02</span>除了书本，你期待读书会带来什么？<textarea name="value" placeholder="认识新朋友、听见不同观点、给自己一点阅读的时间……" maxLength={300} required rows={3}/></label><label><span className="form-number">03</span>你使用过 AI 辅助阅读吗？<select name="ai"><option>还没用过</option><option>偶尔试过</option><option>经常使用</option></select></label><label className="checkbox"><input name="agreed" type="checkbox" required/><span>我愿意友善交流，不争吵，不讨论政治、宗教、性话题。</span></label><p className="form-hint">这是已登录账号的入群登记，不会自动加入微信群。问答保存在本站，不公开展示。</p>{error&&<p role="alert" className="form-error">{error}</p>}<button className="button" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}很高兴，在这里认识你</button></form>;
}

export function ContentEditor({editor,state,done}:{editor:EditorState;state:State;done:()=>Promise<void>}) {
  const {kind,entry}=editor;
  const [cadence,setCadence]=useState(entry?.data.cadence || 'monthly'),[period,setPeriod]=useState(entry?.data.period || state.month);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');setBusy(true);
    const form=new FormData(event.currentTarget),value=(key:string)=>String(form.get(key)||'').trim();
    let data:ContentData={title:value('title')};
    if(kind==='book'){const selectedPeriod=value('period');data={...data,author:value('author'),description:value('description'),category:value('category'),cover:value('cover'),cadence,period:cadence==='weekly'?monday(selectedPeriod):selectedPeriod};}
    if(kind==='note')data={...data,bookTitle:value('bookTitle'),author:value('author')||state.member?.nickname||'社群主理人',body:value('body')};
    if(kind==='activity')data={...data,description:value('description'),location:value('location'),proposer:value('proposer')||state.member?.nickname||'社群主理人'};
    try { await api(state.admin?entry?`/api/admin/content/${entry.id}`:'/api/admin/content':'/api/submissions',state.admin&&entry?'PUT':'POST',{kind,data}); await done(); }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <form onSubmit={submit} className="form"><label>{kind==='book'?'书名':kind==='note'?'给这篇心得起个名字':'你想发起什么主题？'}<input name="title" defaultValue={entry?.data.title} maxLength={100} placeholder={kind==='book'?'想和大家一起读的那一本':'从一个真实的问题开始'} required/></label>
    {kind==='book'&&<><div className="form-grid"><label>作者<input name="author" defaultValue={entry?.data.author} required maxLength={100}/></label><label>阅读方向<input name="category" defaultValue={entry?.data.category || '自由共读'} required maxLength={24}/></label></div><label>为什么想一起读？<textarea name="description" defaultValue={entry?.data.description} rows={3} required maxLength={1200}/></label><div className="form-grid"><label>共读节奏<select value={cadence} onChange={e=>{const value=e.target.value as 'monthly'|'weekly';setCadence(value);setPeriod(value==='monthly'?state.month:state.week);}}><option value="monthly">月度共读</option><option value="weekly">每周慢读</option></select></label><label>{cadence==='monthly'?'共读月份':'选择本周任意一天'}<input name="period" type={cadence==='monthly'?'month':'date'} value={period} onChange={e=>setPeriod(e.target.value)} required/></label></div><label>书封配色<select name="cover" defaultValue={entry?.data.cover || 'sage'}><option value="sage">草木绿</option><option value="clay">陶土红</option><option value="sand">麦纸黄</option><option value="ink">墨蓝</option></select></label></>}
    {kind==='note'&&<><div className="form-grid"><label>关于哪本书<input name="bookTitle" defaultValue={entry?.data.bookTitle || editor.bookTitle} required maxLength={100}/></label><label>署名<input name="author" defaultValue={entry?.data.author || state.member?.nickname || '社群主理人'} readOnly={!state.admin} required maxLength={60}/></label></div><label>写下你的阅读所得<textarea name="body" defaultValue={entry?.data.body} placeholder="哪一段让你停下来？它让你想起什么？还有什么想和大家聊？" rows={9} minLength={20} maxLength={12000} required/></label></>}
    {kind==='activity'&&<><label>为什么想聊这个主题？<textarea name="description" defaultValue={entry?.data.description} rows={5} minLength={20} maxLength={2000} required/></label><div className="form-grid"><label>意向地点<input name="location" defaultValue={entry?.data.location || '南边 · 地点待共议'} required maxLength={120}/></label><label>发起人<input name="proposer" defaultValue={entry?.data.proposer || state.member?.nickname || '社群主理人'} readOnly={!state.admin} required maxLength={60}/></label></div></>}
    <div className="form-note">{state.admin?'发布后会显示在社群网站，请确认内容、署名和日期。':'你的分享会先进入待审草稿，确认后与大家见面。'}</div>{error&&<p role="alert" className="form-error">{error}</p>}<button className="button" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<ArrowUpRight size={16}/>} {state.admin?entry?.status==='pending'?'确认并发布':`发布${kindNames[kind]}`:'提交草稿'}</button>
  </form>;
}

export function Detail({entry,edit,onNote}:{entry:Entry;edit?:()=>void;onNote:()=>void}) {
  return <div className="detail">{entry.demo&&<div className="sample-inline">这是一份示例内容，用于展示网站形式。</div>}{entry.kind==='book'?<><div className="book-detail"><BookCover entry={entry} large/><div><span className="category">{entry.data.category}</span><h3>{entry.data.title}</h3><p>{entry.data.author}</p><p className="detail-intro">{entry.data.description}</p><span className="small-tag">{entry.data.cadence==='monthly'?'月度共读':'每周慢读'} · {entry.data.period}</span></div></div><button className="button" onClick={onNote}><Pencil size={15}/>写下这本书的心得</button></>:entry.kind==='note'?<><div className="detail-byline"><BookOpen size={15}/>《{entry.data.bookTitle}》<span>·</span>{entry.data.author}</div><div className="prose">{entry.data.body?.split('\n').map((p,i)=>p?<p key={i}>{p}</p>:null)}</div></>:<><div className="detail-byline"><MapPin size={15}/>{entry.data.location}<span>·</span>{entry.data.proposer} 发起</div><div className="prose"><p>{entry.data.description}</p></div><p className="form-note">提议至少获得 3 人支持，并在群满 100 人后，由发起人与参与者确认时间和地点。</p></>}{entry.source==='agent'&&<p className="form-hint">由 {entry.sourceLabel} 辅助整理，经人工确认发布。</p>}{edit&&<button className="text-button" onClick={edit}>编辑这份内容<ChevronRight size={15}/></button>}</div>;
}
