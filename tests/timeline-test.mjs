import assert from 'node:assert/strict';import {periodCounts,addMatches,barHeights,periodRange,matchedLabelPlacement,frequencyBuckets} from '../timeline.js';const es=[{start:new Date(2020,0,1)},{start:new Date(2020,1,1)},{start:new Date(2021,0,1)}];let rows=addMatches(periodCounts(es,false,2020,2021),[es[0]],false,2020);assert.deepEqual(rows,[{index:2020,total:2,matched:1},{index:2021,total:1,matched:0}]);rows=addMatches(periodCounts(es,true,2020*12,2021*12+11),[es[0]],true,2020*12);assert.equal(rows[0].matched,1);assert.equal(rows[0].total,1);assert.equal(rows[1].matched,0);assert.equal(rows[1].total,1);assert.deepEqual(barHeights(0,0,100),{total:0,matched:0});assert.equal(barHeights(1,1,10000).total,7);assert.equal(barHeights(1,1,10000).matched,7);assert.ok(barHeights(1000,1,1000).matched>82/1000);assert.ok(barHeights(1000,1,1000).matched<=82*.101);console.log('Timeline denominators, highlights and minimum heights: passed');

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
assert.equal(aggregate('weekday').find(row=>row.title==='星期一').matched,1);
assert.deepEqual(aggregate('date')[1],{value:2,label:'2',title:'2号',total:2,scoped:2,matched:1});
