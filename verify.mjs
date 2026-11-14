import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const out=path.resolve('.artifacts/browser');
const fixture=path.resolve('.artifacts/export-fixture');
await mkdir(out,{recursive:true});await mkdir(fixture,{recursive:true});
const fixtures={
  'Profile.csv':'First Name,Last Name,Headline\nAvery,Example,Sample profile',
  'Connections.csv':'First Name,Last Name,URL,Company,Position,Connected On\nAlex,Example,https://www.linkedin.com/in/example,Example Labs,Engineer,2 Jan 2024\nBlair,Example,javascript:alert(1),Northwind,Designer,3 Feb 2024\nCasey,Example,,Example Labs,Engineer,4 Mar 2023',
  'messages.csv':'CONVERSATION ID,CONVERSATION TITLE,FROM,TO,SENDER PROFILE URL,DATE,SUBJECT,CONTENT\na,,Avery Example,Alex Example,,2024-01-02 10:00:00 UTC,,Hello\na,,Alex Example,Avery Example,,2024-01-03 10:00:00 UTC,,"<img src=x onerror=alert(1)>"\nb,Sample topic,Avery Example,Casey Example,,2023-03-04 10:00:00 UTC,,"<!--<script>literal"',
  'Job Applications.csv':'Company Name,Job Title,Job Url,Application Date\nExample Labs,Engineer,https://example.com/job,"1/2/24, 1:00 PM"\nNorthwind,Designer,,"3/4/23, 2:00 PM"',
  'SearchQueries.csv':'Time,Search Query\n2024/01/02 10:00:00 UTC,"product manager"\n2024/02/03 10:00:00 UTC,one,two',
  'Skills.csv':'Name\nJavaScript',
  'Ad_Targeting.csv':'Company Names,Company Names\nExample Labs,Northwind',
  'Inferences_about_you.csv':'Category,Type of inference,Description,Inference\nSample category,Sample type,Sample description,Sample label',
  'Learning.csv':'Content Title,Content Type,Content Last Watched Date (if viewed),Content Completed At (if completed)\nSample course,Course,2024-01-02 10:00 UTC,N/A',
  'Comments.csv':'Date,Link,Text\n2024-01-02,x,raw,comma'
};
await Promise.all(Object.entries(fixtures).map(([name,text])=>writeFile(path.join(fixture,name),text)));
const live=process.argv[2];
const server=live?null:spawn(process.execPath,['scripts/serve.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'8794'}});
if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Preview server exited ${code}`)))});
const base=live||'http://127.0.0.1:8794';
const browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:'chrome'})});
const context=await browser.newContext();const page=await context.newPage();
const errors=[],requestsAfterImport=[];let loaded=false;
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(loaded)requestsAfterImport.push(r.url())});
async function choose(section){if(await page.locator('#mobile-section').isVisible())await page.locator('#mobile-section').selectOption(section);else await page.locator('nav[aria-label="Archive sections"] button').filter({hasText:{overview:'Overview',network:'Network',messages:'Messages',jobs:'Applications',activity:'Activity',profile:'Profile & targeting',sources:'Data sources'}[section]}).click()}
const layouts=[];
try{
  await page.goto(base);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.getByRole('button',{name:'Open export folder',exact:true}).count(),1);
  assert.equal(await page.locator('.stats').count(),0);
  assert.equal(await page.locator('input[webkitdirectory]').count(),1);
  assert.equal(await page.locator('.public-footer').count(),1);
  assert.equal(await page.locator('textarea[name=q]').count(),1);
  assert.doesNotMatch(await page.locator('body').innerText(),/Sarthak|6,332|3,073|Complete_LinkedInDataExport/);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,`start-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);layouts.push({view:'start',width,overflow:false})}
  await page.locator('input[webkitdirectory]').setInputFiles(fixture);
  await page.getByRole('heading',{name:'Your archive, in perspective',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);loaded=true;
  assert.equal(await page.locator('.public-footer').count(),0);assert.equal(await page.locator('textarea[name=q]').count(),0);
  await choose('network');assert.match(await page.locator('.stats').innerText(),/3/);
  await page.getByRole('searchbox',{name:'Search companies'}).fill('Example');assert.match(await page.locator('tbody').innerText(),/Example Labs\s+2/);
  await page.getByLabel('Time period').selectOption('2024');assert.match(await page.locator('.stats').innerText(),/2/);
  await page.getByRole('button',{name:'People',exact:true}).click();assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  await page.getByLabel('Time period').selectOption('all');await choose('messages');
  assert.match(await page.locator('.stats').innerText(),/3/);
  await page.locator('tbody tr').first().getByRole('button').click();assert.equal(await page.getByRole('dialog').isVisible(),true);assert.equal(await page.locator('.message-thread img').count(),0);assert.match(await page.locator('.message-thread').innerText(),/<img src=x onerror=alert\(1\)>/);await page.keyboard.press('Escape');
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});for(const view of ['network','messages','jobs','activity','profile','sources']){await choose(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view} at ${width}`);layouts.push({view,width,overflow:false});if(['network','sources'].includes(view))await page.screenshot({path:path.join(out,`${view}-${width}.png`),fullPage:true})}}
  await page.locator('input[accept]').setInputFiles({name:'Skills.csv',mimeType:'text/csv',buffer:Buffer.from('Name\n"unterminated')});await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Unclosed/);assert.equal(await page.locator('.public-footer').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.evaluate(async()=>('databases'in indexedDB?(await indexedDB.databases()).length:0)),0);
  assert.deepEqual(requestsAfterImport,[]);
  loaded=false;await page.getByRole('button',{name:'Clear archive',exact:true}).click();assert.equal(await page.locator('.stats').count(),0);assert.equal(await page.locator('.public-footer').count(),1);
  await page.reload();assert.equal(await page.locator('.stats').count(),0);assert.equal(await page.getByRole('button',{name:'Open export folder',exact:true}).count(),1);
  for(const route of ['/privacy/','/guide/']){const response=await page.goto(base+route);assert.equal(response.status(),200);assert.ok(await page.locator('h1').innerText())}
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'verification.json'),JSON.stringify({base,layouts,folderImport:true,failedImportPreservesData:true,clearAndReloadStartEmpty:true,storedRecords:0,requestsAfterImport,errors},null,2));
  console.log(JSON.stringify({base,layouts:layouts.length,folderImport:true,requestsAfterImport:0,storedRecords:0,errors:0}));
}finally{await browser.close();server?.kill('SIGTERM')}
