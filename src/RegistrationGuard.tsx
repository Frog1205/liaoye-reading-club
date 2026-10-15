import {useEffect,useRef,useState} from 'react';
import {api} from './api';
export type RegistrationConfig={enabled:boolean;required:boolean;available:boolean;siteKey:string};
type Turnstile={render:(node:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
declare global {interface Window{turnstile?:Turnstile}}
let scriptPromise:Promise<Turnstile>|undefined;
function loadTurnstile(){
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!scriptPromise)scriptPromise=new Promise<Turnstile>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    const timer=window.setTimeout(()=>{script.remove();scriptPromise=undefined;reject(new Error('安全验证加载超时，请重试'));},15000);
    script.onload=()=>{clearTimeout(timer);if(window.turnstile)resolve(window.turnstile);else{scriptPromise=undefined;reject(new Error('安全验证加载失败，请重试'));}};
    script.onerror=()=>{clearTimeout(timer);script.remove();scriptPromise=undefined;reject(new Error('安全验证加载失败，请检查网络后重试'));};document.head.appendChild(script);
  });
  return scriptPromise;
}
export function RegistrationGuard({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}){
  const node=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken;
  const [error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true,id:string|undefined,client:Turnstile|undefined;callback.current('');setError('');
    void loadTurnstile().then(c=>{client=c;if(active&&node.current)id=c.render(node.current,{sitekey:siteKey,action:'register',theme:'light',size:'flexible',callback:(token:string)=>{if(active){setError('');callback.current(token);}},'expired-callback':()=>{if(active){callback.current('');setError('安全验证已过期，请重新验证');}},'error-callback':()=>{if(active){callback.current('');setError('安全验证未完成，请重试');}}});}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;if(id)client?.remove(id);};
  },[siteKey,retry]);
  return <div className="registration-guard"><div ref={node} aria-label="注册安全验证"/>{error&&<p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={()=>setRetry(n=>n+1)}>重新验证</button></p>}<p className="form-hint">安全验证用于减少机器人批量注册。</p></div>;
}
export function RegistrationSwitch({notify}:{notify:(text:string)=>void}){
  const [enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void api<{enabled:boolean}>('/api/admin/registration').then(v=>{if(active)setEnabled(v.enabled);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  async function toggle(){if(enabled===null)return;setBusy(true);setError('');try{const result=await api<{enabled:boolean}>('/api/admin/registration','PUT',{enabled:!enabled});setEnabled(result.enabled);notify(result.enabled?'已恢复新账号注册':'已暂停新账号注册，已有账号可继续登录');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel"><div className="section-heading"><h2>新账号注册保护</h2><span className="small-tag">{enabled===null?'读取中':enabled?'注册开放':'注册暂停'}</span></div><p className="muted">发现异常注册时可临时关闭入口，不影响已有账号登录、公开阅读和后台管理。</p>{error&&<p className="form-error" role="alert">{error}</p>}<button className="button secondary" disabled={busy||enabled===null} onClick={()=>void toggle()}>{enabled?'暂停新注册':'恢复新注册'}</button></section>;
}
