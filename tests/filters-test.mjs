import assert from 'node:assert/strict';import {criterion,toggleCriterion,matchesFilters,searchCriterion,matchesCriterionText,criterionDisplay} from '../filters.js';const e={title:'音乐节',places:['A','B'],partners:['甲','乙'],note:'周末安排'};let f=[];for(const c of [criterion('event','音乐节'),criterion('place','A'),criterion('person','甲'),criterion('person','乙')])f=toggleCriterion(f,c);assert.ok(matchesFilters(e,f));assert.ok(!matchesFilters({...e,partners:['甲']},f));assert.ok(!matchesFilters({...e,places:['B']},f));f=toggleCriterion(f,criterion('event','演唱会'));assert.ok(matchesFilters({...e,title:'演唱会'},f));for(const [scope,word,yes] of [['note','周末',true],['person','甲',true],['place','音乐节',false],['event','音乐节',true],['all','安排',true]])assert.equal(matchesFilters(e,[criterion('keyword',word,{scope})]),yes);assert.ok(matchesFilters(e,[criterion('placeGroup','区域',{values:['B','C']})]));assert.equal(toggleCriterion(f,f[0]).length,f.length-1);console.log(JSON.stringify({multiplePeopleAND:'passed',multiplePlacesAND:'passed',eventNamesOR:'passed',searchScopes:'passed',dedupAndRemove:'passed'}));

const exact=searchCriterion('place','a',[e]);
assert.equal(exact.id,criterion('place','A').id);
assert.deepEqual(criterionDisplay(exact),{label:'地点',icon:'place',value:'A'});
assert.ok(!matchesFilters({...e,places:['Annex']},[exact]));
const partial=searchCriterion('person','张',[{...e,partners:['张三']}]);
assert.equal(partial.kind,'person');
assert.ok(matchesFilters({...e,partners:['张三']},[partial]));
assert.ok(matchesCriterionText(partial,'person','张三'));
assert.ok(!matchesCriterionText(partial,'place','张三'));
const title=searchCriterion('event','演唱',[{...e,title:'[演唱]音乐节'}]);
assert.ok(!matchesFilters({...e,title:'[演唱]音乐节'},[title]));
assert.equal(criterionDisplay(searchCriterion('all','周末',[e])).label,'关键词');

const accented={...e,title:'[展览]Pokémon'};
const pokemon=searchCriterion('event','Pokemon',[accented]);
assert.equal(pokemon.value,'Pokémon');
assert.ok(matchesFilters(accented,[pokemon]));
assert.ok(matchesFilters(accented,[searchCriterion('all','Pokemon',[accented])]));
const plain={...e,title:'Pokemon'};
const both=searchCriterion('event','Pokemon',[accented,plain]);
assert.ok(matchesFilters(accented,[both])&&matchesFilters(plain,[both]));
assert.ok(!matchesFilters(accented,[criterion('event','Pokemon')]));
