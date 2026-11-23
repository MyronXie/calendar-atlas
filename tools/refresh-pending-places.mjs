import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {atlasDataDirectory} from '../server/atlas-data.mjs';
import {parseCSV,stringifyCSV} from '../server/csv-store.mjs';
import {parseCalendar,details} from '../lib/core.js';
import {readConfig} from '../server/config-store.mjs';
import {normalizePlace,unlocatedVisits} from '../lib/organize.js';
import {placeIndex} from '../lib/place-categories.js';

const data=atlasDataDirectory();
const db=parseCSV(await fs.readFile(new URL('place.csv',data),'utf8'));
const cfg=await readConfig(fileURLToPath(data));
const source=parseCalendar(await fs.readFile(new URL('calendar.ics',data),'utf8'));
const events=source.flatMap(event=>[event,...Object.values(event.exceptions)])
 .filter(event=>String(event.component.getFirstPropertyValue('status')).toUpperCase()!=='CANCELLED')
 .map(event=>({...details(event),uid:event.uid,start:event.startDate?.toJSDate()||new Date(0)}));
const lookup=placeIndex(db.places,normalizePlace);
const {kept,missing}=unlocatedVisits(events,lookup,cfg);
const rows=[...missing.values()].map(({name})=>name).sort((a,b)=>a.localeCompare(b,'zh-CN'))
 .map(location=>Object.fromEntries(db.headers.map(header=>[header,header==='location'?location:''])));
const target=new URL('待补坐标_place.csv',data);
await fs.mkdir(new URL('.backups/',data),{recursive:true});
try{
 await fs.copyFile(target,new URL('.backups/待补坐标_place.'+Date.now()+'.csv',data));
}catch(error){
 if(error.code!=='ENOENT')throw error;
}
await fs.writeFile(target,stringifyCSV({headers:db.headers,places:rows}));
if(parseCSV(await fs.readFile(target,'utf8')).places.length!==rows.length)throw Error('CSV 验证失败');
console.log(JSON.stringify({
 sourceEventGroups:source.length,eventsAfterBlacklist:kept.length,pendingCoordinatePlaces:rows.length,
 columns:db.headers,previousCSVBackedUp:true,
}));
