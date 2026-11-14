import {buildDeepInsights} from './signals.mjs';
import {sourceFile, filterYear, coverage, periodSeries, groupCounts, classifySender, normalizedName} from './core.mjs';

const label = value => String(value ?? '').trim();
const sum = groups => groups.reduce((total, group) => total + group.count, 0);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = counts => [...counts].map(([name, count]) => ({name, count})).sort((a,b) => b.count-a.count || compare(a.name,b.name));
export function exactQueryCounts(rows) {
  const counts = new Map(), dates = new Map();
  for (const {query,date} of rows) {
    if (!label(query)) continue;
    counts.set(query, (counts.get(query) || 0) + 1);
    if (!dates.has(query)) dates.set(query,{firstDate:null,lastDate:null});
    const range = dates.get(query);
    if (date && (!range.firstDate || date < range.firstDate)) range.firstDate = date;
    if (date && (!range.lastDate || date > range.lastDate)) range.lastDate = date;
  }
  return sorted(counts).map(group => ({...group,...dates.get(group.name)}));
}
function domain(archive, key, year) {
  const all = archive[key], rows = filterYear(all, year), source = sourceFile(archive, key) ?? null;
  const selected = coverage(rows), full = coverage(all);
  const series = periodSeries(rows, year), peak = Math.max(0, ...series.map(item => item.count));
  return {source, rows, total: all.length, count: rows.length, selected, full, series, peaks: peak ? series.filter(item => item.count === peak) : [], state: !source ? 'absent' : !all.length ? 'empty' : !rows.length ? 'selection-empty' : 'ready'};
}
function distribution(rows, key) {
  const groups = groupCounts(rows,key).sort((a,b)=>b.count-a.count || compare(a.name,b.name)), labelled = sum(groups), repeated = groups.filter(group => group.count > 1);
  return {groups, labelled, missing: rows.length-labelled, unique: groups.length, repeatedGroups: repeated.length, repeatedRecords: sum(repeated), excess: labelled-groups.length};
}
export function buildInsights(archive, year = 'all') {
  const network = domain(archive,'connections',year), messaging = domain(archive,'messages',year), applications = domain(archive,'jobs',year), searches = domain(archive,'searches',year);
  network.companies = distribution(network.rows,'company');
  network.roles = distribution(network.rows,'position');
  network.topFiveCount = sum(network.companies.groups.slice(0,5));
  network.topFiveShare = ratio(network.topFiveCount,network.companies.labelled);
  messaging.ownerKnown = Boolean(normalizedName(archive.profile.name));
  messaging.direction = {owner:0,other:0,unnamed:0,unattributed:0};
  const conversations = new Map();
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0), heatmap = Array.from({length:7},()=>Array(24).fill(0));
  let timed = 0;
  for (const row of messaging.rows) {
    const sender = classifySender(row.from,archive.profile.name);
    messaging.direction[sender]++;
    if (label(row.id)) {
      if (!conversations.has(row.id)) conversations.set(row.id,new Set());
      conversations.get(row.id).add(sender);
    }
    // Date-only rows have no defensible UTC hour.
    if (typeof row.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(row.timestamp)) continue;
    const instant = new Date(row.timestamp);
    if (!Number.isFinite(+instant) || instant.toISOString().slice(0,19)+'Z' !== row.timestamp) continue;
    const hour = instant.getUTCHours(), day = (instant.getUTCDay()+6)%7;
    timed++; hours[hour]++; weekdays[day]++; heatmap[day][hour]++;
  }
  messaging.knownConversations = conversations.size;
  messaging.unknownIdRecords = messaging.rows.filter(row => !label(row.id)).length;
  messaging.bothDirections = messaging.ownerKnown ? [...conversations.values()].filter(senders => senders.has('owner') && senders.has('other')).length : null;
  messaging.bothDirectionsShare = messaging.ownerKnown ? ratio(messaging.bothDirections,conversations.size) : null;
  messaging.rhythm = {hours,weekdays,heatmap,timed,omitted:messaging.count-timed};
  messaging.activeDates = new Set(messaging.rows.map(row=>row.date).filter(Boolean)).size;
  applications.companies = distribution(applications.rows,'company');
  applications.titles = distribution(applications.rows,'title');
  const queries = exactQueryCounts(searches.rows), repeated = queries.filter(query=>query.count>1);
  searches.queries = {groups:queries,labelled:sum(queries),missing:searches.count-sum(queries),unique:queries.length,repeatedGroups:repeated.length,repeatedRecords:sum(repeated),excess:sum(queries)-queries.length};
  const available = Boolean(applications.source && network.source);
  const allCompanies = groupCounts(archive.connections,'company'), lookup = new Map(allCompanies.map(group=>[group.name,group.count]));
  const matches = available ? applications.companies.groups.filter(group=>lookup.has(group.name)).map(group=>({name:group.name,applications:group.count,connections:lookup.get(group.name)})) : [];
  const matchingRecords = matches.reduce((total,match)=>total+match.applications,0);
  const overlap = {available,matches,matchingRecords,denominator:applications.companies.labelled,share:available?ratio(matchingRecords,applications.companies.labelled):null,networkRecords:archive.connections.length};
  return {year,network,messaging,applications,searches,overlap,deep:buildDeepInsights(archive,year)};
}
