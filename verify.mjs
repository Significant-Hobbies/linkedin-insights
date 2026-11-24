import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const out=path.resolve('.artifacts/browser');
const fixture=path.resolve('.artifacts/export-fixture');
await mkdir(out,{recursive:true});await mkdir(fixture,{recursive:true});
const fixtures={
  'Profile.csv':'First Name,Last Name,Headline\nAvery,Example,Sample profile',
  'Connections.csv':'First Name,Last Name,URL,Company,Position,Connected On\nAlex,Example,https://www.linkedin.com/in/example,Example Labs,Engineer,2 Jan 2024\nBlair,Example,javascript:alert(1),Northwind,Designer,3 Feb 2024\nCasey,Example,,Example Labs,Engineer,4 Mar 2023\nDrew,Example,,Example Labs,Researcher,\nEllis,Example,,,,N/A',
  'messages.csv':'CONVERSATION ID,CONVERSATION TITLE,FROM,TO,SENDER PROFILE URL,DATE,SUBJECT,CONTENT\na,,Avery Example,Alex Example,,2024-01-02 10:00:00 UTC,,Hello\na,,Alex Example,Avery Example,,2024-02-03 10:00:00 UTC,,"<img src=x onerror=alert(1)>"\nb,Sample topic,Avery Example,Casey Example,,2023-03-04 10:00:00 UTC,,"<!--<script>literal"\nd,,Avery Example,Other,,2024-01-05,,Date only\n,,Avery Example,Other,,2024-01-06 15:00:00 UTC,,Unknown thread\n   ,,Other,Avery Example,,2024-01-07 15:00:00 UTC,,Another unknown thread\nc,,   ,Avery Example,,2024-01-08 15:00:00 UTC,,Unnamed sender',
  'Job Applications.csv':'Company Name,Job Title,Job Url,Application Date\nExample Labs,Engineer,https://example.com/job,"1/2/24, 1:00 PM"\nNorthwind,Designer,,"3/4/23, 2:00 PM"\nExample Labs,Researcher,,"2/3/24, 2:00 PM"\n,Engineer,,"2/4/24, 2:00 PM"',
  'SearchQueries.csv':'Time,Search Query\n2024/01/02 10:00:00 UTC,"product manager"\n2024/02/03 10:00:00 UTC,one,two\n2024/01/03 10:00:00 UTC,"product manager"\n2024/01/04 10:00:00 UTC,"product manager" \n2024/01/05 10:00:00 UTC,   ',
  'Skills.csv':'Name\nJavaScript',
  'Ad_Targeting.csv':'Company Names,Company Names\nExample Labs,Northwind',
  'Inferences_about_you.csv':'Category,Type of inference,Description,Inference\nSample category,Sample type,Sample description,Sample label',
  'Learning.csv':'Content Title,Content Type,Content Last Watched Date (if viewed),Content Completed At (if completed)\nSample course,Course,2024-01-02 10:00 UTC,N/A\nSame title,Course,2024-01-03 10:00 UTC,2023-02-03 10:00 UTC\nSame title,Course,2023-04-05 10:00 UTC,2024-03-04 10:00 UTC\nCompletion only,Course,,2022-01-02 10:00 UTC',
  'Invitations.csv':'From,To,Direction,Sent At\nAvery Example,Alex Example,OUTGOING,2024-01-02\nAlex Example,Avery Example,INCOMING,2024-01-03\nOther,Avery Example,UNKNOWN,2024-01-04',
  'Saved Jobs.csv':'Saved Date,Job Url,Job Title,Company Name\n2024-01-02,https://example.com/job,Engineer,Example Labs\n2024-01-03,https://example.com/job,Engineer,Example Labs\n2024-01-04,javascript:alert(1),Designer,Northwind',
  'Company Follows.csv':'Organization,Followed On\nExample Labs,Fri Jun 07 10:00:00 UTC 2024\nNorthwind,2023-01-02',
  'Reactions_123.csv':'Date,Type,Link\n2024-02-28 10:00:00,LIKE,https://example.com/post\n2024-02-29 10:00:00,LIKE,https://example.com/post\n2024-03-01 10:00:00,CELEBRATE,https://example.com/post',
  'Shares_123.csv':'Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\n2024-01-02,https://example.com/post,<img src=x onerror=alert(1)>,https://NEWS.example.com/a,,PUBLIC\n2024-01-03,,,https://news.example.com/b,,PUBLIC\n2024-01-04,,,javascript:alert(1),,CONNECTIONS',
  'Endorsement_Received_Info.csv':'Endorsement Date,Skill Name,Endorser First Name,Endorser Last Name,Endorser Public Url,Endorsement Status\n2024/01/02 10:00:00 UTC,JavaScript,Alex,Example,,ACCEPTED\n2024/01/03 10:00:00 UTC,JavaScript,Blair,Example,,PENDING\n2023/01/04 10:00:00 UTC,Design,Casey,Example,,ACCEPTED',
  'Endorsement_Given_Info.csv':'Endorsement Date,Skill Name,Endorsee First Name,Endorsee Last Name,Endorsee Public Url,Endorsement Status\n2024/01/02 10:00:00 UTC,Design,Alex,Example,,PENDING',
  'Votes_123.csv':'Date,Link,OptionText\n2024-01-02,https://example.com/poll,<script>literal</script>',
  'Member_Follows_123.csv':'Date,Status,FullName\n2024-01-02,FOLLOW,Alex Example',
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
async function choose(section){if(await page.locator('#mobile-section').isVisible())await page.locator('#mobile-section').selectOption(section);else await page.locator('nav[aria-label="Archive sections"] button').filter({hasText:{overview:'Insights',network:'Network',messages:'Messages',jobs:'Applications',activity:'Activity',profile:'Profile & targeting',sources:'Data sources'}[section]}).click()}
async function verifyPublicDocument(response,status){
  assert.equal(response?.status(),status);
  assert.equal(response.headers()['cache-control'],'public, max-age=0, must-revalidate, no-transform');
  const scripts=await page.locator('script').evaluateAll(elements=>elements.map(script=>script.getAttribute('src')));
  if(new URL(response.url()).pathname==='/'){
    assert.equal(scripts.length,1);
    assert.match(scripts[0]??'',/^\/app-[a-f0-9]{12}\.js$/);
  }else{
    assert.deepEqual(scripts,[]);
  }
}
async function verifyPublicAssetCaching(){
  const assets=await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>new URL(entry.name))
    .filter(url=>url.origin===location.origin&&/^\/(?:app-[a-f0-9]{12}\.(?:js|css)|fonts\/[a-z0-9-]+\.woff2)$/.test(url.pathname))
    .map(url=>url.pathname));
  for(const type of ['.css','.js','.woff2'])assert.ok(assets.some(asset=>asset.endsWith(type)),`No loaded ${type} asset verified.`);
  await Promise.all(assets.map(async asset=>{
    const response=await page.request.head(base+asset);
    assert.equal(response.status(),200,asset);
    assert.equal(response.headers()['cache-control'],'public, max-age=31536000, immutable',asset);
  }));
}
const layouts=[];
try{
  const startResponse=await page.goto(base);
  if(live)await verifyPublicDocument(startResponse,200);
  await page.evaluate(()=>document.fonts.ready);
  if(live)await verifyPublicAssetCaching();
  assert.equal(await page.getByRole('button',{name:'Open export folder',exact:true}).count(),1);
  assert.equal(await page.locator('.stats').count(),0);
  assert.equal(await page.locator('input[webkitdirectory]').count(),1);
  assert.equal(await page.locator('.public-footer').count(),1);
  assert.equal(await page.locator('textarea[name=q]').count(),1);
  assert.doesNotMatch(await page.locator('body').innerText(),/Avery Example|Example Labs|Sample profile/);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,`start-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);layouts.push({view:'start',width,overflow:false})}
  loaded=true;await page.locator('input[webkitdirectory]').setInputFiles(fixture);
  await page.getByRole('heading',{name:'Your LinkedIn insights',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.public-footer').count(),0);assert.equal(await page.locator('textarea[name=q]').count(),0);assert.match(await page.locator('.insight-findings').innerText(),/100\.0%/);assert.match(await page.locator('.insight-findings').innerText(),/3 of 3/);
  const networkPanel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Network composition',exact:true})}),messagePanel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Messaging patterns',exact:true})}),applicationPanel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Application focus',exact:true})}),searchPanel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Search recurrence',exact:true})});
  assert.match(await networkPanel.innerText(),/4 of 4 connections/);assert.match(await networkPanel.innerText(),/2 undated/);assert.match(await messagePanel.innerText(),/25\.0%/);assert.match(await messagePanel.innerText(),/6 eligible records.*1 omitted/);assert.match(await messagePanel.innerText(),/2 records have no nonblank ID/);assert.match(await searchPanel.innerText(),/1\s+Additional occurrences/);assert.match(await searchPanel.innerText(),/4 nonblank query records/);
  assert.match(await page.locator('#signal-invitations').innerText(),/1 outgoing.*1 incoming.*1 unknown direction/s);
  assert.match(await page.locator('#signal-career').innerText(),/2 of 2 records with valid HTTP\(S\) job URLs.*1 distinct matched URLs/);
  await page.locator('#signal-social').getByText('Reaction type distribution',{exact:true}).click();assert.match(await page.locator('#signal-social').innerText(),/LIKE\s+2/);
  await page.locator('#signal-social').getByText('Domains in shared HTTP(S) URLs',{exact:true}).click();assert.match(await page.locator('#signal-social').innerText(),/2 records with eligible HTTP\(S\) shared URLs; 1 blank, invalid or ineligible shared URLs excluded/);assert.match(await page.locator('#signal-social').innerText(),/Parsed lowercase hostname\s+Records\s+news.example.com\s+2/);
  await page.locator('#signal-calendar').getByText('Active days, daily streaks and busiest months',{exact:true}).click();assert.match(await page.locator('#signal-calendar').innerText(),/3 days · 2024-02-28 to 2024-03-01/);
  await page.locator('.signal-findings button').first().focus();await page.locator('.signal-findings button').first().press('Enter');await expect(page.locator('#signal-invitations')).toBeFocused();
  assert.equal(await page.locator('.deep-insights img').count(),0);assert.equal(await page.locator('.deep-insights script').count(),0);
  await page.getByLabel('Time period').selectOption('2022');assert.match(await page.locator('#signal-learning').innerText(),/0 records with a last-watched date.*1 completion-dated records/s);await page.locator('#signal-learning').getByText('Content completed in this selection',{exact:true}).click();assert.match(await page.locator('#signal-learning').innerText(),/Completion only/);
  await page.getByLabel('Time period').selectOption('2024');assert.match(await page.locator('#signal-learning').innerText(),/2 records with a last-watched date.*1 completion-dated records/s);assert.match(await page.locator('#signal-learning').innerText(),/2024-03-04\s+2023-04-05/);
  await page.getByLabel('Time period').selectOption('2024');assert.match(await applicationPanel.innerText(),/2 of 2 selected application records/);assert.match(await networkPanel.innerText(),/2 selected of 5/);assert.match(await messagePanel.innerText(),/33\.3%/);
  await page.getByRole('button',{name:'View people at Example Labs',exact:true}).focus();await page.getByRole('button',{name:'View people at Example Labs',exact:true}).press('Enter');await page.getByRole('heading',{name:'Network intelligence',exact:true}).waitFor();await expect(page.getByRole('heading',{name:'Network intelligence',exact:true})).toBeFocused();assert.match(await page.locator('.company-filter').innerText(),/Example Labs.*All exported years/);assert.equal(await page.locator('tbody tr').count(),3);assert.equal((await page.locator('.chart-value-list strong').allTextContents()).reduce((total,value)=>total+Number(value),0),2);assert.match(await page.locator('tbody').innerText(),/Unknown date/);assert.equal(await page.getByLabel('Time period').count(),0);
  await page.getByRole('button',{name:'Remove company filter',exact:true}).focus();await page.getByRole('button',{name:'Remove company filter',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'Network intelligence',exact:true})).toBeFocused();assert.equal(await page.locator('.company-filter').count(),0);assert.equal(await page.getByLabel('Time period').inputValue(),'all');
  await choose('overview');await page.getByRole('button',{name:'View people at Northwind',exact:true}).click();await choose('overview');assert.equal(await page.locator('.company-filter').count(),0);assert.equal(await page.getByLabel('Time period').count(),1);
  await page.setViewportSize({width:390,height:1000});const mobileSection=page.locator('#mobile-section');await mobileSection.focus();await mobileSection.selectOption('messages');await expect(mobileSection).toHaveValue('messages');await expect(page.getByRole('heading',{name:'Conversation patterns',exact:true})).toBeVisible();await expect(mobileSection).toBeFocused();await mobileSection.selectOption('jobs');await expect(mobileSection).toHaveValue('jobs');await expect(page.getByRole('heading',{name:'Career activity',exact:true})).toBeVisible();await expect(mobileSection).toBeFocused();await page.setViewportSize({width:1440,height:1000});
  await choose('network');assert.match(await page.locator('.stats').innerText(),/5/);
  await page.getByRole('searchbox',{name:'Search companies'}).fill('Example');assert.match(await page.locator('tbody').innerText(),/Example Labs\s+3/);
  await page.getByLabel('Time period').selectOption('2024');assert.match(await page.locator('.stats').innerText(),/2/);
  await page.getByRole('button',{name:'People',exact:true}).click();assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
  await page.getByLabel('Time period').selectOption('all');await choose('messages');
  assert.match(await page.locator('.stats').innerText(),/7/);
  await page.locator('tbody tr').first().getByRole('button').click();assert.equal(await page.getByRole('dialog').isVisible(),true);assert.equal(await page.getByRole('dialog').locator('h2').innerText(),'Alex Example');assert.equal(await page.locator('.message-thread img').count(),0);assert.match(await page.locator('.message-thread').innerText(),/<img src=x onerror=alert\(1\)>/);await page.keyboard.press('Escape');
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});for(const view of ['overview','network','messages','jobs','activity','profile','sources']){await choose(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${view} at ${width}`);layouts.push({view,width,overflow:false});if(['overview','network','sources'].includes(view))await page.screenshot({path:path.join(out,`${view}-${width}.png`),fullPage:true})}}
  await page.setViewportSize({width:1440,height:600});await choose('sources');
  const beforeScroll=await page.locator('.sidebar').boundingBox();const headingBefore=await page.locator('.page-heading').boundingBox();
  await page.evaluate(()=>window.scrollTo({top:450,behavior:'instant'}));
  const afterScroll=await page.locator('.sidebar').boundingBox();const headingAfter=await page.locator('.page-heading').boundingBox();
  assert.ok(await page.evaluate(()=>scrollY>100),'Page content must actually scroll.');
  assert.ok(Math.abs(beforeScroll.y-afterScroll.y)<1,'Sidebar must stay pinned while page content scrolls.');
  assert.ok(headingBefore.y-headingAfter.y>100,'Content must scroll independently of the sidebar.');
  assert.ok(afterScroll.y+afterScroll.height<=601,'Sidebar must fit the viewport.');
  assert.equal((await page.locator('.app-header').boundingBox()).y,0);
  await page.screenshot({path:path.join(out,'sidebar-scrolled.png')});
  await page.setViewportSize({width:1440,height:1000});
  await choose('network');const preservedStats=await page.locator('.stats').innerText();await choose('sources');const preservedSources=await page.locator('.stats').innerText();
  await page.locator('input[accept]').setInputFiles({name:'Skills.csv',mimeType:'text/csv',buffer:Buffer.from('Name\n"unterminated')});await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Unclosed/);assert.equal(await page.locator('.public-footer').count(),0);assert.equal(await page.locator('.stats').innerText(),preservedSources);await choose('network');assert.equal(await page.locator('.stats').innerText(),preservedStats);
  assert.equal(await page.evaluate(()=>localStorage.length),0);
  assert.equal(await page.evaluate(async()=>('databases'in indexedDB?(await indexedDB.databases()).length:0)),0);
  assert.deepEqual(requestsAfterImport,[]);
  const mixedOptional={
    'Connections.csv':'First Name,Last Name,URL,Company,Position,Connected On\nValid,Person,,Usable Company,Role,2024-01-02',
    'Shares.csv':'Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility\n2024-01-02,,unquoted,comma,https://example.com,,PUBLIC',
    'Saved Jobs.csv':'Saved Date,Job Url,Job Title,Employer\n2024-01-02,https://example.com,Role,Example',
    'Reactions_111.csv':'Date,Type,Link\n2024-01-02,LIKE,',
    'Reactions_222.csv':'Date,Type,Link\n2024-01-03,LIKE,'
  };
  await page.locator('input[accept]').setInputFiles(Object.entries(mixedOptional).map(([name,text])=>({name,mimeType:'text/csv',buffer:Buffer.from(text)})));await page.getByRole('status').filter({hasText:'Loaded 5 CSV files'}).waitFor();
  assert.match(await page.locator('.signal-unavailable').innerText(),/Sources needing attention.*Shares.csv.*not analyzed.*Saved Jobs.csv.*not analyzed.*Reactions_111.csv.*Multiple files.*Reactions_222.csv/s);assert.equal(await page.locator('#signal-social').count(),0);assert.equal(await page.locator('#signal-career').count(),0);assert.match(await networkPanel.innerText(),/1 selected of 1/);assert.equal(await page.getByRole('alert').count(),0);
  for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`optional-skipped-${width}.png`),fullPage:true});layouts.push({view:'optional-skipped',width,overflow:false})}
  await page.setViewportSize({width:1440,height:1000});await choose('sources');assert.match(await page.locator('tbody').innerText(),/Shares.csv.*Inventory only/s);await choose('overview');
  await page.locator('input[accept]').setInputFiles({name:'Shares.csv',mimeType:'text/csv',buffer:Buffer.from('Wrong,Header\na,b')});await page.getByRole('status').filter({hasText:'Loaded 1 CSV files'}).waitFor();assert.match(await page.locator('.signal-unavailable').innerText(),/Shares.csv.*not analyzed/s);assert.equal(await page.locator('.signal-findings').count(),0);assert.equal(await page.locator('#signal-calendar').count(),0);assert.equal(await page.locator('.stats section').first().getByText('—',{exact:true}).count(),1);
  assert.deepEqual(requestsAfterImport,[]);
  await page.locator('input[accept]').setInputFiles({name:'Skills.csv',mimeType:'text/csv',buffer:Buffer.from('Name\nSynthetic skill')});await page.getByRole('status').filter({hasText:'Loaded 1 CSV files'}).waitFor();assert.equal(await page.locator('.insight-state').count(),4);assert.match(await page.locator('.insight-state').first().innerText(),/Source not included/);assert.match(await page.locator('.insight-overlap').innerText(),/Unavailable/);
  await page.locator('input[accept]').setInputFiles(Object.entries(fixtures).filter(([name])=>['Connections.csv','messages.csv','Job Applications.csv','SearchQueries.csv'].includes(name)).map(([name,text])=>({name,mimeType:'text/csv',buffer:Buffer.from(text.split('\n')[0])})));await page.getByRole('status').filter({hasText:'Loaded 4 CSV files'}).waitFor();assert.equal(await page.locator('.insight-state').count(),4);for(const state of await page.locator('.insight-state').allInnerTexts())assert.match(state,/included with zero records/);assert.doesNotMatch(await page.locator('.insight-findings').innerText(),/NaN|Infinity/);assert.equal(await page.locator('.company-filter').count(),0);
  await page.locator('input[accept]').setInputFiles({name:'Connections.csv',mimeType:'text/csv',buffer:Buffer.from('First Name,Last Name,URL,Company,Position,Connected On\nSample,Person,,Synthetic Co,Role,')});await page.getByRole('status').filter({hasText:'Loaded 1 CSV files'}).waitFor();await page.getByRole('heading',{name:'No dated records in this selection',exact:true}).waitFor();assert.match(await page.locator('.insight-coverage').innerText(),/1 selected of 1.*1 undated/);await page.locator('.stats section').first().getByText('1',{exact:true}).waitFor();assert.match(await page.locator('.stats section').first().innerText(),/1/);
  assert.deepEqual(requestsAfterImport,[]);
  assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(async()=>('databases'in indexedDB?(await indexedDB.databases()).length:0)),0);
  await page.locator('input[accept]').setInputFiles({name:'Reactions_456.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Type,Link\n2021-02-01,LIKE,\n2021-02-03,LIKE,')});await page.getByRole('status').filter({hasText:'Loaded 1 CSV files'}).waitFor();assert.match(await page.locator('.signal-findings').innerText(),/LIKE.*2 of 2/s);await page.getByLabel('Time period').selectOption('2021');await page.locator('#signal-calendar').getByText('Compare monthly source records',{exact:true}).click();assert.match(await page.locator('#signal-calendar').innerText(),/Reactions.csv/);assert.equal(await page.locator('#signal-career').count(),0);
  loaded=false;await page.getByRole('button',{name:'Clear archive',exact:true}).click();assert.equal(await page.locator('.stats').count(),0);assert.equal(await page.locator('.public-footer').count(),1);
  const reloadResponse=await page.reload();if(live)await verifyPublicDocument(reloadResponse,200);assert.equal(await page.locator('.stats').count(),0);assert.equal(await page.getByRole('button',{name:'Open export folder',exact:true}).count(),1);
  for(const route of ['/privacy/','/guide/']){const response=await page.goto(base+route);assert.equal(response.status(),200);if(live)await verifyPublicDocument(response,200);assert.ok(await page.locator('h1').innerText())}
  if(live){
    for(const route of ['/__archive-qa-missing-document__','/app-000000000000.js','/fonts/synthetic-missing.woff2']){
      await verifyPublicDocument(await page.goto(base+route),404);
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'verification.json'),JSON.stringify({base,layouts,sidebarPinned:true,insightsLanding:true,keyboardEvidenceNavigation:true,mobileSectionFocus:true,computedInsights:true,yearFiltering:true,exactCompanyDrilldown:true,missingAndEmptySources:true,deeperSourceInsights:true,completionDateCohorts:true,numericSuffixSources:true,calendarEvidence:true,optionalSourceIsolation:true,sharedDomainEligibility:true,folderImport:true,failedImportPreservesData:true,clearAndReloadStartEmpty:true,storedRecords:0,requestsAfterImport,errors},null,2));
  console.log(JSON.stringify({base,layouts:layouts.length,sidebarPinned:true,insightsLanding:true,keyboardEvidenceNavigation:true,mobileSectionFocus:true,computedInsights:true,yearFiltering:true,exactCompanyDrilldown:true,missingAndEmptySources:true,deeperSourceInsights:true,completionDateCohorts:true,numericSuffixSources:true,calendarEvidence:true,optionalSourceIsolation:true,sharedDomainEligibility:true,folderImport:true,requestsAfterImport:0,storedRecords:0,errors:0}));
}finally{await browser.close();server?.kill('SIGTERM')}
