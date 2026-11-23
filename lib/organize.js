import {compact} from './place-name.js';
import {validCoord} from './core.js';
export const normalizePlace=compact;
export function isPlaceExcluded(place,rules={}){const p=typeof place==='string'?{location:place}:place||{};const values=[p.location,p.address,...String(p.aliases||'').split(/[;；]/)].filter(Boolean);const active=rules.placeRules||(rules.blacklist?.filter(r=>r.type==='place'));if(active)return active.some(r=>!['0','false','no'].includes(String(r.enabled).toLowerCase())&&r.value&&values.some(value=>r.match_type==='exact'?normalizePlace(value)===normalizePlace(r.value):r.match_type==='contains'?String(value).normalize('NFKC').toLowerCase().includes(String(r.value).normalize('NFKC').toLowerCase()):false));return (rules.placeKeywords||[]).some(k=>k&&values.some(v=>String(v).toLowerCase().includes(String(k).toLowerCase())));}
export function applyRules(events,rules={},enabled=true,explicitPlaceExclusions=new Set()){
 let excludedEvents=0,excludedPlaces=0;
 const match=(s,keys)=>keys.some(k=>k&&String(s).toLowerCase().includes(k.toLowerCase()));
 const result=[];
 for(const e of events){
  let date;
  const hit=(items,value)=>items.some(r=>{
   if(r.enabled==='0'||r.enabled==='false')return false;
   if(r.start_date||r.end_date){
    date??=e.start instanceof Date?e.start.toLocaleDateString('en-CA'):String(e.start||'').slice(0,10);
    if(r.start_date&&date<r.start_date||r.end_date&&date>r.end_date)return false;
   }
   if(r.match_type==='uid')return e.uid===r.value;
   if(r.match_type==='exact')return normalizePlace(value)===normalizePlace(r.value);
   return String(value).toLowerCase().includes(String(r.value).toLowerCase());
  });
  if(enabled&&(rules.eventRules?hit(rules.eventRules,e.title):match(e.title,rules.eventKeywords||[]))){
   excludedEvents++;
   continue;
  }
  const places=e.places.filter(p=>{
   const exclude=(enabled&&(rules.placeRules?hit(rules.placeRules,p):match(p,rules.placeKeywords||[])))||explicitPlaceExclusions.has(normalizePlace(p));
   if(exclude)excludedPlaces++;
   return !exclude;
  });
  if(e.places.length&&!places.length){excludedEvents++;continue;}
  result.push({...e,places});
 }
 return {events:result,excludedEvents,excludedPlaces};
}

export function unlocatedVisits(events,lookup,rules){
 const canonical=events.map(event=>({...event,places:[
  ...new Set(event.places.map(name=>lookup.get(normalizePlace(name))?.location||name)),
 ]}));
 const kept=applyRules(canonical,rules,true).events;
 const missing=new Map();
 for(const event of kept){
  for(const name of event.places){
   const key=normalizePlace(name);
   const row=lookup.get(key);
   if(validCoord(row)||isPlaceExcluded(row||{location:name},rules))continue;
   if(!missing.has(key))missing.set(key,{name,events:new Set()});
   missing.get(key).events.add(event);
  }
 }
 return {kept,missing};
}

