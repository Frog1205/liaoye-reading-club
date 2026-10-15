// Separate disposable database for manual browser QA. Never uses data/.
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const {server,store}=createApp({dataDir:join(root,'artifacts','ui-preview-data'),publicDir:join(root,'dist'),adminPassword:'local-ui-test-password'});
server.listen(4318,'127.0.0.1',()=>console.log('Disposable UI preview: http://127.0.0.1:4318'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
