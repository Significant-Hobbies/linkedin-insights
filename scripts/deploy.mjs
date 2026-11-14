import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {verifyReleaseArtifact} from './release-artifact.mjs';
const repository='Significant-Hobbies/linkedin-insights';
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sha=run('git',['rev-parse','HEAD']);
if(run('git',['branch','--show-current'])!=='main'||run('git',['status','--porcelain']))throw new Error('Release requires clean main.');
if(run('git',['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==sha)throw new Error('Release source must match origin/main.');
const runs=JSON.parse(run('gh',['api',`repos/${repository}/actions/runs?head_sha=${sha}&branch=main&event=push&per_page=100`]));
const ci=runs.workflow_runs?.find(r=>r.path==='.github/workflows/ci.yml');
if(!ci||ci.head_sha!==sha||ci.status!=='completed'||ci.conclusion!=='success')throw new Error('Exact-main CI must pass before release.');
await mkdir('.artifacts',{recursive:true});
const stage=path.resolve(await mkdtemp('.artifacts/release-'));
const output=path.join(stage,'.cloudflare/output/v0');
run('gh',['run','download',String(ci.id),'--repo',repository,'--name',`release-${sha}`,'--dir',output]);
const manifest=await verifyReleaseArtifact(output,sha);
console.log(`Verified CI run ${ci.id}: ${manifest.files} static assets from ${sha}.`);
const env={...process.env};
if(!env.CLOUDFLARE_API_TOKEN){
  // Official credential handoff: token stays in memory and child environment only.
  const auth=JSON.parse(run('pnpm',['exec','wrangler','auth','token','--json']));
  if(!auth.token)throw new Error('Sign in to Cloudflare before deployment.');
  env.CLOUDFLARE_API_TOKEN=auth.token;
}
const result=spawnSync(path.resolve('node_modules/.bin/cf'),['deploy','--prebuilt','--tag',sha.slice(0,12),'--message',`Release ${sha}`],{cwd:stage,env,stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
await writeFile('.artifacts/release-source.json',JSON.stringify({sha,ciRun:ci.id,stage,files:manifest.files},null,2));
console.log('Rollback: redeploy a previously verified Worker version with cf workers deployments create; see README.');
const verification=spawnSync(process.execPath,['verify.mjs','https://linkedin.significanthobbies.com'],{stdio:'inherit'});
if(verification.status!==0){console.error('Published, but live import verification failed. Inspect the live service before claiming release complete.');process.exit(verification.status||1)}
