const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
export function criterion(kind,value,extra={}){
 const c={kind,value,...extra};
 c.id=JSON.stringify([kind,extra.scope||'',norm(value),extra.values?[...extra.values].sort():null,Boolean(extra.partial)]);
 return c;
}
export function toggleCriterion(list,c){const i=list.findIndex(x=>x.id===c.id);return i<0?[...list,c]:list.filter(x=>x.id!==c.id);}
export function eventParts(title){const raw=String(title||'');const m=raw.match(/^\s*[\[【]([^\]】]+)[\]】]\s*(.*)$/);return m?{group:m[1].trim(),name:m[2].trim()}:{group:'',name:raw.trim()};}
export function eventCriteria(list,title){const parts=eventParts(title),next=[...list];for(const [kind,value] of [['group',parts.group],['event',parts.name]])if(value){const c=criterion(kind,value);if(!next.some(x=>x.id===c.id))next.push(c);}return next;}
export function searchCriterion(scope,value,events){
 if(!['event','place','person'].includes(scope))return criterion('keyword',value,{scope});
 const key=norm(value);
 for(const event of events){
  const values=scope==='event'?[eventParts(event.title).name]:scope==='place'?event.places:event.partners;
  const exact=values.find(name=>norm(name)===key);
  if(exact)return criterion(scope,exact);
 }
 return criterion(scope,value,{partial:true});
}
export function matchesCriterionText(c,kind,value){
 if(!value)return false;
 if(c.kind===kind)return c.partial?norm(value).includes(norm(c.value)):norm(value)===norm(c.value);
 if(c.kind==='keyword'&&(!c.scope||c.scope==='all'||c.scope===kind||c.scope==='event'&&kind==='group')){
  return norm(value).includes(norm(c.value));
 }
 if(c.kind==='placeGroup'&&kind==='place')return c.values.some(name=>norm(name)===norm(value));
 return false;
}
export function matchesFilters(event,list,placeType){
 const {name,group}=eventParts(event.title);
 for(const [kind,value] of [['event',name],['group',group]]){
  const criteria=list.filter(c=>c.kind===kind);
  if(criteria.length&&!criteria.some(c=>matchesCriterionText(c,kind,value)))return false;
 }
 return list.every(c=>{
  if(c.kind==='event'||c.kind==='group')return true;
  if(c.kind==='placeType')return event.places.some(name=>placeType?.(name)===c.value);
  if(c.kind==='place'||c.kind==='placeGroup')return event.places.some(name=>matchesCriterionText(c,'place',name));
  if(c.kind==='person')return event.partners.some(name=>matchesCriterionText(c,'person',name));
  return [['event',event.title],['note',event.note],
   ...event.places.map(name=>['place',name]),...event.partners.map(name=>['person',name])]
   .some(([kind,value])=>matchesCriterionText(c,kind,value));
 });
}
export function criterionDisplay(c){
 const [label,icon]=({
  event:['事件','📅'],group:['组别','🏷️'],place:['地点','📍'],person:['人物','👤'],
  placeType:['类型'],placeGroup:['区域','📍'],keyword:[c.scope==='note'?'备注关键词':'关键词'],
 })[c.kind];
 return {label,icon,value:c.label??c.value};
}
export function rankSections(rows,hidden=[]){const keys=new Set(hidden);return {visible:rows.filter(([name])=>!keys.has(norm(name))),hidden:rows.filter(([name])=>keys.has(norm(name)))};}
export function toggleRankHidden(hidden,name){const key=norm(name);return hidden.includes(key)?hidden.filter(n=>n!==key):[...hidden,key];}
