import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseDate, buildArchive, groupCounts, filterYear, periodSeries, coverage, conversationGroups } from './core.mjs';
import {escapeInlineScript} from './html.mjs';
import vm from 'node:vm';

const csv = rows => rows.map(row => row.map(cell => /[",\r\n]/.test(String(cell)) ? `"${String(cell).replaceAll('"', '""')}"` : String(cell)).join(',')).join('\r\n');
const source = (name, rows) => ({ name, text: csv(rows) });
const connectionHeader = ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'];
const connections = rows => source('Connections.csv', [connectionHeader, ...rows]);
const messageHeader = ['CONVERSATION ID', 'CONVERSATION TITLE', 'FROM', 'TO', 'SENDER PROFILE URL', 'DATE', 'SUBJECT', 'CONTENT'];

test('CSV preserves escaped quotes, multiline CRLF, BOM, Unicode and trailing empty cells', () => {
  assert.deepEqual(parseCSV('\uFEFFa,b,c\r\n"x,y","he said ""hello""","two\r\nlines"\r\nπ,,\r\n\r\n'), [['a', 'b', 'c'], ['x,y', 'he said "hello"', 'two\r\nlines'], ['π', '', ''], ['']]);
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('a,b\n"",'), [['a', 'b'], ['', '']]);
  assert.deepEqual(parseCSV('a\rb\r'), [['a'], ['b']]);
});

test('malformed quoting fails without silently rewriting fields', () => {
  for (const text of ['a\n"unfinished', 'a\nnot"quoted', 'a\n"quoted"tail', 'a\n"quoted""']) assert.throws(() => parseCSV(text), /quote|closing/i);
});

test('dates validate calendar and clock values without rollover or timezone conversion', () => {
  for (const [input, expected] of [
    ['2 Jan 2026', '2026-01-02'], ['29 Feb 2024', '2024-02-29'], ['2000-02-29', '2000-02-29'],
    ['2026-09-17 00:01 UTC', '2026-09-17'], ['2026-09-17 23:59:59', '2026-09-17'],
    ['2026/09/17 23:59:59 UTC', '2026-09-17'], ['9/7/26, 12:00 AM', '2026-09-07'],
    ['9/7/26, 12:00 PM', '2026-09-07'], ['1/1/68', '2068-01-01'], ['1/1/69', '1969-01-01'],
  ]) assert.equal(parseDate(input), expected, input);
  for (const input of ['', 'N/A', '29 Feb 2025', '1900-02-29', '2026-02-30', '2026-13-01', '2026-00-12', '0000-01-01', '2026-01-00', '2026-01-01 24:00 UTC', '2026-01-01 12:60 UTC', '2026-01-01 12:00:60 UTC', '1/1/26, 0:00 AM', '1/1/26, 13:00 PM', '2026-01-01T00:00:00Z', '9/7/2026', 'tomorrow']) assert.equal(parseDate(input), null, input);
});

test('Connections preamble is handled only for Connections and optional absent sources stay absent', () => {
  const file = connections([['A', 'Person', 'https://example.test/a', 'private@example.test', 'Example', 'Engineer', '2 Jan 2026']]);
  file.name = 'Export/CONNECTIONS.CSV';
  file.text = 'Notes:\r\n"A multiline\r\npreamble, with a comma"\r\n\r\n' + file.text;
  const archive = buildArchive([file], 'Test export');
  assert.deepEqual(archive.connections, [{ name: 'A Person', company: 'Example', position: 'Engineer', url: 'https://example.test/a', date: '2026-01-02' }]);
  assert.equal(archive.files.length, 1);
  assert.equal(archive.files[0].count, 1);
  assert.equal(archive.messages.length, 0);
  assert.equal(JSON.stringify(archive).includes('private@example.test'), false);
});

test('known source schema errors and duplicate filenames fail transactionally', () => {
  assert.throws(() => buildArchive([source('Skills.csv', [['Wrong'], ['x']])]), /Missing required headers: Name/);
  assert.throws(() => buildArchive([source('Skills.csv', [['Name', 'Name'], ['a', 'b']])]), /Repeated column headers/);
  assert.throws(() => buildArchive([source('Skills.csv', [['Name']]), source('nested/SKILLS.CSV', [['Name']])]), /Duplicate supported source/);
  assert.throws(() => buildArchive([{ name: 'Skills.csv', text: 'Name\n"oops' }]), /Skills.csv: Unclosed/);
  const files = [connections([['A', 'B', '', '', '', '', '31 Feb 2026']])];
  const before = JSON.stringify(files);
  assert.equal(buildArchive(files).connections[0].date, null);
  assert.equal(JSON.stringify(files), before);
});

test('empty supported files are accepted, unknown files are metadata only, unsupported collection rejected', () => {
  const archive = buildArchive([source('Skills.csv', [['Name']]), source('unknown.csv', [['No conversations found']])]);
  assert.equal(archive.files[0].count, 0);
  assert.equal(archive.files[0].status, 'ready');
  assert.equal(archive.files[1].count, 0);
  assert.equal(archive.files[1].status, 'unsupported');
  assert.throws(() => buildArchive([source('unknown.csv', [['A'], ['B']])]), /No supported/);
  assert.throws(() => buildArchive([]), /No supported/);
  assert.throws(() => buildArchive([{ name: 'Skills.csv', text: '' }]), /Missing required/);
});

test('LinkedIn search text is preserved literally after unquoted raw-format timestamps', () => {
  const archive = buildArchive([{ name: 'SearchQueries.csv', text: 'Time,Search Query\n2026/09/17 13:00:00 UTC,one,two,three\n2026/09/17 13:00:00 UTC,"quoted,query"' }]);
  assert.equal(archive.searches[0].query, 'one,two,three');
  assert.equal(archive.searches[1].query, '"quoted,query"');
  assert.deepEqual(archive.files[0].extras, [{ row: 2, literalCommas: 2 }, {row:3,literalCommas:1}]);
  assert.match(archive.files[0].issues.join(' '), /2 search queries contain literal commas/);
  assert.throws(() => buildArchive([{ name: 'SearchQueries.csv', text: 'Time,Search Query\nbad-date,one,two' }]), /cells; expected/);
  assert.equal(buildArchive([{name:'SearchQueries.csv',text:'Time,Search Query\n2026/09/17 13:00:00 UTC,one,"two"'}]).searches[0].query,'one,"two"');
  assert.throws(() => buildArchive([source('Skills.csv', [['Name'], ['one', 'two']])]), /cells; expected/);
});

test('repeated targeting categories retain every positional value and literal formula/XSS text', () => {
  const archive = buildArchive([
    source('Ad_Targeting.csv', [['Company Names', 'Job Titles', 'Company Names'], ['First', 'Role', 'Second']]),
    source('messages.csv', [messageHeader, ['id', '<script>alert(1)</script>', 'A', 'B', 'javascript:alert(1)', '', '=SUM(1,2)', '<img src=x onerror=alert(1)>']]),
  ]);
  assert.deepEqual(archive.targeting, [{ category: 'Company Names', values: ['First', 'Second'] }, { category: 'Job Titles', values: ['Role'] }]);
  assert.equal(archive.messages[0].content, '<img src=x onerror=alert(1)>');
  assert.equal(archive.messages[0].subject, '=SUM(1,2)');
  assert.equal(archive.messages[0].title, '<script>alert(1)</script>');
  assert.equal(archive.messages[0].date, null);
  assert.match(archive.files[1].issues[0], /1 records have missing dates/);
});

test('all supported normalizers use allowlisted fields and date diagnostics', () => {
  const archive = buildArchive([
    source('Profile.csv', [['First Name', 'Last Name', 'Headline', 'Address'], ['A', 'Person', 'Headline', 'PRIVATE']]),
    source('Jobs/Job Applications.csv', [['Company Name', 'Job Title', 'Job Url', 'Application Date', 'Contact Phone Number'], ['Co', 'Job', 'https://example.test', '9/17/26, 1:00 PM', 'PRIVATE']]),
    source('Ads Clicked.csv', [['Ad clicked Date', 'Ad Title/Id'], ['2026/09/17 13:00:00 UTC', 'Ad']]),
    source('Learning.csv', [['Content Title', 'Content Type', 'Content Last Watched Date (if viewed)', 'Content Completed At (if completed)', ''], ['Course', 'Video', '2026-09-17 13:00 UTC', '2026-09-17']]),
    source('Invitations.csv', [['From', 'To', 'Direction', 'Sent At'], ['A', 'B', 'OUTGOING', 'invalid']]),
    source('Inferences_about_you.csv', [['Category', 'Type of inference', 'Description', 'Inference'], ['Category', 'Type', 'Description', 'Value']]),
    source('Skills.csv', [['Name'], ['Skill']]),
  ]);
  assert.deepEqual(archive.profile, { name: 'A Person', headline: 'Headline' });
  assert.equal(archive.jobs.length, 1);
  assert.equal(archive.jobs[0].date, '2026-09-17');
  assert.equal(archive.ads.length, 1);
  assert.equal(archive.learning[0].completed, true);
  assert.equal(archive.invitations[0].date, null);
  assert.equal(archive.inferences[0].value, 'Value');
  assert.deepEqual(archive.skills, ['Skill']);
  assert.equal(JSON.stringify(archive).includes('PRIVATE'), false);
  assert.match(archive.files.find(file => file.name === 'Invitations.csv').issues[0], /1 records have unrecognized or invalid dates/);
});

test('aggregates reconcile undated records and chronological annual/monthly periods', () => {
  const rows = [{ company: 'A', date: '2026-02-01' }, { company: 'B', date: '2025-12-01' }, { company: 'A', date: null }, { company: '', date: '2026-01-01' }];
  assert.deepEqual(groupCounts(rows, 'company'), [{ name: 'A', count: 2 }, { name: 'B', count: 1 }]);
  assert.equal(filterYear(rows, 'all').length, 4);
  assert.equal(filterYear(rows, '2026').length, 2);
  assert.deepEqual(periodSeries(rows), [{ label: '2025', count: 1 }, { label: '2026', count: 2 }]);
  const monthly = periodSeries(rows, '2026');
  assert.equal(monthly.length, 12);
  assert.deepEqual(monthly.slice(0, 3), [{ label: '2026-01', count: 1 }, { label: '2026-02', count: 1 }, { label: '2026-03', count: 0 }]);
  assert.deepEqual(coverage(rows), { first: '2025-12-01', last: '2026-02-01', undated: 1 });
  assert.deepEqual(coverage([]), { first: null, last: null, undated: 0 });
});

test('conversation grouping uses exact normalized sender name and preserves undated/unidentified messages', () => {
  const messages = [
    { id: 'a', title: 'Topic', from: '  OWN  Person ', to: 'Other', date: '2026-01-02' },
    { id: 'a', title: 'Topic', from: 'Other', to: 'Own Person', date: '2026-01-01' },
    { id: 'a', title: 'Topic', from: 'Own Person Junior', to: 'Other', date: null },
    { id: '', title: '', from: 'Other', to: 'Own Person', date: null },
    { id: '', title: '', from: 'Other', to: 'Own Person', date: null },
  ];
  const groups = conversationGroups(messages, 'own person');
  assert.equal(groups.length, 3);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].sent, 1);
  assert.equal(groups[0].received, 2);
  assert.equal(groups[0].lastDate, '2026-01-02');
  assert.deepEqual(groups[0].messages.map(message => message.date), ['2026-01-01', '2026-01-02', null]);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), messages.length);
  assert.equal(conversationGroups(messages, '')[0].sent, 0);
});

