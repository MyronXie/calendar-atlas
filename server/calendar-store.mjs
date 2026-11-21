import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {backupText,atomicWrite} from './atomic-file.mjs';
import {parseCalendar} from '../lib/core.js';

export const calendarVersion=text=>'"'+createHash('sha256').update(text).digest('hex')+'"';

export async function replaceCalendar(file,{version,text}){
 if(typeof text!=='string')throw Error('日历内容无效');
 if(!parseCalendar(text).some(event=>Number.isFinite(event.startDate?.toJSDate().getTime())))throw Error('日历没有有效事件');
 const conflict=()=>Object.assign(Error('本地日历已更改，请重新选择文件并核对'),{status:409});
 const current=await fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 if(calendarVersion(current)!==version)throw conflict();
 if(current===text)return;
 if(current)await backupText(file,current);
 const latest=await fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
 if(calendarVersion(latest)!==version)throw conflict();
 await atomicWrite(file,text);
}
