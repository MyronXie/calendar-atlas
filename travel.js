import {details} from './core.js';
import {eventParts} from './filters.js';

const dayMs=86400000;
const dayOf=date=>Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
const isoDay=day=>new Date(day).toISOString().slice(0,10);
const dayNumber={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};

export function isTrip(event){
 return /之旅(?:\s|$|[（(])/u.test(event.title||'');
}

function heading(line,first,last){
 const label=line.trim().replace(/^行程\s*[:：]\s*/,'').replace(/^【(.+)】$/,'$1').trim();
 const n=/^(?:day\s*(\d+)|第\s*([\d一二三四五六七八九十]+)\s*天)(?:\s|$|[：:])(?:.*)$/i.exec(label);
 if(n){
  const number=Number(n[1]||n[2])||dayNumber[n[2]];
  const day=first+(number-1)*dayMs;
  return number>0&&day<=last?day:null;
 }
 const m=/^(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?(?:\s*(?:[（(]?(?:星期|周)[一二三四五六日天][）)]?)?\s*)$/.exec(label);
 if(!m){
  // A date-like heading we can't place must not inherit the preceding day.
  return /^(?:day\s*\d|第[\d一二三四五六七八九十]+天|\d{1,4}[年/.月-]\d)/i.test(label)?null:undefined;
 }
 const firstYear=new Date(first).getUTCFullYear();
 const lastYear=new Date(last).getUTCFullYear();
 const candidates=[];
 for(let year=m[1]?Number(m[1]):firstYear;year<=(m[1]?Number(m[1]):lastYear);year++){
  const date=Date.UTC(year,Number(m[2])-1,Number(m[3]));
  const value=new Date(date);
  if(date>=first&&date<=last&&value.getUTCMonth()+1===Number(m[2])&&value.getUTCDate()===Number(m[3]))candidates.push(date);
 }
 return candidates.length===1?candidates[0]:null;
}

function dayRange(event){
 const first=dayOf(event.start);
 const last=dayOf(event.end>event.start?new Date(+event.end-1):event.start);
 return [first,last];
}

export function tripDates(event){
 const [first,last]=dayRange(event);
 return {start:isoDay(first),end:isoDay(last)};
}

export function tripPlace(event){
 const {name}=eventParts(event.title);
 return name.replace(/之旅(?:\s|$|[（(]).*$/u,'').trim()||name;
}

const compactTripEnd=(start,end)=>start.slice(0,4)===end.slice(0,4)?end.slice(5):end;

export function tripSelectLabel(event){
 const {start,end}=tripDates(event);
 const last=compactTripEnd(start,end);
 const dates=start.slice(2).replaceAll('-','/')+
  (start===end?'':'-'+(last===end?end.slice(2):last).replaceAll('-','/'));
 return tripPlace(event)+'·'+dates;
}

export function* occurrenceDays(events,from,to,splitTrips,keepOverlappingEvents=false){
 const firstDay=dayOf(from),lastDay=dayOf(to);
 for(const event of events){
  const [first,last]=dayRange(event);
  if(!splitTrips||first===last||!isTrip(event)){
   if(first<=lastDay&&(first>=firstDay||keepOverlappingEvents&&last>=firstDay))yield {day:first,event,places:event.places};
   continue;
  }
  const itinerary=tripDetails(event).days;
  const scheduled=new Map(itinerary.filter(day=>day.number!==null).map(day=>[day.number,day.places]));
  const assigned=new Set([...scheduled.values()].flat());
  const undated=event.places.filter(name=>!assigned.has(name));
  for(let day=Math.max(first,firstDay);day<=Math.min(last,lastDay);day+=dayMs){
   const places=scheduled.get((day-first)/dayMs+1)||[];
   yield {day,event,places:day===first?[...places,...undated]:places};
  }
 }
}

export function occurrenceCounts(rows,namesFor,mergeSameDay){
 const counts=new Map(),seenByName=new Map();
 for(const row of rows){
  for(const name of new Set(namesFor(row))){
   if(mergeSameDay){
    if(!seenByName.has(name))seenByName.set(name,new Set());
    const dates=seenByName.get(name);
    if(dates.has(row.day))continue;
    dates.add(row.day);
   }
   counts.set(name,(counts.get(name)||0)+1);
  }
 }
 return counts;
}

export function tripDateRange(start,end){
 return start===end?start:start+' 至 '+compactTripEnd(start,end);
}

export function tripDetails(event){
 const [first,last]=dayRange(event);
 const start=isoDay(first),end=isoDay(last);
 if(first===last)return {start,end,days:[{label:start,number:1,places:[...(event.places||[])]}]};
 const groups=new Map(),assigned=new Set();
 const allowed=new Set(event.places||[]);
 let day=null;
 const add=(key,place)=>{
  if(!groups.has(key))groups.set(key,[]);
  const names=groups.get(key);
  if(!names.includes(place))names.push(place);
  assigned.add(place);
 };
 for(const line of (event.note||'').split('\n')){
  const next=heading(line,first,last);
  if(next!==undefined){
   day=next;
   if(day!==null&&!groups.has(day))groups.set(day,[]);
   continue;
  }
  if(!/^\s*Place\s*[:：]/i.test(line))continue;
  for(const place of details({description:line}).places)if(allowed.has(place))add(day,place);
 }
 for(const place of event.places||[])if(!assigned.has(place))add(null,place);
 const days=[...groups].filter(([key])=>key!==null).sort(([a],[b])=>a-b)
  .map(([key,places])=>({label:isoDay(key),number:(key-first)/dayMs+1,places}));
 if(groups.has(null))days.push({label:'日期待确认',number:null,places:groups.get(null)});
 return {start,end,days};
}
