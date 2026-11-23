import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backupText,atomicWrite} from './atomic-file.mjs';
import {parseCalendar} from '../lib/core.js';

export const calendarVersion=text=>'"'+createHash('sha256').update(text).digest('hex')+'"';

export function readCalendarText(file){
 return fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
}

export async function replaceCalendar(file,{version,text},{complete=false}={}){
 if(typeof text!=='string')throw Error('日历内容无效');
 const events=parseCalendar(text);
 const hasStart=event=>Number.isFinite(event.startDate?.toJSDate().getTime());
 if(!events.some(hasStart))throw Error('日历没有有效事件');
 if(complete){
  const content=text.trim();
  const readable=event=>hasStart(event)&&Number.isFinite(event.endDate?.toJSDate().getTime()??0);
  if(!/^BEGIN:VCALENDAR\r?\n/i.test(content)||!/\nEND:VCALENDAR$/i.test(content)
   ||!events.every(event=>readable(event)&&Object.values(event.exceptions).every(readable))){
   throw Error('Outlook 导出的日历不完整或存在无效事件');
  }
 }
 const conflict=()=>Object.assign(Error('本地日历已更改，请重新选择文件并核对'),{status:409});
 const current=await readCalendarText(file);
 if(calendarVersion(current)!==version)throw conflict();
 if(current===text)return false;
 if(current)await backupText(file,current);
 const latest=await readCalendarText(file);
 if(calendarVersion(latest)!==version)throw conflict();
 await atomicWrite(file,text);
 return true;
}
