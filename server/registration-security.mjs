const fail=(status,message)=>Object.assign(new Error(message),{status});
export const registrationBodyLimit=8192;
export function registrationSecurity({required=false,siteKey='',secret='',enabled=true}={}){
  return {enabled,required,siteKey:required?siteKey:'',available:!required||Boolean(siteKey&&secret&&!/^[123]x0000/.test(siteKey))};
}
export async function verifyRegistration({required,siteKey,secret,token,hostname,remoteip,fetcher=fetch}){
  if(!required)return;
  if(!registrationSecurity({required,siteKey,secret}).available)throw fail(503,'注册安全验证暂不可用，请稍后重试');
  if(typeof token!=='string'||!token||token.length>2048)throw fail(403,'请先完成安全验证');
  let response,result;
  try{
    response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret,response:token,...(remoteip?{remoteip}:{}),idempotency_key:crypto.randomUUID()}),signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error('Verification unavailable');
    result=await response.json();
  }catch{throw fail(503,'安全验证服务暂时不可用，请重试');}
  if(result.success!==true||result.hostname!==hostname||result.action!=='register')throw fail(403,'安全验证未通过或已过期，请重新验证');
}
