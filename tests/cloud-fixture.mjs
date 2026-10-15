import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {handle,passwordHash} from '../cloud/worker.mjs';
export async function createCloudApp(options){
  const store=createStore(options.dataDir,{seed:options.seed});store.db.exec(readFileSync(new URL('../cloud/schema.sql',import.meta.url),'utf8'));
  const salt=crypto.randomUUID();
  const operatorSalt=crypto.randomUUID();
  const env={ENVIRONMENT:'test',ADMIN_PASSWORD_SALT:salt,ADMIN_PASSWORD_HASH:await passwordHash(options.adminPassword,salt),ASSETS:{fetch:()=>new Response('fixture')},DB:{prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return store.db.prepare(sql).get(...values)||null;},async all(){return{results:store.db.prepare(sql).all(...values)};},async run(){const r=store.db.prepare(sql).run(...values);return{meta:{changes:r.changes}};}};return stmt;}}};
  if(options.operatorPassword){env.OPERATOR_PASSWORD_SALT=operatorSalt;env.OPERATOR_PASSWORD_HASH=await passwordHash(options.operatorPassword,operatorSalt);}
  const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
  return{server,store};
}
