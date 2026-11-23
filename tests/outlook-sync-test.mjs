import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {syncOutlookCalendar} from '../server/outlook-calendar.mjs';

const directory=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-outlook-test-'));
const file=path.join(directory,'calendar.ics');
const fixtures=new URL('./fixtures/',import.meta.url);
const original=await fs.readFile(new URL('fixture.ics',fixtures),'utf8');
const updated=original.replace('SUMMARY:Test','SUMMARY:Outlook fixture');
const direct=operation=>operation();
const exportText=text=>target=>fs.writeFile(target,text);
const backupDir=path.join(directory,'.backups');

try{
 await fs.writeFile(file,original);
 assert.equal(await syncOutlookCalendar(file,direct,exportText(updated)),true);
 assert.equal(await fs.readFile(file,'utf8'),updated);
 const [backup]=await fs.readdir(backupDir);
 assert.equal(await fs.readFile(path.join(backupDir,backup),'utf8'),original);
 assert.equal(await syncOutlookCalendar(file,direct,exportText(updated)),false);
 assert.deepEqual(await fs.readdir(backupDir),[backup]);

 const malformed=updated.replace('END:VCALENDAR',[
  'BEGIN:VEVENT','UID:invalid-start','SUMMARY:Missing date','END:VEVENT','END:VCALENDAR',
 ].join('\r\n'));
 await assert.rejects(syncOutlookCalendar(file,direct,exportText(malformed)),/不完整或存在无效事件/);
 await assert.rejects(syncOutlookCalendar(file,direct,exportText('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR')),/没有有效事件/);
 await assert.rejects(syncOutlookCalendar(file,direct,exportText(Buffer.from([0xff]))),/UTF-8/);
 await assert.rejects(syncOutlookCalendar(file,direct,async target=>{
  await fs.writeFile(target,'incomplete export');
  throw Error('Synthetic Outlook failure');
 }),/Synthetic Outlook failure/);
 assert.equal(await fs.readFile(file,'utf8'),updated);
 assert.deepEqual(await fs.readdir(backupDir),[backup]);

 await assert.rejects(syncOutlookCalendar(file,direct,async target=>{
  await fs.writeFile(target,updated);
  await fs.writeFile(file,original);
 }),{status:409});
 assert.equal(await fs.readFile(file,'utf8'),original);
 assert.deepEqual((await fs.readdir(directory)).sort(),['.backups','calendar.ics']);

 await fs.unlink(file);
 assert.equal(await syncOutlookCalendar(file,direct,exportText(original)),true);
 assert.equal(await fs.readFile(file,'utf8'),original);
 assert.deepEqual(await fs.readdir(backupDir),[backup]);
}finally{
 const targets=await fs.readdir(backupDir).catch(()=>[]);
 await Promise.all(targets.map(name=>fs.unlink(path.join(backupDir,name))));
 if(targets.length)await fs.rmdir(backupDir);
 await fs.unlink(file).catch(()=>{});
 await fs.rmdir(directory);
}
