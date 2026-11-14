import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArchive,parseDate,archiveYears,sourceFile} from './core.mjs';
import {buildInsights} from './insights.mjs';
import {buildDeepInsights,sourceDomain,sourceCalendar,activityPattern} from './signals.mjs';
const file=(name,text)=>({name,text});
const reactionHeader='Date,Type,Link';
const shareHeader='Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility';
const savedHeader='Saved Date,Job Url,Job Title,Company Name';
const appHeader='Company Name,Job Title,Job Url,Application Date';
const connectionHeader='First Name,Last Name,Company,Position,URL,Connected On';
const learningHeader='Content Title,Content Type,Content Last Watched Date (if viewed),Content Completed At (if completed)';
test('numeric source aliases import under one identity and exclude every ambiguous duplicate',()=>{
  const a=buildArchive([file('nested/Reactions_123.csv',reactionHeader+'\n2024-02-29 10:00:00,LIKE,https://example.com/post')]);
  assert.equal(a.reactions[0].date,'2024-02-29');assert.equal(sourceFile(a,'reactions').name,'nested/Reactions_123.csv');
  for(const other of ['Reactions.csv','Reactions_456.csv']) {
    const archive=buildArchive([file('Connections.csv',connectionHeader+'\nA,B,Example,Role,,2024-01-02'),file('Reactions_123.csv',reactionHeader+'\n2024-01-02,LIKE,'),file(other,reactionHeader+'\n2024-01-03,LIKE,')]);
    assert.equal(archive.connections.length,1);assert.deepEqual(archive.reactions,[]);
    const excluded=archive.files.filter(source=>source.name!=='Connections.csv');
    assert.equal(excluded.length,2);for(const source of excluded){assert.equal(source.status,'unsupported');assert.match(source.issues.join(' '),/Multiple files.*not analyzed/)}
    const deep=buildDeepInsights(archive);assert.equal(deep.reactions.state,'unavailable');assert.equal(deep.unavailableSources.length,2);assert.equal(deep.calendar.rows.some(row=>row.key==='reactions'),false);
  }
  assert.throws(()=>buildArchive([file('Reactions_nope.csv',reactionHeader)]),/No supported/);
});
test('malformed optional sources leave usable core records intact and exclude the whole bad file',()=>{
  const connection=file('Connections.csv',connectionHeader+'\nA,B,Example,Role,,2024-01-02');
  for(const bad of [file('Shares.csv',shareHeader+'\n2024-01-01,,valid,https://example.com,,PUBLIC\n2024-01-02,,unquoted,comma,https://example.com,,PUBLIC'),file('Shares.csv',shareHeader+'\n2024-01-02,,"unfinished'),file('Saved Jobs.csv','Saved Date,Job Url,Job Title,Employer\n2024-01-02,https://example.com,Role,Example'),file('Reactions.csv','Date,Type,Type\n2024-01-02,LIKE,LIKE')]) {
    const archive=buildArchive([connection,bad]);assert.equal(archive.connections.length,1);
    const source=archive.files.find(source=>source.name===bad.name);assert.equal(source.status,'unsupported');assert.match(source.issues.join(' '),/not analyzed/);
    const deep=buildDeepInsights(archive);assert.equal(deep.unavailableSources.length,1);assert.equal(deep.findings.some(finding=>finding.source===bad.name),false);assert.equal(deep.calendar.rows.some(row=>row.source===bad.name),false);
    for(const key of ['shares','savedJobs','reactions'])assert.equal(archive[key].length,0);
  }
  assert.throws(()=>buildArchive([connection,file('Skills.csv','Name\n"unfinished')]),/Unclosed/);
  assert.throws(()=>buildArchive([connection,connection]),/Duplicate supported source/);
});
test('an all-unavailable optional import retains diagnostics without presenting an empty source',()=>{
  const archive=buildArchive([file('Shares.csv','Wrong,Header\na,b')]),deep=buildDeepInsights(archive);
  assert.equal(deep.shares.state,'unavailable');assert.equal(deep.shares.source,null);assert.equal(deep.shares.unavailableSource.name,'Shares.csv');assert.deepEqual(deep.findings,[]);assert.deepEqual(deep.calendar.rows,[]);assert.equal(deep.unavailableSources.length,1);
  assert.doesNotMatch(archive.files[0].issues.join(' '),/other usable sources remain available/i);
});
test('all new source rows preserve evidence and date axes',()=>{
  const files=[file('Saved Jobs.csv',savedHeader+'\n2024-01-02,https://example.com/job,Engineer,Example'),file('Company Follows.csv','Organization,Followed On\nExample,Fri Jun 07 10:00:00 UTC 2024'),file('Shares_123.csv',shareHeader+'\n2024-01-02 10:00:00,https://example.com/post,Literal commentary,https://news.example.com/x,,PUBLIC'),file('Votes_123.csv','Date,Link,OptionText\n2024-01-02 10:00:00,https://example.com/poll,Option A'),file('Member_Follows_123.csv','Date,Status,FullName\n2024-01-02 10:00:00,FOLLOW,Sample Person'),file('Endorsement_Received_Info.csv','Endorsement Date,Skill Name,Endorser First Name,Endorser Last Name,Endorser Public Url,Endorsement Status\n2024/01/02 10:00:00 UTC,JavaScript,Sample,Person,https://example.com/person,ACCEPTED'),file('Endorsement_Given_Info.csv','Endorsement Date,Skill Name,Endorsee First Name,Endorsee Last Name,Endorsee Public Url,Endorsement Status\n2024/01/02 10:00:00 UTC,Design,Sample,Person,https://example.com/person,PENDING')];
  const a=buildArchive(files);for(const key of ['savedJobs','companyFollows','shares','votes','memberFollows','endorsementsReceived','endorsementsGiven'])assert.equal(a[key].length,1,key);
  assert.equal(a.companyFollows[0].date,'2024-06-07');assert.equal(a.endorsementsGiven[0].status,'PENDING');assert.deepEqual(archiveYears(a),['2024']);
});
test('long exported follow dates validate clocks, leap days and the recorded weekday',()=>{
  assert.equal(parseDate('Fri Jun 07 10:00:00 UTC 2024'),'2024-06-07');
  for(const value of ['Fri Jun 07 24:00:00 UTC 2024','Fri Jun 07 10:60:00 UTC 2024','Mon Jun 07 10:00:00 UTC 2024','Fri Feb 30 10:00:00 UTC 2024','Fri Abc 07 10:00:00 UTC 2024'])assert.equal(parseDate(value),null,value);
  assert.equal(parseDate('Thu Feb 29 23:59:59 UTC 2024'),'2024-02-29');
});
test('new-only and completion-only exports supply period choices',()=>{
  const a=buildArchive([file('Learning.csv',learningHeader+'\nCourse,Course,,2022-01-02 10:00 UTC'),file('Reactions_123.csv',reactionHeader+'\n2024-01-02,LIKE,')]);
  assert.deepEqual(archiveYears(a),['2024','2022']);const d=buildInsights(a,'2022').deep;
  assert.equal(d.learning.count,0);assert.equal(d.learning.completions.count,1);assert.equal(d.learning.completions.rows[0].originalDate,null);assert.equal(d.learning.completions.state,'ready');
});
test('completion dates never inherit the selected last-watched year or match duplicate titles by title',()=>{
  const a=buildArchive([file('Learning.csv',learningHeader+'\nSame title,Course,2024-01-02 10:00 UTC,2023-02-03 10:00 UTC\nSame title,Course,2022-04-05 10:00 UTC,2024-03-04 10:00 UTC\nNot completed,Course,2024-01-04 10:00 UTC,N/A')]);
  const d=buildDeepInsights(a,'2024').learning;
  assert.equal(d.count,2);assert.equal(d.completedAmongViewed,1);assert.equal(d.completions.count,1);assert.equal(d.completions.rows[0].originalDate,'2022-04-05');assert.equal(d.completions.rows[0].date,'2024-03-04');
  assert.equal(buildDeepInsights(a,'2025').learning.completions.state,'selection-empty');
  assert.equal(buildDeepInsights(buildArchive([file('Learning.csv',learningHeader+'\nNot completed,Course,,N/A')])).learning.completions.state,'empty');
});
test('source windows distinguish missing, zero records, undated and selected empty',()=>{
  const a=buildArchive([file('Reactions.csv',reactionHeader+'\n2024-01-02,LIKE,\n2024-03-02,LIKE,\n,LIKE,'),file('Saved Jobs.csv',savedHeader)]);
  const d=buildDeepInsights(a,'2024');assert.equal(d.domains.shares.state,'absent');assert.equal(d.saved.state,'empty');assert.equal(buildDeepInsights(a,'2023').reactions.state,'selection-empty');
  assert.equal(d.reactions.full.undated,1);const calendar=d.calendar,row=calendar.rows.find(row=>row.key==='reactions');
  assert.deepEqual(calendar.periods,['2024-01','2024-02','2024-03','2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11','2024-12']);assert.deepEqual(row.cells.slice(0,4),[1,0,1,null]);assert.equal(calendar.rows.find(row=>row.key==='savedJobs').cells.every(value=>value===null),true);
});
test('all-year calendar bounds extreme valid spans without losing full source coverage',()=>{
 const a=buildArchive([file('Reactions.csv',reactionHeader+'\n0001-01-01,LIKE,\n9999-12-31,LIKE,')]);const c=buildDeepInsights(a).calendar;assert.equal(c.periods.length,36);assert.equal(c.periods[0],'9997-01');assert.equal(c.omittedMonths,9999*12-36);assert.equal(c.rows[0].first,'0001-01-01');assert.equal(c.rows[0].cells.at(-1),1);
});
test('daily streaks deduplicate dates and cross leap-day/month/year boundaries',()=>{
  const p=activityPattern(['2024-02-28','2024-02-28','2024-02-29','2024-03-01','2024-03-03',null].map(date=>({date})));
  assert.equal(p.activeDays,4);assert.equal(p.datedRecords,5);assert.deepEqual(p.longestStreak,{days:3,first:'2024-02-28',last:'2024-03-01'});assert.deepEqual(p.peaks,[{name:'2024-02',count:3}]);
  const tie=activityPattern(['2023-12-31','2024-01-01','2024-02-01','2024-02-02'].map(date=>({date})));assert.equal(tie.longestStreak.first,'2023-12-31');
});
test('invitation direction has explicit unknown labels rather than guessed attribution',()=>{
 const a=buildArchive([file('Invitations.csv','From,To,Direction,Sent At\nA,B,OUTGOING,2024-01-02\nB,A, incoming ,2024-01-03\nA,B,SENT,2024-01-04\nA,B,,2023-01-02')]);assert.deepEqual(buildDeepInsights(a,'2024').invitations.mix,{incoming:1,outgoing:1,unknown:1});assert.equal(buildDeepInsights(a).invitations.mix.unknown,2);
});
test('saved job matching uses exact valid URLs and full applications without implying order',()=>{
 const a=buildArchive([file('Saved Jobs.csv',savedHeader+'\n2024-01-02, https://example.com/job ,Role,Example\n2024-01-03,https://example.com/job?track=x,Role,Example\n2024-01-04,javascript:alert(1),Role,Example\n2024-01-05,,Role,Example\n2024-01-06,https://user:pass@example.com/job,Role,Example\n2024-01-07,https://example.com/job,Role,Example'),file('Job Applications.csv',appHeader+'\nExample,Role,https://example.com/job,2023-01-02')]);
 const match=buildDeepInsights(a,'2024').saved.matches;assert.equal(match.available,true);assert.equal(match.valid,3);assert.equal(match.omitted,3);assert.equal(match.records,2);assert.equal(match.uniqueURLs,1);assert.equal(match.applicationRecords,1);
 const absent=buildDeepInsights({...a,files:a.files.filter(f=>f.name!=='Job Applications.csv')}).saved.matches;assert.equal(absent.available,false);
});
test('company follows compare selected application labels with whole network and preserve missing source state',()=>{
 const a=buildArchive([file('Company Follows.csv','Organization,Followed On\n Example ,2024-01-02\nexample,2024-01-03'),file('Connections.csv',connectionHeader+'\nA,B,Example,Role,,2023-01-02'),file('Job Applications.csv',appHeader+'\nExample,Role,,2024-01-02\nExample,Role,,2023-01-02')]);
 assert.deepEqual(buildDeepInsights(a,'2024').follows.matches,[{name:'Example',follows:1,connections:1,applications:1},{name:'example',follows:1,connections:0,applications:0}]);
 const b=buildArchive([file('Company Follows.csv','Organization,Followed On\nExample,2024-01-02')]);assert.equal(buildDeepInsights(b).follows.matches[0].connections,null);assert.equal(buildDeepInsights(b).follows.matches[0].applications,null);
});
test('social distributions count record labels and valid shared domains without loading links',()=>{
 const a=buildArchive([file('Shares.csv',shareHeader+'\n2024-01-02,,Text,https://NEWS.example.com/path,,PUBLIC\n2024-01-03,,,https://news.example.com/another,,PUBLIC\n2024-01-04,,Text,javascript:alert(1),,\n2024-01-05,,,,,CONNECTIONS')]);const p=buildDeepInsights(a).shares;
 assert.equal(p.commentaryRecords,2);assert.deepEqual(p.sharedDomains.values,[{name:'news.example.com',count:2}]);assert.equal(p.sharedDomains.missing,2);assert.equal(p.visibility.missing,1);assert.equal(p.visibility.labelled,3);
});
test('endorsement comparison is exact, selected by year, deduplicates declared labels and retains statuses',()=>{
 const h='Endorsement Date,Skill Name,Endorser First Name,Endorser Last Name,Endorser Public Url,Endorsement Status';const a=buildArchive([file('Skills.csv','Name\nJavaScript\n JavaScript \ndesign'),file('Endorsement_Received_Info.csv',h+'\n2024-01-02,JavaScript,A,B,,ACCEPTED\n2024-01-03,Design,C,D,,PENDING\n2023-01-02,design,E,F,,REMOVED')]);const d=buildDeepInsights(a,'2024');assert.equal(d.skillOverlap.declared,2);assert.deepEqual(d.skillOverlap.matches,[{name:'JavaScript',count:1}]);assert.deepEqual(d.skillOverlap.unmatchedDeclared,['design']);assert.deepEqual(d.skillOverlap.undeclaredEndorsed,[{name:'Design',count:1}]);assert.equal(d.received.statuses.values.some(row=>row.name==='PENDING'),true);
});
test('known conversation recurrences and median exclude records with missing IDs',()=>{
 const a=buildArchive([file('messages.csv','CONVERSATION ID,CONVERSATION TITLE,FROM,TO,SENDER PROFILE URL,DATE,SUBJECT,CONTENT\na,Topic,A,B,,2024-01-02,,x\na,Topic,A,B,,2024-02-02,,x\na,Topic,A,B,,,,x\nb,Other,C,D,,2024-01-03,,x\n,,A,B,,2024-01-04,,x\n   ,,A,B,,2024-02-04,,x')]);const m=buildDeepInsights(a,'2024').messaging;
 assert.equal(m.groups.length,2);assert.equal(m.knownRecords,3);assert.equal(m.recurrent,1);assert.equal(m.medianRecords,1.5);assert.equal(m.groups[0].activeMonths,2);assert.equal(buildDeepInsights(a).messaging.groups[0].undated,1);
});
test('extra insight calculations do not mutate normalized records or manufacture absent-source findings',()=>{
 const a=buildArchive([file('Reactions.csv',reactionHeader+'\n2024-01-02,LIKE,')]),before=structuredClone(a);buildDeepInsights(a);assert.deepEqual(a,before);const absent={...a,files:[]};assert.deepEqual(buildDeepInsights(absent).findings,[]);assert.equal(sourceCalendar({reactions:sourceDomain(absent,'reactions')}).rows.length,0);
});
