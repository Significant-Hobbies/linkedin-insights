import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInsights,exactQueryCounts} from './insights.mjs';
import {buildArchive,conversationGroups,sourceNames} from './core.mjs';
const archive = (data={},keys=['connections','messages','jobs','searches']) => ({files:keys.map(key=>({name:sourceNames[key]})),profile:{name:'Own Person'},connections:[],messages:[],jobs:[],searches:[],...data});
const row=(date,fields={})=>({date,...fields});
test('source presence separates absent, included empty and zero selected records',()=>{
  const absent=buildInsights(archive({},[]));
  for(const key of ['network','messaging','applications','searches']) assert.equal(absent[key].state,'absent');
  const empty=buildInsights(archive());
  for(const key of ['network','messaging','applications','searches']) assert.equal(empty[key].state,'empty');
  assert.equal(empty.network.topFiveShare,null);assert.equal(empty.messaging.bothDirectionsShare,null);assert.equal(empty.overlap.share,null);
  const data=archive({connections:[row(null,{company:'Co'})]});
  assert.equal(buildInsights(data,'2024').network.state,'selection-empty');
  assert.equal(buildInsights(data).network.count,1);
});
test('year selection applies before every domain calculation and retains full undated coverage without mutation',()=>{
  const data=archive(Object.fromEntries(['connections','messages','jobs','searches'].map(key=>[key,[row('2024-01-01'),row('2023-01-01'),row(null)]])));
  const before=structuredClone(data),all=buildInsights(data),selected=buildInsights(data,'2024');
  for(const key of ['network','messaging','applications','searches']) {assert.equal(all[key].count,3);assert.equal(selected[key].count,1);assert.equal(selected[key].full.undated,1);assert.equal(selected[key].selected.undated,0);assert.equal(selected[key].series.reduce((s,r)=>s+r.count,0),1)}
  assert.deepEqual(data,before);
});
test('network concentration denominators, label coverage and peak ties reconcile',()=>{
  const data=archive({connections:[row('2024-01-01',{company:'Co',position:'Role'}),row('2023-01-01',{company:'Co'}),row(null,{company:'Other',position:'Role'}),row(null,{company:' ',position:''})]});
  const {network}=buildInsights(data);
  assert.deepEqual(network.peaks,[{label:'2023',count:1},{label:'2024',count:1}]);
  assert.equal(network.companies.labelled,3);assert.equal(network.companies.missing,1);assert.equal(network.roles.missing,2);assert.equal(network.topFiveCount,3);assert.equal(network.topFiveShare,1);
});
test('messaging uses normalized exact owner names, separates unnamed senders and only identifies real IDs',()=>{
  const messages=[row(null,{id:'a',from:' ＯＷＮ   Person '}),row(null,{id:'a',from:'Other'}),row(null,{id:'b',from:' '}),row(null,{id:' ',from:'Own Person'}),row(null,{id:'',from:'Other'}),row(null,{id:'c',from:'Own Person Junior'})];
  const data=archive({messages}),m=buildInsights(data).messaging;
  assert.deepEqual(m.direction,{owner:2,other:3,unnamed:1,unattributed:0});assert.equal(m.knownConversations,3);assert.equal(m.unknownIdRecords,2);assert.equal(m.bothDirections,1);assert.equal(m.bothDirectionsShare,1/3);
  const groups=conversationGroups(messages,data.profile.name);assert.equal(groups.length,5);assert.equal(groups.filter(g=>g.knownId).length,3);assert.equal(groups.reduce((n,g)=>n+g.unnamed,0),1);
  const unknown=buildInsights({...data,profile:{name:' '}}).messaging;
  assert.equal(unknown.ownerKnown,false);assert.equal(unknown.bothDirections,null);assert.equal(unknown.bothDirectionsShare,null);assert.deepEqual(unknown.direction,{owner:0,other:0,unnamed:1,unattributed:5});
});
test('UTC rhythm excludes date-only and invalid timestamps while active dates include valid calendar dates',()=>{
  const {messaging:m}=buildInsights(archive({messages:[row('2024-01-01',{timestamp:'2024-01-01T23:00:00Z'}),row('2024-01-02',{timestamp:null}),row(null),row('2024-01-03',{timestamp:'2024-02-30T10:00:00Z'}),row('2024-01-04',{timestamp:'2024-01-04T24:00:00Z'})]}));
  assert.equal(m.rhythm.timed,1);assert.equal(m.rhythm.omitted,4);assert.equal(m.rhythm.hours[23],1);assert.equal(m.rhythm.hours[0],0);assert.equal(m.rhythm.weekdays[0],1);assert.equal(m.rhythm.heatmap[0][23],1);assert.equal(m.activeDates,4);
  const parsed=buildArchive([{name:'messages.csv',text:'CONVERSATION ID,CONVERSATION TITLE,FROM,TO,SENDER PROFILE URL,DATE,SUBJECT,CONTENT\na,,A,B,,2024-01-01,,body\nb,,A,B,,2024-01-02 01:00:00 UTC,,body'}]);
  assert.equal(buildInsights(parsed).messaging.rhythm.timed,1);
});
test('literal queries preserve case, whitespace, quotes, commas and newlines and count repetition separately',()=>{
  const queries=['role','role','role ','Role','"role"','one,two','one\ntwo',' '];
  const {searches:s}=buildInsights(archive({searches:queries.map(query=>row(null,{query}))}));
  assert.equal(s.queries.unique,6);assert.equal(s.queries.labelled,7);assert.equal(s.queries.missing,1);assert.equal(s.queries.repeatedGroups,1);assert.equal(s.queries.repeatedRecords,2);assert.equal(s.queries.excess,1);
  assert.deepEqual(exactQueryCounts(queries.map(query=>({query}))),s.queries.groups);assert.equal(s.queries.groups.find(g=>g.name==='role ').count,1);
});
test('application repetition and exact company join use selected applications and the whole exported network',()=>{
  const data=archive({connections:[row(null,{company:'Co'}),row('2023-01-01',{company:'Co'}),row(null,{company:'co'}),row(null,{company:''})],jobs:[row('2024-01-01',{company:' Co ',title:'Role'}),row('2024-01-02',{company:'Co',title:'Role'}),row('2024-02-01',{company:'CO',title:''}),row(null,{company:'co'}),row('2024-01-01',{company:' '})]});
  const {applications:a,overlap:o}=buildInsights(data,'2024');
  assert.equal(a.companies.unique,2);assert.equal(a.companies.repeatedGroups,1);assert.equal(a.companies.repeatedRecords,2);assert.equal(a.companies.excess,1);assert.equal(a.companies.missing,1);
  assert.deepEqual(o.matches,[{name:'Co',applications:2,connections:2}]);assert.equal(o.denominator,3);assert.equal(o.share,2/3);assert.equal(o.networkRecords,4);
  assert.equal(buildInsights({...data,files:data.files.filter(f=>f.name!==sourceNames.connections)}).overlap.available,false);
});

test('top-five share has a labelled-record denominator and stable label ties',()=>{
  const connections = ['Zulu','Echo','Delta','Charlie','Bravo','Alpha',''].map(company=>row('2024-01-01',{company}));
  const {network}=buildInsights(archive({connections}));
  assert.deepEqual(network.companies.groups.map(group=>group.name),['Alpha','Bravo','Charlie','Delta','Echo','Zulu']);
  assert.equal(network.topFiveCount,5);assert.equal(network.topFiveShare,5/6);
  const queries=exactQueryCounts([row('2024-01-02',{query:'x'}),row(null,{query:'x'}),row('2023-01-01',{query:'x'})]);
  assert.deepEqual(queries,[{name:'x',count:3,firstDate:'2023-01-01',lastDate:'2024-01-02'}]);
});
