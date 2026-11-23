import {atlasDataDirectory} from './atlas-data.mjs';
import {readConfig,saveConfig} from './config-store.mjs';
import {calendarVersion,replaceCalendar} from './calendar-store.mjs';
import {syncOutlookCalendar} from './outlook-calendar.mjs';
import {partitionCityBoundaries} from '../lib/city-boundary-data.mjs';
import {tileOrigins} from '../lib/basemaps.js';
import {stampAppVersion} from './app-version.mjs';
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {readPlaces,updatePlaces} from './csv-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.PORT)||8787;
const dataDir=fileURLToPath(atlasDataDirectory(root));const calendar=process.env.CALENDAR_PATH||path.join(dataDir,'calendar.ics');const placeFile=process.env.PLACES_PATH||path.join(dataDir,'place.csv');let writeQueue=Promise.resolve();
let outlookSyncPending=false;
function enqueueWrite(work){
 const result=writeQueue.then(work);
 writeQueue=result.catch(()=>{});
 return result;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
let cityMapRequest;
function cityMapData(){
 cityMapRequest??=fs.readFile(path.join(root,'data','city-boundaries.json'),'utf8')
  .then(raw=>partitionCityBoundaries(JSON.parse(raw)))
  .catch(error=>{cityMapRequest=null;throw error;});
 return cityMapRequest;
}
const originAllowed=s=>['http://127.0.0.1:'+port,'http://localhost:'+port].includes(s);
const writeAllowed=req=>req.method==='POST'&&originAllowed(req.headers.origin)&&req.headers['x-atlas-write']==='1';
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: "+tileOrigins.join(' ')+"; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||(req.headers.origin&&!originAllowed(req.headers.origin))){res.writeHead(403).end();return;}
const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));};
try{const url=new URL(req.url,'http://localhost');
if((url.pathname==='/'||url.pathname==='/index.html')&&(req.method==='GET'||req.method==='HEAD')){
 const html=await fs.readFile(path.join(root,'index.html'),'utf8');
 res.setHeader('Content-Type',types['.html']);
 return res.end(await stampAppVersion(html,root));
}
if(url.pathname==='/api/calendar/outlook-sync'){
 if(!writeAllowed(req))return json(403,{error:'不允许的写入来源'});
 if(outlookSyncPending)return json(409,{error:'Outlook 日历正在同步中'});
 outlookSyncPending=true;
 try{
  const changed=await syncOutlookCalendar(calendar,enqueueWrite);
  return json(200,{changed});
 }finally{outlookSyncPending=false;}
}
if(url.pathname==='/api/health'&&req.method==='GET')return json(200,{app:'calendar-atlas',pid:process.pid});if(url.pathname==='/api/meta'&&req.method==='GET'){const cs=await fs.stat(calendar).catch(()=>null),ps=await fs.stat(placeFile).catch(()=>null),bs=await fs.stat(path.join(dataDir,'config.json')).catch(()=>null);return json(200,{calendar:cs?cs.mtime.toISOString():null,places:ps?ps.mtime.toISOString():null,blacklist:bs?bs.mtime.toISOString():null});}if(['/api/places','/api/config'].includes(url.pathname)||url.pathname==='/api/calendar'&&req.method!=='GET'){if(req.method==='GET'){const data=url.pathname==='/api/config'?await readConfig(dataDir):await readPlaces(placeFile);return json(200,{...data,file:path.basename(placeFile)});}if(!writeAllowed(req)||!req.headers['content-type']?.startsWith('application/json'))return json(403,{error:'不允许的写入来源'});let body='',size=0;for await(const b of req){size+=b.length;if(size>(url.pathname==='/api/calendar'?25e6:2e6)){json(413,{error:'请求过大'});return;}body+=b;}let input;try{input=JSON.parse(body);}catch{return json(400,{error:'JSON 无效'});}const data=await enqueueWrite(async()=>{
 if(url.pathname==='/api/calendar'){await replaceCalendar(calendar,input);return {saved:true};}
 return url.pathname==='/api/config'?saveConfig(dataDir,input):updatePlaces(placeFile,input.version,input.updates);
});return json(200,{...data,file:path.basename(placeFile)});}
if(req.method!=='GET'){res.writeHead(405).end();return;}
const provincePath=url.pathname.match(/^\/data\/cities\/(\d{2})\.json$/);
if(url.pathname==='/data/city-index.json'||provincePath){
 const {index,provinces}=await cityMapData();
 const result=provincePath?provinces.get(provincePath[1]):index;
 return result?json(200,result):json(404,{error:'城市边界不存在'});
}
let file;if(url.pathname==='/api/calendar'){const text=await fs.readFile(calendar,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
res.setHeader('ETag',calendarVersion(text??''));
if(text===null)return json(404,{error:'本地日历不存在'});
res.setHeader('Content-Type','text/calendar; charset=utf-8');
const stat=await fs.stat(calendar).catch(()=>null);
if(stat)res.setHeader('Last-Modified',stat.mtime.toUTCString());
return res.end(text);}else{const name=decodeURIComponent(url.pathname);if(!/^\/(app\.js|style\.css|lib\/[a-z0-9-]+\.js|vendor\/(ical\.min\.js|leaflet\.js|leaflet\.css|leaflet\.markercluster\.js|MarkerCluster\.css|MarkerCluster\.Default\.css|leaflet-heat\.js)|assets\/icons\/(favicon-32|apple-touch-icon)\.png|data\/(world|china|city-boundaries|shanghai-landmarks)\.json)$/.test(name)){res.writeHead(404).end();return;}file=path.join(root,name);res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');}res.end(await fs.readFile(file));}catch(e){json(e.status||400,{error:e.code==='ENOENT'?'本地文件不存在':e.message||'本地操作失败'});}});
server.listen(port,'127.0.0.1',()=>console.log('Calendar Atlas: http://127.0.0.1:'+port));
