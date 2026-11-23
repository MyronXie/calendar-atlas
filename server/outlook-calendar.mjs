import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {calendarVersion,readCalendarText,replaceCalendar} from './calendar-store.mjs';

const run=promisify(execFile);
const script=fileURLToPath(new URL('../tools/export-outlook-calendar.ps1',import.meta.url));

async function exportCalendar(outputPath){
 if(process.platform!=='win32')throw Object.assign(Error('Outlook 同步需要 Windows 经典版 Outlook'),{status:501});
 const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 try{
  await run(powershell,['-NoLogo','-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',script,
   '-OutputPath',outputPath],{windowsHide:true,timeout:300_000});
 }catch(error){
  if(error.killed)throw Object.assign(Error('Outlook 导出超时，请检查 Outlook 是否正在等待登录或确认'),{status:504});
  if(error.code===2)throw Error('无法连接经典版 Outlook，请打开客户端并确认已登录');
  throw Error('Outlook 无法导出默认日历，请确认经典版客户端可以打开该日历');
 }
}

export async function syncOutlookCalendar(file,enqueueWrite,exporter=exportCalendar){
 const version=calendarVersion(await readCalendarText(file));
 const directory=path.dirname(path.resolve(file));
 await fs.mkdir(directory,{recursive:true});
 const candidate=path.join(directory,'.outlook-'+randomUUID()+'.ics');
 try{
  await exporter(candidate);
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(candidate));}
  catch{throw Error('Outlook 没有生成可读取的 UTF-8 日历文件');}
  try{
   return await enqueueWrite(()=>replaceCalendar(file,{version,text},{complete:true}));
  }catch(error){
   if(error.status===409)throw Object.assign(Error('同步时本地日历发生了更改，请重新同步'),{status:409});
   throw error;
  }
 }finally{
  await fs.unlink(candidate).catch(()=>{});
 }
}
