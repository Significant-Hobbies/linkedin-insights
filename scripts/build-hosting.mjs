import {mkdir,mkdtemp,rename} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.artifacts',{recursive:true});
try{const previous=await mkdtemp('.artifacts/previous-hosting-');await rename('.cloudflare/output',`${previous}/output`)}catch(error){if(error.code!=='ENOENT')throw error}
const result=spawnSync('pnpm',['exec','cf','build'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
