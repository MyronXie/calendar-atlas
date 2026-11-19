import {atlasDataDirectory} from './atlas-data.mjs';
import {readConfig,saveConfig} from './config-store.mjs';
import {partitionCityBoundaries} from './city-boundary-data.mjs';
import {tileOrigins} from './basemaps.js';
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {readPlaces,updatePlaces} from './csv-store.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT)||8787;
const dataDir=fileURLToPath(atlasDataDirectory(root));const calendar=process.env.CALENDAR_PATH||path.join(dataDir,'calendar.ics');const placeFile=process.env.PLACES_PATH||path.join(dataDir,'place.csv');let writeQueue=Promise.resolve();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
let cityMapRequest;
function cityMapData(){
 cityMapRequest??=fs.readFile(path.join(root,'data','city-boundaries.json'),'utf8')
  .then(raw=>partitionCityBoundaries(JSON.parse(raw)))
  .catch(error=>{cityMapRequest=null;throw error;});
 return cityMapRequest;
}
const originAllowed=s=>['http://127.0.0.1:'+port,'http://localhost:'+port].includes(s);
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: "+tileOrigins.join(' ')+"; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||(req.headers.origin&&!originAllowed(req.headers.origin))){res.writeHead(403).end();return;}
const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(data));};
try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/health'&&req.method==='GET')return json(200,{app:'calendar-atlas',pid:process.pid});if(url.pathname==='/api/meta'&&req.method==='GET'){const cs=await fs.stat(calendar).catch(()=>null),ps=await fs.stat(placeFile).catch(()=>null),bs=await fs.stat(path.join(dataDir,'config.json')).catch(()=>null);return json(200,{calendar:cs?cs.mtime.toISOString():null,places:ps?ps.mtime.toISOString():null,blacklist:bs?bs.mtime.toISOString():null});}if(['/api/places','/api/config'].includes(url.pathname)){if(req.method==='GET'){const data=url.pathname==='/api/config'?await readConfig(dataDir):await readPlaces(placeFile);return json(200,{...data,file:path.basename(placeFile)});}if(req.method!=='POST'||!originAllowed(req.headers.origin)||req.headers['x-atlas-write']!=='1'||!req.headers['content-type']?.startsWith('application/json'))return json(403,{error:'不允许的写入来源'});let body='',size=0;for await(const b of req){size+=b.length;if(size>2e6){json(413,{error:'请求过大'});return;}body+=b;}let input;try{input=JSON.parse(body);}catch{return json(400,{error:'JSON 无效'});}const op=writeQueue.then(()=>url.pathname==='/api/config'?saveConfig(dataDir,input):updatePlaces(placeFile,input.version,input.updates));writeQueue=op.catch(()=>{});const data=await op;return json(200,{...data,file:path.basename(placeFile)});}
if(req.method!=='GET'){res.writeHead(405).end();return;}
const provincePath=url.pathname.match(/^\/data\/cities\/(\d{2})\.json$/);
if(url.pathname==='/data/city-index.json'||provincePath){
 const {index,provinces}=await cityMapData();
 const result=provincePath?provinces.get(provincePath[1]):index;
 return result?json(200,result):json(404,{error:'城市边界不存在'});
}
let file;if(url.pathname==='/api/calendar'){file=calendar;res.setHeader('Content-Type','text/calendar; charset=utf-8');const _st=await fs.stat(file).catch(()=>null);if(_st)res.setHeader('Last-Modified',_st.mtime.toUTCString());}else{const name=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);if(!/^\/(index\.html|app\.js|core\.js|style\.css|vendor\/(ical\.min\.js|leaflet\.js|leaflet\.css|leaflet\.markercluster\.js|MarkerCluster\.css|MarkerCluster\.Default\.css|leaflet-heat\.js)|organize\.js|basemaps\.js|emoji\.js|filters\.js|appearance\.js|annual-review\.js|timeline\.js|place-categories\.js|data\/(world|china|city-boundaries|shanghai-landmarks)\.json)$/.test(name)){res.writeHead(404).end();return;}file=path.join(root,name);res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');}res.end(await fs.readFile(file));}catch(e){json(e.status||400,{error:e.code==='ENOENT'?'本地文件不存在':e.message||'本地操作失败'});}});
server.listen(port,'127.0.0.1',()=>console.log('Calendar Atlas: http://127.0.0.1:'+port));
