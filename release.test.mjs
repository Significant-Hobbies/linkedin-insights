import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('public build has no export input path and its initial application state is empty',async()=>{
  const [app,build]=await Promise.all(['app.jsx','build.mjs'].map(f=>readFile(f,'utf8')));
  assert.match(app,/useState\(null\)/);
  for(const source of [app,build])assert.doesNotMatch(source,/archive\.private|Complete_LinkedInDataExport|\/Users\/sarthak|Downloads\/data/);
  assert.doesNotMatch(build,/readFile\([^\n]*\.csv/);
  assert.match(build,/connect-src 'none'/);
  assert.match(build,/script-src 'self'/);
  assert.match(app,/generation\.current\+\+;setArchive\(null\)/);
});
