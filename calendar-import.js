import ICAL from './vendor/ical.min.js';
import {details} from './core.js';

const relevant=new Set(['summary','description','location','dtstart','dtend','duration','rrule','rdate','exdate','status']);
function snapshot(text){
 const calendar=new ICAL.Component(ICAL.parse(text));
 if(calendar.name!=='vcalendar')throw Error('请选择有效的 ICS 日历文件');
 const rows=new Map();
 for(const component of calendar.getAllSubcomponents('vevent')){
  const event=new ICAL.Event(component);
  const start=event.startDate?.toString()||'';
  const info=details(event);
  const key=JSON.stringify([event.uid||[start,info.title],component.getFirstPropertyValue('recurrence-id')?.toString()||'']);
  let unique=key;
  for(let suffix=2;rows.has(unique);suffix++)unique=key+'#'+suffix;
  const signature=JSON.stringify(component.getAllProperties().filter(property=>relevant.has(property.name))
   .map(property=>JSON.stringify(property.toJSON())).sort());
  rows.set(unique,{...info,start,signature});
 }
 return rows;
}

export function compareCalendars(current,incoming,isKnown){
 const old=snapshot(current),next=snapshot(incoming);
 if(![...next.values()].some(event=>event.start))throw Error('新日历没有有效事件');
 const added=[],changed=[],missing=[],unmatched=new Set();
 for(const [key,event] of next){
  const prior=old.get(key);
  if(!prior)added.push(event);
  else if(event.signature!==prior.signature){
   const addedPlaces=event.places.filter(place=>!prior.places.includes(place));
   const addedPartners=event.partners.filter(person=>!prior.partners.includes(person));
   changed.push({...event,addedPlaces,addedPartners});
  }
  for(const place of event.places)if(!isKnown(place))unmatched.add(place);
 }
 for(const [key,event] of old)if(!next.has(key))missing.push(event);
 for(const group of [added,changed,missing])group.sort((a,b)=>b.start.localeCompare(a.start));
 return {added,changed,missing,unmatched:[...unmatched].sort((a,b)=>a.localeCompare(b,'zh-CN'))};
}
