import {parseCalendar} from './core.js';
import {parseAtlasConfig,parseCSV} from './data-formats.js';

const importing=document.documentElement.dataset.mobileSource==='import';
document.documentElement.dataset.mobile='1';
const originalFetch=window.fetch.bind(window);
const base=new URL('.',location.href);
const sources={
 places:{name:'place.csv',label:'地点',accept:'.csv,text/csv',parse:parseCSV},
 calendar:{name:'calendar.ics',label:'日历',accept:'.ics,text/calendar',parse:validateCalendar},
 config:{name:'config.json',label:'配置',accept:'.json,application/json',parse:parseAtlasConfig},
};
const names=Object.values(sources).map(source=>source.name);
const dateKey=name=>'updatedAt:'+name;
let dbRequest,storedData;
const getStoredData=()=>storedData??=readFiles().catch(error=>{storedData=null;throw error;});
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
 const entries=await Promise.all([...names,...names.map(dateKey)].map(name=>new Promise((resolve,reject)=>{
  const request=store.get(name);
  request.onsuccess=()=>resolve([name,request.result??null]);
  request.onerror=()=>reject(request.error);
 })));
 return Object.fromEntries(entries);
}
async function writeFiles(files){
 for(const source of Object.values(sources)){
  if(Object.hasOwn(files,source.name))source.parse(files[source.name]);
 }
 const db=await openDB();
 const savedAt=new Date().toISOString();
 await new Promise((resolve,reject)=>{
  const transaction=db.transaction('files','readwrite');
  transaction.oncomplete=()=>resolve();
  transaction.onabort=()=>reject(transaction.error||Error('文件写入失败'));
  const store=transaction.objectStore('files');
  for(const [name,text] of Object.entries(files)){
   store.put(text,name);
   store.put(savedAt,dateKey(name));
  }
 });
 storedData=null;
}
function validateCalendar(text){
 const events=parseCalendar(text);
 if(!events.some(event=>Number.isFinite(event.startDate?.toJSDate().getTime())))throw Error('日历没有有效事件');
}

const routes=new Map([...Object.keys(sources),'meta'].map(name=>[new URL('api/'+name,base).href,name]));
window.fetch=async (input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,base);
 const route=routes.get(url.href);
 if(!route)return originalFetch(input,init);
 const method=(init?.method||input?.method||'GET').toUpperCase();
 try{
  if(route==='meta'){
   if(!importing||method!=='GET')return new Response(null,{status:404});
   const files=await getStoredData();
   return jsonResponse({
    calendar:files[dateKey(sources.calendar.name)],
    places:files[dateKey(sources.places.name)],
    blacklist:files[dateKey(sources.config.name)],
   });
  }
  const {name,parse}=sources[route];
  if(importing&&method==='PUT'){
   const text=await new Request(input instanceof Request?input:url,init).text();
   await writeFiles({[name]:text});
   return new Response(null,{status:204});
  }
  if(method!=='GET')return new Response(null,{status:405});
  let text;
  if(importing)text=(await getStoredData())[name];
  else{
   const response=await originalFetch(new URL('data/'+name,base),init);
   if(!response.ok)return response;
   text=await response.text();
  }
  if(text==null)return new Response(null,{status:404});
  if(route==='calendar')return new Response(text,{headers:{'Content-Type':'text/calendar; charset=utf-8'}});
  return jsonResponse({...parse(text),file:name,version:'mobile'});
 }catch(error){
  return jsonResponse({error:error.message},400);
 }
};

function showImport(files={}){
 const missing=Object.values(sources).filter(({name})=>!files[name]);
 if(!missing.length)return;
 const dialog=document.createElement('dialog');
 dialog.id='atlas-import-card';
 dialog.setAttribute('aria-labelledby','atlas-import-title');
 dialog.innerHTML='<form><h2 id="atlas-import-title">导入数据</h2>'
  +'<p>请选择 atlas-data 中缺少的文件。之后可在「设置 → 偏好」里逐项更新。</p>'
  +missing.map(({name,label,accept})=>'<label>'+label+' '+name+'<input name="'+name+'" type="file" accept="'+accept+'" required></label>').join('')
  +'<p id="imp-msg" role="status"></p><div class="quick"><button id="imp-close" type="button">稍后</button>'
  +'<button id="imp-go" class="primary" type="submit">导入并进入</button></div></form>';
 document.body.append(dialog);
 dialog.showModal();
 const form=dialog.querySelector('form'),button=dialog.querySelector('#imp-go');
 const close=dialog.querySelector('#imp-close'),status=dialog.querySelector('#imp-msg');
 dialog.onclose=()=>dialog.remove();
 dialog.oncancel=event=>{if(button.disabled)event.preventDefault();};
 close.onclick=()=>dialog.close();
 form.onsubmit=async event=>{
  event.preventDefault();
  button.disabled=close.disabled=true;
  status.textContent='正在导入…';
  try{
   const updates=await Promise.all(missing.map(async ({name})=>[name,await form.elements.namedItem(name).files[0].text()]));
   await writeFiles(Object.fromEntries(updates));
   location.reload();
  }catch(error){
   status.textContent='导入失败：'+error.message;
   button.disabled=close.disabled=false;
  }
 };
}
if(importing)getStoredData().then(showImport,()=>showImport());
