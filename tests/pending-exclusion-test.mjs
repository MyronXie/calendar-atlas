import assert from 'node:assert/strict';
import {isPlaceExcluded,applyRules,unlocatedVisits,normalizePlace} from '../lib/organize.js';
import {placeIndex} from '../lib/place-categories.js';
const rules={placeRules:[{enabled:'1',match_type:'contains',value:'教学楼'},{enabled:'1',match_type:'exact',value:'旧教室'},{enabled:'0',match_type:'contains',value:'公园'}],eventRules:[{enabled:'1',match_type:'contains',value:'上课'}]};
assert(isPlaceExcluded({location:'报告厅',address:'某教学楼二楼'},rules));
assert(isPlaceExcluded({location:'新名称',aliases:'旧教室；其他别名'},rules));
assert(!isPlaceExcluded({location:'公园'},rules));
assert(!isPlaceExcluded({location:'旧教室旁的餐厅'},rules));
assert(isPlaceExcluded('教学楼入口',rules));
const events=[{title:'上课',places:['未命名楼'],partners:[]},{title:'散步',places:['公园'],partners:[]}];
assert.deepEqual(applyRules(events,rules,true).events.map(e=>e.title),['散步']);
const lookup=placeIndex([
 {location:'实际地点',aliases:'旧地点名',lat:'31',lon:'121'},
 {location:'无坐标地点',aliases:'无坐标旧称',lat:'',lon:''},
],normalizePlace);
const {missing}=unlocatedVisits([{title:'到访',places:['旧地点名','无坐标旧称','无坐标地点']}],lookup,rules);
assert.deepEqual([...missing.values()].map(place=>[place.name,place.events.size]),[['无坐标地点',1]]);
console.log('Pending exclusion checks names, addresses, aliases, disabled rules and blacklisted events: passed');
