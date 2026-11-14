import {execFileSync,spawnSync} from 'node:child_process';
const repository='Significant-Hobbies/linkedin-insights';
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8'}).trim();
const sha=run('git',['rev-parse','HEAD']);
if(run('git',['branch','--show-current'])!=='main'||run('git',['status','--porcelain']))throw new Error('Release requires clean main.');
if(run('git',['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==sha)throw new Error('Release source must match origin/main.');
const runs=JSON.parse(run('gh',['api',`repos/${repository}/actions/runs?head_sha=${sha}&branch=main&event=push&per_page=100`]));
const ci=runs.workflow_runs?.find(r=>r.path==='.github/workflows/ci.yml');
if(!ci||ci.head_sha!==sha||ci.status!=='completed'||ci.conclusion!=='success')throw new Error('Exact-main CI must pass before release.');
for(const args of [['check'],['test:browser'],['exec','wrangler','pages','deploy','dist','--project-name','linkedin-insights','--branch','main','--commit-hash',sha]]){
  const result=spawnSync('pnpm',args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
