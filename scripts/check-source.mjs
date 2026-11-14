import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const files=await readdir('.');
for(const file of files.filter(f=>f.endsWith('.mjs')))execFileSync(process.execPath,['--check',file]);
const app=await readFile('app.jsx','utf8');
assert.match(app,/useState\(null\)/,'Public application must start empty.');
for(const file of ['app.jsx','PublicStart.jsx','core.mjs']){
  const source=await readFile(file,'utf8');
  assert.doesNotMatch(source,/archive\.private|from\s+['"][^'"]*\.csv|Complete_LinkedInDataExport|\/Users\//,`${file}: no private seed or machine-local data path.`);
  assert.doesNotMatch(source,/localStorage|indexedDB|sendBeacon|XMLHttpRequest|\bfetch\s*\(/,`${file}: browser code may not persist or transmit imports.`);
}
console.log('Source syntax and public privacy boundary checks passed.');
