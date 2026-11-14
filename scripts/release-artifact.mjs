import {readFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function verifyReleaseArtifact(output,sha){
  const config=JSON.parse(await readFile(path.join(output,'config.json'),'utf8'));
  assert.deepEqual(config,{accountId:'7d048325699a5acddb44d3be31cf6ba9',buildContext:{isPreview:false}});
  const worker=JSON.parse(await readFile(path.join(output,'workers/default/worker.config.json'),'utf8'));
  assert.deepEqual(worker,{name:'linkedin-insights',compatibilityDate:'2026-11-14',assets:{htmlHandling:'auto-trailing-slash',notFoundHandling:'404-page'},domains:['linkedin.significanthobbies.com'],observability:{enabled:false},workersDev:false});
  const assets=path.join(output,'workers/default/assets');
  const manifest=JSON.parse(await readFile(path.join(assets,'release-manifest.json'),'utf8'));
  assert.equal(manifest.source,sha,'CI asset source must match release HEAD.');
  const expected=new Map(manifest.files.map(f=>[f.path,f.sha256]));
  assert.equal(expected.size,manifest.files.length,'Duplicate asset paths are invalid.');
  assert.equal(manifest.files.filter(f=>/^app-[a-f0-9]{12}\.js$/.test(f.path)).length,1);
  assert.equal(manifest.files.filter(f=>/^app-[a-f0-9]{12}\.css$/.test(f.path)).length,1);
  for(const file of manifest.files){
    assert.match(file.path,/^(?:app-[a-f0-9]{12}\.(?:js|css)|fonts\/[a-z0-9-]+\.woff2|(?:privacy|guide)\/index\.html|index\.html|404\.html|favicon\.svg|social\.svg|_headers|robots\.txt|sitemap\.xml|llms\.txt|index\.md|api\/ai)$/);
    assert.match(file.sha256,/^[a-f0-9]{64}$/);
    assert.equal(createHash('sha256').update(await readFile(path.join(assets,file.path))).digest('hex'),file.sha256,`Asset changed: ${file.path}`);
  }
  const seen=[];async function walk(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;assert.ok(!(await lstat(path.join(dir,entry.name))).isSymbolicLink(),'Release artifacts may not contain symlinks.');if(entry.isDirectory())await walk(path.join(dir,entry.name),name+'/');else seen.push(name)}}
  await walk(output);
  assert.deepEqual(seen.sort(),['config.json','workers/default/worker.config.json','workers/default/assets/release-manifest.json',...[...expected.keys()].map(p=>'workers/default/assets/'+p)].sort(),'Only the verified static release is publishable.');
  return {assets,files:expected.size};
}
