import {sourceFile, sourceNames, datedSourceKeys, filterYear, coverage, groupCounts, conversationGroups, normalizedName} from './core.mjs';

const text = value => String(value ?? '').trim();
const total = groups => groups.reduce((sum, item) => sum + item.count, 0);
const stableGroups = (rows, key) => groupCounts(rows, key).sort((a,b) => b.count-a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const monthIndex = month => Number(month.slice(0,4))*12+Number(month.slice(5,7))-1;
const monthLabel = index => `${String(Math.floor(index/12)).padStart(4,'0')}-${String(index%12+1).padStart(2,'0')}`;
const dayIndex = date => Date.parse(date+'T00:00:00Z')/86400000;
export function activityPattern(rows) {
  const dates = [...new Set(rows.map(row=>row.date).filter(Boolean))].sort();
  const months = stableGroups(rows, row=>row.date?.slice(0,7));
  let longest = 0, run = 0, start = null, previous = null, streak = null;
  for (const date of dates) {
    if (previous !== null && dayIndex(date)-dayIndex(previous) === 1) run++;
    else { run = 1; start = date; }
    if (run > longest) { longest = run; streak = {days:run,first:start,last:date}; }
    previous = date;
  }
  return {activeDays:dates.length, datedRecords:rows.filter(row=>row.date).length, longestStreak:streak, months, peaks:months.filter(month=>month.count===months[0]?.count)};
}
export function sourceDomain(archive, key, year='all', dateKey='date') {
  const original = archive[key] || [], all = dateKey === 'date' ? original : original.map(row=>({...row,originalDate:row.date,date:row[dateKey] || null}));
  const rows = filterYear(all,year), source = sourceFile(archive,key) ?? null;
  return {key,source,rows,total:all.length,count:rows.length,full:coverage(all),selected:coverage(rows),pattern:activityPattern(rows),state:!source?'absent':!all.length?'empty':!rows.length?'selection-empty':'ready'};
}
function groups(rows,key) {
  const values = stableGroups(rows,key), labelled = total(values);
  return {values,labelled,missing:rows.length-labelled};
}
function exactURL(value) {
  const raw = text(value);
  try { const parsed = new URL(raw); return ['https:','http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? raw : null; }
  catch { return null; }
}
function sharedDomain(value) {
  const raw = exactURL(value);
  return raw ? new URL(raw).hostname.toLowerCase() : null;
}
export function sourceCalendar(domains,year='all') {
  const included = Object.values(domains).filter(domain=>domain.source);
  const dates = included.flatMap(domain=>[domain.selected.first,domain.selected.last]).filter(Boolean).sort();
  let first = year==='all' ? dates[0]?.slice(0,7) : `${year}-01`;
  const last = year==='all' ? dates.at(-1)?.slice(0,7) : `${year}-12`;
  const omittedMonths = first && last ? Math.max(0,monthIndex(last)-monthIndex(first)+1-36) : 0;
  if (omittedMonths) first = monthLabel(monthIndex(first)+omittedMonths);
  const periods = [];
  if(first && last) for(let index=monthIndex(first);index<=monthIndex(last);index++) periods.push(monthLabel(index));
  const rows = included.map(domain=>{
    const counts = new Map(domain.pattern.months.map(item=>[item.name,item.count]));
    return {key:domain.key,name:sourceNames[domain.key],source:domain.source.name,first:domain.full.first,last:domain.full.last,undated:domain.full.undated,selected:domain.count,cells:periods.map(period=>!domain.full.first || period<domain.full.first.slice(0,7) || period>domain.full.last.slice(0,7) ? null : counts.get(period)||0)};
  });
  return {periods,rows,omittedMonths};
}
export function buildDeepInsights(archive,year='all') {
  const domains = Object.fromEntries(datedSourceKeys.map(key=>[key,sourceDomain(archive,key,year)]));
  const invitations = domains.invitations;
  invitations.mix = {incoming:0,outgoing:0,unknown:0};
  for(const row of invitations.rows) {
    const direction = text(row.direction).toUpperCase();
    invitations.mix[direction==='INCOMING'?'incoming':direction==='OUTGOING'?'outgoing':'unknown']++;
  }
  invitations.labels = groups(invitations.rows,'direction');
  const saved = domains.savedJobs;
  saved.companies = groups(saved.rows,'company'); saved.titles = groups(saved.rows,'title');
  const appURLs = new Set((archive.jobs||[]).map(row=>exactURL(row.url)).filter(Boolean));
  const validSaved = saved.rows.filter(row=>exactURL(row.url));
  const matchingSaved = validSaved.filter(row=>appURLs.has(exactURL(row.url)));
  saved.matches = {available:Boolean(saved.source && domains.jobs.source),valid:validSaved.length,omitted:saved.count-validSaved.length,records:matchingSaved.length,uniqueURLs:new Set(matchingSaved.map(row=>exactURL(row.url))).size,rows:matchingSaved,applicationRecords:(archive.jobs||[]).length};
  const follows = domains.companyFollows;
  follows.companies = groups(follows.rows,'company');
  const networkCompanies = new Map(stableGroups(archive.connections||[],'company').map(group=>[group.name,group.count]));
  const applicationCompanies = new Map(stableGroups(domains.jobs.rows,'company').map(group=>[group.name,group.count]));
  follows.matches = follows.companies.values.map(group=>({name:group.name,follows:group.count,connections:domains.connections.source?(networkCompanies.get(group.name)||0):null,applications:domains.jobs.source?(applicationCompanies.get(group.name)||0):null}));
  const reactions = domains.reactions, shares = domains.shares;
  reactions.types = groups(reactions.rows,'type');
  shares.visibility = groups(shares.rows,'visibility');
  shares.commentaryRecords = shares.rows.filter(row=>text(row.commentary)).length;
  shares.sharedDomains = groups(shares.rows,row=>sharedDomain(row.sharedUrl));
  const received = domains.endorsementsReceived, given = domains.endorsementsGiven;
  for(const domain of [received,given]) { domain.skills = groups(domain.rows,'skill'); domain.statuses = groups(domain.rows,'status'); }
  const declared = [...new Set((archive.skills||[]).map(text).filter(Boolean))].sort();
  const receivedLabels = new Map(received.skills.values.map(group=>[group.name,group.count]));
  const declaredMatches = declared.filter(skill=>receivedLabels.has(skill)).map(name=>({name,count:receivedLabels.get(name)}));
  const skillOverlap = {available:Boolean(sourceFile(archive,'skills')&&received.source),declared:declared.length,matches:declaredMatches,unmatchedDeclared:declared.filter(skill=>!receivedLabels.has(skill)),undeclaredEndorsed:received.skills.values.filter(group=>!declared.includes(group.name))};
  const learning = domains.learning;
  learning.types = groups(learning.rows,'type');
  const completions = sourceDomain(archive,'learning',year,'completedDate');
  completions.rows = completions.rows.filter(row=>row.date);
  completions.count = completions.rows.length;
  completions.pattern = activityPattern(completions.rows);
  completions.selected = coverage(completions.rows);
  completions.validTotal = completions.total-completions.full.undated;
  completions.state = !completions.source?'absent':!completions.validTotal?'empty':!completions.count?'selection-empty':'ready';
  learning.completions = completions;
  learning.completedAmongViewed = learning.rows.filter(row=>row.date && row.completedDate).length;
  const conversations = conversationGroups(domains.messages.rows,archive.profile?.name||'').filter(group=>group.knownId).map(group=>{
    const dated = coverage(group.messages), activeMonths = new Set(group.messages.map(row=>row.date?.slice(0,7)).filter(Boolean)).size;
    const label = group.title || group.participants.filter(name=>normalizedName(name)!==normalizedName(archive.profile?.name||'')).join(', ') || 'Untitled conversation';
    return {id:group.id,label,records:group.count,first:dated.first,last:dated.last,undated:dated.undated,activeMonths};
  });
  const recordCounts = conversations.map(group=>group.records).sort((a,b)=>a-b), middle = Math.floor(recordCounts.length/2);
  const messaging = {groups:conversations,knownRecords:total(conversations.map(group=>({count:group.records}))),recurrent:conversations.filter(group=>group.activeMonths>=2).length,medianRecords:recordCounts.length?(recordCounts.length%2?recordCounts[middle]:(recordCounts[middle-1]+recordCounts[middle])/2):null};
  const findings = [];
  const add = (title,body,target,source) => findings.push({title,body,target,source:source.name});
  if(invitations.source && invitations.count) add('Invitation direction',`${invitations.mix.outgoing} outgoing and ${invitations.mix.incoming} incoming invitation records; ${invitations.mix.unknown} have an unknown direction, out of ${invitations.count} selected.`, 'signal-invitations',invitations.source);
  if(reactions.source && reactions.types.values.length) { const top=reactions.types.values[0]; add('Your most recorded reaction',`“${top.name}” appears in ${top.count} of ${reactions.types.labelled} reaction records with a nonblank type (${reactions.count} selected in total).`,'signal-social',reactions.source); }
  if(received.source && received.skills.values.length) { const top=received.skills.values[0]; add('A skill people endorsed',`“${top.name}” has ${top.count} of ${received.skills.labelled} nonblank-skill received endorsement records. Statuses are shown separately; these records do not measure competence.`,'signal-skills',received.source); }
  if(saved.matches.available && saved.count) add('Saved jobs in application history',`${saved.matches.records} of ${saved.matches.valid} selected saved-job records with valid HTTP(S) URLs match an exact URL in all ${saved.matches.applicationRecords} exported application records.`,'signal-career',saved.source);
  if(learning.source && (learning.count || completions.count)) add('Learning across two date axes',`${learning.pattern.datedRecords} records have a last-watched date in this selection; ${completions.count} have a completion date in this selection. ${learning.selected.undated} selected records have no valid last-watched date. These are separate cohorts.`,'signal-learning',learning.source);
  if(domains.messages.source && messaging.recurrent) add('Conversations across months',`${messaging.recurrent} of ${conversations.length} known conversation IDs contain records in at least two distinct months in this selection.`,'signal-conversations',domains.messages.source);
  if(shares.source && shares.sharedDomains.values.length) { const top=shares.sharedDomains.values[0]; add('A domain you shared',`“${top.name}” appears in ${top.count} of ${shares.sharedDomains.labelled} post records with a valid shared HTTP(S) URL. ${shares.sharedDomains.missing} records have no eligible shared URL.`,'signal-social',shares.source); }
  if(follows.source && follows.companies.values.length) add('Companies you follow',`${follows.companies.values.length} exact company labels appear in ${follows.companies.labelled} selected follow records. Compare the labels with your network and applications below.`,'signal-career',follows.source);
  const streaks = Object.values(domains).filter(domain=>domain.source && domain.pattern.longestStreak).sort((a,b)=>b.pattern.longestStreak.days-a.pattern.longestStreak.days || a.key.localeCompare(b.key));
  if(streaks.length) { const domain=streaks[0],streak=domain.pattern.longestStreak; add('A recorded daily streak',`${sourceNames[domain.key]} contains records on ${streak.days} consecutive calendar ${streak.days===1?'day':'days'}, ${streak.first} to ${streak.last}. This is an observed record pattern, not time spent.`,'signal-calendar',domain.source); }
  return {domains,calendar:sourceCalendar(domains,year),invitations,saved,follows,reactions,shares,received,given,skillOverlap,learning,messaging,findings};
}
