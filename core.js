import ICAL from './vendor/ical.min.js';
export function parseCalendar(text){const root=new ICAL.Component(ICAL.parse(text));for(const z of root.getAllSubcomponents('vtimezone')){const zone=new ICAL.Timezone(z);ICAL.TimezoneService.register(zone.tzid,zone);}const groups=new Map();for(const c of root.getAllSubcomponents('vevent')){const e=new ICAL.Event(c);const uid=e.uid||crypto.randomUUID();if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(e);}const result=[];for(const list of groups.values()){const main=list.find(e=>!e.isRecurrenceException());if(main){for(const ex of list.filter(e=>e.isRecurrenceException()))main.relateException(ex);result.push(main);}else result.push(...list);}return result;}
export function details(event){
const desc=String(event.description||'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/\r\n?/g,'\n');
const unique=xs=>[...new Set(xs.map(s=>s.trim()).filter(Boolean))];
const withoutParentheses=(text,standaloneOnly=false)=>{let out='';for(let i=0;i<text.length;i++){if(text[i]!=='('&&text[i]!=='（'){out+=text[i];continue;}const start=i;let depth=1,j=i+1;for(;j<text.length&&depth;j++){if(text[j]==='('||text[j]==='（')depth++;else if(text[j]===')'||text[j]==='）')depth--;}if(depth){out+=text.slice(i);break;}const standalone=(start===0||/\s/.test(text[start-1]))&&(j===text.length||/\s/.test(text[j]));if(standaloneOnly&&!standalone)out+=text.slice(start,j);i=j-1;}return out;};
const clean=t=>t.trim();const isNoise=t=>/^(?:&|＆|\.{2,}|…+|等|等(?:几|数|若干|[一二三四五六七八九十百两0-9]+)?(?:人|位)|Day\s*\d+|第[一二三四五六七八九十0-9]+天|(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{1,2}[-/.]\d{1,2}[:：]?)$/i.test(t)||/^[\p{P}]+$/u.test(t);
const split=(text,person)=>{text=withoutParentheses(text,!person).replace(/\.{3,}|…+/g,' ').replace(/等(?:几|数|若干|[一二三四五六七八九十百两0-9]+)?(?:人|位)/g,' ');const result=[];let token='',depth=0,quote=null;const Q={'"':'"','“':'”','「':'」','『':'』'};for(let i=0;i<text.length;i++){const c=text[i];if(quote){if(c===quote)quote=null;else token+=c;continue;}if(Q[c]){quote=Q[c];continue;}if(c==='('||c==='（')depth++;else if(c===')'||c==='）')depth=Math.max(0,depth-1);const separator=depth===0&&(/[,，;；、|&＆]/.test(c)||(/\s/.test(c)&&(person||/[\u3400-\u9fff]/.test(token)||/[\u3400-\u9fff]/.test(text.slice(i+1).trimStart()[0]||''))));if(separator){if(clean(token)&&!isNoise(clean(token)))result.push(clean(token));token='';}else token+=c;}if(clean(token)&&!isNoise(clean(token)))result.push(clean(token));return result;};
const partners=[],places=[String(event.location||'').trim()];for(const line of desc.split('\n')){if(/[【】]/.test(line))continue;const m=line.match(/^\s*(Partner|Place)\s*[:：]\s*(.*)$/i);if(!m)continue;if(m[1].toLowerCase()==='partner')partners.push(...split(m[2],true));else places.push(...split(m[2],false));}
return {title:event.summary||'未命名事件',note:desc,partners:unique(partners),places:unique(places)};}
const expansionMetadata=new WeakMap();
function metadata(event){
 let info=expansionMetadata.get(event);
 if(!info){
  info={
   uid:event.uid,recurring:event.isRecurring(),
   cancelled:String(event.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED'
  };
  expansionMetadata.set(event,info);
 }
 return info;
}

export function expand(events,from,to,recurring=true){
 const out=[];
 let capped=false,errors=0;
 for(const event of events){
  try{
   const info=metadata(event);
   if(info.cancelled)continue;
   const add=(start,end,item)=>{
    if(start>to||!(end>start?end>from:start>=from))return;
    const entry=metadata(item);
    entry.details??=details(item);
    out.push({...entry.details,places:[...entry.details.places],partners:[...entry.details.partners],
     start:new Date(start),end:new Date(end),uid:info.uid,recurring:info.recurring});
   };
   if(!info.recurring||!recurring){
    if(!info.start){
     const start=event.startDate.toJSDate();
     const end=event.endDate?.toJSDate()||start;
     Object.assign(info,{start,end});
    }
    add(info.start,info.end,event);
    continue;
   }
   const iterator=event.iterator();
   let attempts=0;
   while(attempts++<100000){
    const next=iterator.next();
    if(!next||next.toJSDate()>to)break;
    const occurrence=event.getOccurrenceDetails(next);
    if(metadata(occurrence.item).cancelled)continue;
    const start=occurrence.startDate.toJSDate();
    add(start,occurrence.endDate?.toJSDate()||start,occurrence.item);
   }
   if(attempts>=100000)capped=true;
  }catch{errors++;}
 }
 return {events:out.sort((a,b)=>b.start-a.start),capped,errors};
}
export const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function validCoord(p){return p&&p.lat!==''&&p.lon!==''&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180;}
