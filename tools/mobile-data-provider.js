import {parseCalendar} from './core.js';
import {parseAtlasConfig,parseMobilePlaces} from './data-formats.js';

const importing=document.documentElement.dataset.mobileSource==='import';
document.documentElement.dataset.mobile='1';
const originalFetch=window.fetch.bind(window);
const base=new URL('.',location.href);
const names=['place.csv','calendar.ics','config.json'];
const storedNames=[...names,'place.json'];
let dbRequest,storedData;
const getStoredData=()=>storedData??=readFiles();
const jsonResponse=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});

function openDB(){
 if(!dbRequest){
  dbRequest=new Promise((resolve,reject)=>{
   const request=indexedDB.open('atlas-data',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('files');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  }).catch(error=>{dbRequest=null;throw error;});
 }
 return dbRequest;
}
async function readFiles(){
 const db=await openDB();
 const store=db.transaction('files','readonly').objectStore('files');
 const entries=await Promise.all(storedNames.map(name=>new Promise((resolve,reject)=>{
  const request=store.get(name);
  request.onsuccess=()=>resolve([name,request.result??null]);
  request.onerror=()=>reject(request.error);
 })));
 return Object.fromEntries(entries);
}
async function writeFiles(files){
 const db=await openDB();
 await new Promise((resolve,reject)=>{
  const transaction=db.transaction('files','readwrite');
  transaction.oncomplete=()=>resolve();
  transaction.onabort=()=>reject(transaction.error||Error('文件写入失败'));
  const store=transaction.objectStore('files');
  for(const [name,text] of Object.entries(files))store.put(text,name);
  if(Object.hasOwn(files,'place.csv'))store.delete('place.json');
  if(Object.hasOwn(files,'place.json'))store.delete('place.csv');
 });
}
const placeFilename=files=>files['place.csv']!==null?'place.csv':'place.json';
const ready=files=>Boolean(files[placeFilename(files)]&&files['calendar.ics']&&files['config.json']);
function validateFiles(files){
 if(!ready(files))throw Error('首次导入请选择地点、日历和配置三个文件');
 const place=placeFilename(files);
 parseMobilePlaces(place,files[place]);
 parseAtlasConfig(files['config.json']);
 const events=parseCalendar(files['calendar.ics']);
 if(!events.some(event=>Number.isFinite(event.startDate?.toJSDate().getTime())))throw Error('日历没有有效事件');
}

const routes=new Map(['places','calendar','config'].map(name=>[new URL('api/'+name,base).href,name]));
window.fetch=async (input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);
 const route=routes.get(url.href);
 if(!route)return originalFetch(input,init);
 if((init?.method||input?.method||'GET').toUpperCase()!=='GET')return new Response(null,{status:405});
 try{
  let files;
  if(importing)files=await getStoredData();
  else{
   const name={places:'place.csv',calendar:'calendar.ics',config:'config.json'}[route];
   const response=await originalFetch(new URL('data/'+name,base),init);
   if(!response.ok)return response;
   files={[name]:await response.text()};
  }
  if(route==='calendar'){
   const text=files['calendar.ics'];
   return text===null?new Response(null,{status:404}):new Response(text,{headers:{'Content-Type':'text/calendar; charset=utf-8'}});
  }
  if(route==='places'){
   const name=files['place.csv']!=null?'place.csv':'place.json',text=files[name];
   return text==null?new Response(null,{status:404}):jsonResponse(parseMobilePlaces(name,text));
  }
  const text=files['config.json'];
  return text===null?new Response(null,{status:404}):jsonResponse({...parseAtlasConfig(text),version:'mobile'});
 }catch(error){
  return jsonResponse({error:error.message},400);
 }
};

function showImport(){
 if(document.getElementById('atlas-import-card'))return;
 const wrap=document.createElement('div');
 wrap.id='atlas-import-card';
 wrap.style.cssText='position:fixed;inset:0;background:#0008;z-index:99999;display:grid;place-items:center;padding:16px';
 wrap.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="atlas-import-title" style="background:#fff;max-width:430px;width:100%;box-sizing:border-box;border-radius:12px;padding:18px;color:#222">'
  +'<h2 id="atlas-import-title" style="margin:0 0 6px">导入 / 更新数据</h2>'
  +'<p>首次导入请选择 atlas-data 中的三个文件。以后只需选择要更新的文件。</p>'
  +'<label>地点 place.csv<input id="imp-place" type="file" accept=".csv,text/csv,.json,application/json"></label>'
  +'<label>日历 calendar.ics<input id="imp-ics" type="file" accept=".ics,text/calendar"></label>'
  +'<label>配置 config.json<input id="imp-config" type="file" accept=".json,application/json"></label>'
  +'<div style="display:flex;gap:8px;margin-top:12px"><button id="imp-go" type="button">导入并进入</button><button id="imp-close" type="button">关闭</button></div>'
  +'<div id="imp-msg" role="status" style="color:#9a470c;margin-top:8px"></div></section>';
 document.body.append(wrap);
 const button=document.getElementById('imp-go'),close=document.getElementById('imp-close'),status=document.getElementById('imp-msg');
 close.onclick=()=>wrap.remove();
 button.onclick=async()=>{
  const [place,calendar,config]=['imp-place','imp-ics','imp-config'].map(id=>document.getElementById(id).files[0]);
  if(!place&&!calendar&&!config){status.textContent='请选择要导入的文件';return;}
  button.disabled=close.disabled=true;
  status.textContent='导入中…';
  try{
   const current=await readFiles(),updates={};
   if(place){
    const filename=/\.json$/i.test(place.name)?'place.json':'place.csv';
    updates[filename]=await place.text();
    current[filename==='place.csv'?'place.json':'place.csv']=null;
   }
   if(calendar)updates['calendar.ics']=await calendar.text();
   if(config)updates['config.json']=await config.text();
   validateFiles({...current,...updates});
   await writeFiles(updates);
   location.reload();
  }catch(error){
   status.textContent='导入失败：'+error.message;
   button.disabled=close.disabled=false;
  }
 };
}
if(importing){
 const button=document.createElement('button');
 button.id='atlas-import-btn';
 button.textContent='导入/更新数据';
 button.style.cssText='position:fixed;right:12px;bottom:12px;z-index:9999;border-radius:20px;background:#2563eb;color:#fff';
 button.onclick=showImport;
 document.body.append(button);
 getStoredData().then(files=>{if(!ready(files))showImport();}).catch(showImport);
}
