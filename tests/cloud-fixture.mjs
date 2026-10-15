import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createStore} from '../server/store.mjs';
import {handle,passwordHash} from '../cloud/worker.mjs';
export async function createCloudApp(options){
  const store=createStore(options.dataDir,{seed:options.seed});store.db.exec(readFileSync(new URL('../cloud/schema.sql',import.meta.url),'utf8'));
  const salt=crypto.randomUUID();
  const operatorSalt=crypto.randomUUID();
  const env={ENVIRONMENT:'test',MEMBER_PASSWORD_PEPPER:options.memberPepper||'fixture-only-pepper-32-characters-long',ADMIN_PASSWORD_SALT:salt,ADMIN_PASSWORD_HASH:await passwordHash(options.adminPassword,salt),ASSETS:{fetch:()=>new Response('fixture')},DB:{prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return store.db.prepare(sql).get(...values)||null;},async all(){return{results:store.db.prepare(sql).all(...values)};},execute(){const r=store.db.prepare(sql).run(...values);return{meta:{changes:r.changes}};},async run(){return stmt.execute();}};return stmt;},async batch(statements){store.db.exec('BEGIN IMMEDIATE');try{const rows=statements.map(s=>s.execute());store.db.exec('COMMIT');return rows;}catch(e){store.db.exec('ROLLBACK');throw e;}}}};
  if(options.operatorPassword){env.OPERATOR_PASSWORD_SALT=operatorSalt;env.OPERATOR_PASSWORD_HASH=await passwordHash(options.operatorPassword,operatorSalt);}
  const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
  return{server,store};
}
