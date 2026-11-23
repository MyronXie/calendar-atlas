import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classifyActivity} from '../lib/activity.js';
import {expand,parseCalendar,setPlaceResolver} from '../lib/core.js';
import {createEventMatcher,criterion} from '../lib/filters.js';

const locations=new Map([
 ['体育馆',{location:'体育馆',type:'sport',labels:'足球'}],
 ['通用剧场',{location:'通用剧场',type:'art',labels:'演出场馆'}],
 ['影院',{location:'影院',type:'fun',labels:'电影'}],
 ['环球影城',{location:'环球影城',type:'fun',labels:'电影'}],
]);
const lookup=name=>locations.get(name);
const sample=(title,note='',places=[])=>({title,note,places,partners:[]});
const result=(event,label,source)=>assert.deepEqual(classifyActivity(event,lookup),{label,source});
result(sample('[周末] 演出', '备注\n活动：桌游',['影院']),'桌游','备注标注');
result(sample('音乐剧《示例》','',['体育馆']),'音乐剧','事件标题');
result(sample('吃吃吃'),'餐饮','事件标题');
assert.equal(classifyActivity(sample('逛吃逛吃','',['影院']),lookup),null);
assert.equal(classifyActivity(sample('看电影再玩桌游','',['影院']),lookup),null);
assert.equal(classifyActivity(sample('近况','活动：桌游\n活动：电影',['影院']),lookup),null);
assert.equal(classifyActivity(sample('近况','上周看电影了'),lookup),null);
assert.equal(classifyActivity(sample('体验','',['环球影城']),lookup),null);
assert.deepEqual(classifyActivity(sample('演出','',['通用剧场']),lookup),
 {label:'现场演出',source:'地点类型',place:'通用剧场'});
const match=createEventMatcher([criterion('activity','音乐剧'),criterion('businessArea','示例商圈')],null,
 (event,kind)=>kind==='activity'?[classifyActivity(event,lookup)?.label]:event.places.map(place=>place==='体育馆'?'示例商圈':''));
assert(match(sample('音乐剧《示例》','',['体育馆'])));
assert(!match(sample('看电影','',['体育馆'])));
assert(!match(sample('音乐剧《示例》','',['影院'])));

const text=await fs.readFile(new URL('./fixtures/fixture.ics',import.meta.url),'utf8');
const source=parseCalendar(text);
const start=new Date('2026-01-01T00:00:00Z'),end=new Date('2026-01-04T00:00:00Z');
setPlaceResolver(name=>name==='Test city'?'地点甲':name);
assert(expand(source,start,end).events.some(event=>event.places.includes('地点甲')));
setPlaceResolver(name=>name==='Test city'?'地点乙':name);
const changed=expand(source,start,end).events.flatMap(event=>event.places);
assert(changed.includes('地点乙'));
assert(!changed.includes('地点甲'));
setPlaceResolver(null);
