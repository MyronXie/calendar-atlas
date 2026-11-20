import assert from 'node:assert/strict';import {periodCounts,addMatches,barHeights,periodRange,matchedLabelPlacement,frequencyBuckets,dateConditionLabels,hourGroups} from '../timeline.js';const es=[{start:new Date(2020,0,1)},{start:new Date(2020,1,1)},{start:new Date(2021,0,1)}];let rows=addMatches(periodCounts(es,false,2020,2021),[es[0]],false,2020);assert.deepEqual(rows,[{index:2020,total:2,matched:1},{index:2021,total:1,matched:0}]);rows=addMatches(periodCounts(es,true,2020*12,2021*12+11),[es[0]],true,2020*12);assert.equal(rows[0].matched,1);assert.equal(rows[0].total,1);assert.equal(rows[1].matched,0);assert.equal(rows[1].total,1);assert.deepEqual(barHeights(0,0,100),{total:0,matched:0});assert.equal(barHeights(1,1,10000).total,7);assert.equal(barHeights(1,1,10000).matched,7);assert.ok(barHeights(1000,1,1000).matched>82/1000);assert.ok(barHeights(1000,1,1000).matched<=82*.101);console.log('Timeline denominators, highlights and minimum heights: passed');

assert.deepEqual(periodRange(2020,2021,false),['2020-01-01','2021-12-31']);
assert.deepEqual(periodRange(2024*12+1,2024*12+1,true),['2024-02-01','2024-02-29']);
assert.deepEqual(periodRange(2025*12+1,2024*12+11,true),['2024-12-01','2025-02-28']);

assert.equal(matchedLabelPlacement(barHeights(123,3,123)),'above');
assert.equal(matchedLabelPlacement(barHeights(123,120,123)),'inside');
assert.equal(matchedLabelPlacement(barHeights(1,1,123)),'raised-total');

const from=new Date(2026,0,1),to=new Date(2027,11,31,23,59);
const february={start:new Date(2026,1,2,12)},sameMonth={start:new Date(2027,1,2,12)};
const overlapping={start:new Date(2025,11,31,12),end:new Date(2026,0,2,12)};
const aggregate=unit=>frequencyBuckets([overlapping,february,sameMonth],[february,sameMonth],[february],unit,from,to);
assert.deepEqual(aggregate('year').map(({total,scoped,matched})=>[total,scoped,matched]),[[1,0,0],[1,1,1],[1,1,0]]);
assert.deepEqual(aggregate('month')[1],{value:2,label:'2',title:'2月',total:2,scoped:2,matched:1});
assert.equal(aggregate('weekday').find(row=>row.title==='周一').matched,1);
assert.deepEqual(aggregate('date')[1],{value:2,label:'2',title:'2日',total:2,scoped:2,matched:1});

const facet=(scope,...values)=>values.map(value=>({scope,value:String(value)}));
const span=(from,to)=>Array.from({length:to-from+1},(_,i)=>from+i);
assert.deepEqual(dateConditionLabels([...facet('date',23),...facet('weekday',6,5),...facet('month',7),...facet('year',2012,2014)]),
 ['2012年','2014年','7月','双休日','23日']);
assert.deepEqual(dateConditionLabels([...facet('year',...span(2012,2020),2023),...facet('month',4,5,6),...facet('weekday',1,2,3,4)]),
 ['2012~2020年','2023年','二季度','周二~五']);
assert.deepEqual(dateConditionLabels([...facet('month',12,1,2,3,4,5)]),['1~5月','12月']);
assert.deepEqual(dateConditionLabels([...facet('month',12,1,2,6,7,8),...facet('date',...span(1,10),...span(21,31))]),['夏季','冬季','上旬','下旬']);
const night=hourGroups.find(group=>group.label==='深夜');
assert.deepEqual(dateConditionLabels(facet('hour',...night.hours,...span(5,11),15)),['清晨','上午','15时','深夜']);
assert.deepEqual([...new Set(hourGroups.flatMap(group=>group.hours))].sort((a,b)=>a-b),span(0,23));
const untimed={...overlapping,allDay:true};
const hours=frequencyBuckets([untimed,february],[february],[], 'hour',from,to);
assert.equal(hours.length,24);
assert.equal(hours.reduce((total,row)=>total+row.total,0),1);
assert.equal(hours[12].scoped,1);
