import {dateBucket} from './timeline.js';
import {search as norm} from './place-name.js';
const searchKey=s=>norm(s).normalize('NFD').replace(/(\p{Script=Latin})\p{Mark}+/gu,'$1');
export function criterion(kind,value,extra={}){
 const c={kind,value,...extra};
 c.id=JSON.stringify([kind,extra.scope||'',norm(value),extra.values?[...extra.values].sort():null,Boolean(extra.partial),Boolean(extra.folded)]);
 return c;
}
export function toggleCriterion(list,c){const i=list.findIndex(x=>x.id===c.id);return i<0?[...list,c]:list.filter(x=>x.id!==c.id);}
export function eventParts(title){const raw=String(title||'');const m=raw.match(/^\s*[\[【]([^\]】]+)[\]】]\s*(.*)$/);return m?{group:m[1].trim(),name:m[2].trim()}:{group:'',name:raw.trim()};}
export function eventCriteria(list,title){const parts=eventParts(title),next=[...list];for(const [kind,value] of [['group',parts.group],['event',parts.name]])if(value){const c=criterion(kind,value);if(!next.some(x=>x.id===c.id))next.push(c);}return next;}
export function searchCriterion(scope,value,events){
 if(!['event','place','person'].includes(scope))return criterion('keyword',value,{scope});
 const key=searchKey(value),exact=new Map();
 for(const event of events){
  const values=scope==='event'?[eventParts(event.title).name]:scope==='place'?event.places:event.partners;
  for(const name of values)if(searchKey(name)===key&&!exact.has(norm(name)))exact.set(norm(name),name);
 }
 if(exact.size===1)return criterion(scope,exact.values().next().value);
 if(exact.size>1)return criterion(scope,value,{folded:true});
 return criterion(scope,value,{partial:true});
}
export function matchesCriterionText(c,kind,value){
 if(!value)return false;
 if(c.kind===kind){
  if(c.partial)return searchKey(value).includes(searchKey(c.value));
  if(c.folded)return searchKey(value)===searchKey(c.value);
  return norm(value)===norm(c.value);
 }
 if(c.kind==='keyword'&&(!c.scope||c.scope==='all'||c.scope===kind||c.scope==='event'&&kind==='group')){
  return searchKey(value).includes(searchKey(c.value));
 }
 if(c.kind==='placeGroup'&&kind==='place')return c.values.some(name=>norm(name)===norm(value));
 return false;
}
export function searchableEventNote(note){
 return String(note??'').split(/\r?\n/).filter(line=>!/^\s*(Partner|Place)\s*[:：]/i.test(line)).join('\n').trim();
}
export function matchesFilters(event,list,placeType){
 return createEventMatcher(list,placeType)(event);
}
export function createEventMatcher(list,placeType){
 const names=list.filter(c=>c.kind==='event');
 const groups=list.filter(c=>c.kind==='group');
 const dates=new Map();
 const others=[];
 for(const criterion of list){
  if(criterion.kind==='time'){
   if(!dates.has(criterion.scope))dates.set(criterion.scope,[]);
   dates.get(criterion.scope).push(criterion);
  }else if(criterion.kind!=='event'&&criterion.kind!=='group')others.push(criterion);
 }
 return event=>{
  if(names.length||groups.length){
   const {name,group}=eventParts(event.title);
   if(names.length&&!names.some(c=>matchesCriterionText(c,'event',name)))return false;
   if(groups.length&&!groups.some(c=>matchesCriterionText(c,'group',group)))return false;
  }
  for(const conditions of dates.values()){
   if(!conditions.some(c=>matchesCriterionDate(c,event.start,event.allDay)))return false;
  }
  let note;
  return others.every(c=>{
   if(c.kind==='placeType')return event.places.some(name=>placeType?.(name)===c.value);
   if(c.kind==='place'||c.kind==='placeGroup')return event.places.some(name=>matchesCriterionText(c,'place',name));
   if(c.kind==='person')return event.partners.some(name=>matchesCriterionText(c,'person',name));
   return matchesCriterionText(c,'event',event.title)
    ||event.places.some(name=>matchesCriterionText(c,'place',name))
    ||event.partners.some(name=>matchesCriterionText(c,'person',name))
    ||matchesCriterionText(c,'note',note??=searchableEventNote(event.note));
  });
 };
}
export function matchesCriterionDate(criterion,date,allDay=false){
 return criterion.kind==='time'&&!(criterion.scope==='hour'&&allDay)&&dateBucket(date,criterion.scope)===Number(criterion.value);
}
export function criterionDisplay(c){
 const [label,icon]=({
  event:['事件','event'],group:['组别','group'],place:['地点','place'],person:['人物','person'],
  placeType:['类型'],placeGroup:['区域','place'],time:['日期','event'],keyword:[c.scope==='note'?'备注关键词':'关键词','search'],
 })[c.kind];
 return {label,icon,value:c.label??c.value};
}
export function rankSections(rows,hidden=[]){const keys=new Set(hidden);return {visible:rows.filter(([name])=>!keys.has(norm(name))),hidden:rows.filter(([name])=>keys.has(norm(name)))};}
export function toggleRankHidden(hidden,name){const key=norm(name);return hidden.includes(key)?hidden.filter(n=>n!==key):[...hidden,key];}