test('file count and UTF-8 byte limits apply before CSV parsing', () => {
  assert.throws(() => buildArchive(Array.from({ length: 501 }, () => ({ name: 'unknown.csv', text: '' }))), /at most 500/);
  assert.throws(() => buildArchive([{ name: 'unknown.csv', text: 'π'.repeat(10 * 1024 * 1024 + 1) }]), /20 MiB/);
  const text = 'x'.repeat(20 * 1024 * 1024);
  assert.throws(() => buildArchive(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.csv`, text }))), /100 MiB/);
});

test('unknown conversation IDs cannot collide with actual IDs and time order is retained', () => {
  const groups = conversationGroups([
    { id: '', from: 'A', to: 'B', date: null },
    { id: 'missing-conversation-1', from: 'A', to: 'B', date: '2026-01-02', timestamp: '2026-01-02T10:00:00Z' },
    { id: 'missing-conversation-1', from: 'B', to: 'A', date: '2026-01-02', timestamp: '2026-01-02T09:00:00Z' },
  ], 'A');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].messages.map(m => m.timestamp), ['2026-01-02T09:00:00Z', '2026-01-02T10:00:00Z']);
  const normalized = buildArchive([source('messages.csv', [messageHeader, ['a', 'Topic', 'A', 'B', '', '2026-01-02 10:00:00 UTC', '', 'Body']])]);
  assert.equal(normalized.messages[0].timestamp, '2026-01-02T10:00:00Z');
  assert.deepEqual(periodSeries([{date:'2024-01-01'}, {date:'2026-01-01'}]), [{label:'2024',count:1},{label:'2025',count:0},{label:'2026',count:1}]);
});

test('raw Boolean search quotes preserve literal phrases and comma characters consistently', () => {
  const archive = buildArchive([{name:'SearchQueries.csv',text:'Time,Search Query\n2026/09/17 13:00:00 UTC,"pm" remote\n2026/09/17 13:00:00 UTC,senior"role\n2026/09/17 13:00:00 UTC,"quoted,query"\n2026/09/17 13:00:00 UTC,one,two'}]);
  assert.deepEqual(archive.searches.map(r=>r.query), ['"pm" remote', 'senior"role', '"quoted,query"', 'one,two']);
  assert.match(archive.files[0].issues.join(' '), /preserved verbatim/);
  assert.match(archive.files[0].issues.join(' '), /2 search queries contain literal commas/);
});

test('unsupported malformed sources do not block supported insights or invent record counts', () => {
  const archive=buildArchive([
    source('Skills.csv', [['Name'], ['JavaScript']]),
    {name:'Comments.csv',text:'Date,Link,Message\n2026-01-01,x,hello, world'},
    {name:'Unknown.csv',text:'Header\n"unterminated'},
  ]);
  assert.deepEqual(archive.skills,['JavaScript']);
  assert.equal(archive.files[1].count,1);
  assert.match(archive.files[1].issues[0],/Inventoried without analysis/);
  assert.equal(archive.files[2].count,null);
  assert.match(archive.files[2].issues[0],/Record count unavailable/);
});

test('inline script encoding preserves values while neutralizing HTML parser state changes', () => {
  const value='<!--<ScRiPt></SCRIPT><script>alert(1)</script>';
  const encoded=escapeInlineScript('globalThis.result='+JSON.stringify(value));
  assert.doesNotMatch(encoded,/<!--|<script|<\/script/i);
  const sandbox={};vm.runInNewContext(encoded,sandbox);
  assert.equal(sandbox.result,value);
});

test('search quote handling cannot merge timestamp-delimited records or strip exact phrases', () => {
  const time='2026/09/17 13:00:00 UTC';
  const archive=buildArchive([{name:'SearchQueries.csv',text:`Time,Search Query\n${time},"product manager\n${time},role"\n${time},"exact phrase"\n${time},"pm" remote\n${time},"a\nb"`}]);
  assert.deepEqual(archive.searches.map(r=>r.query),['"product manager','role"','"exact phrase"','"pm" remote','"a\nb"']);
  assert.match(archive.files[0].issues.join(' '),/1 physical lines without a timestamp/);
  const rfc=buildArchive([{name:'SearchQueries.csv',text:`Time,Search Query\n"${time}","a\nb"\n"${time}","a ""quote"""`}]);
  assert.deepEqual(rfc.searches.map(r=>r.query),['a\nb','a "quote"']);
  const commaTime=buildArchive([{name:'SearchQueries.csv',text:'Time,Search Query\n"9/17/26, 1:00 PM",one,two'}]);
  assert.equal(commaTime.searches[0].query,'one,two');
  const undated=buildArchive([{name:'SearchQueries.csv',text:`Time,Search Query\n${time},valid\n,unknown time\n2026/02/30 13:00:00 UTC,impossible date`}]);
  assert.equal(undated.searches.length,3);
  assert.deepEqual(undated.searches.map(r=>r.date),['2026-09-17',null,null]);
  for (const newline of ['\n','\r\n']) {
    const text=['Time,Search Query',`${time},a`,'',`${time},b`,'',''].join(newline);
    const blankRows=buildArchive([{name:'SearchQueries.csv',text}]);
    assert.deepEqual(blankRows.searches.map(r=>r.query),['a','b']);
    assert.doesNotMatch(blankRows.files[0].issues.join(' '),/continuations/);
    const interiorBlank=buildArchive([{name:'SearchQueries.csv',text:['Time,Search Query',`${time},line one`,'','line three'].join(newline)}]);
    assert.equal(interiorBlank.searches[0].query,'line one\n\nline three');
  }
});
