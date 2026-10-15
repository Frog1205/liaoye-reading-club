import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
await build({entryPoints:['cloud/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/_worker.js'});
await writeFile('dist/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));
