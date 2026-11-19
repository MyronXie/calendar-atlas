import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const reservation=net.createServer();
reservation.listen(0,'127.0.0.1');
await once(reservation,'listening');
const port=reservation.address().port;
await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-http-test-'));
const places=path.join(dir,'synthetic-places.csv');
await fs.writeFile(places,'location,lat,lon\r\n');
const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{
 env:{...process.env,PORT:String(port),PLACES_PATH:places,CALENDAR_PATH:fileURLToPath(new URL('./fixture.ics',import.meta.url))},
 stdio:['ignore','ignore','pipe'],
});
const stopped=once(child,'exit');
let stderr='';
child.stderr.setEncoding('utf8').on('data',chunk=>{stderr+=chunk;});
const base='http://127.0.0.1:'+port;
const request=(route,init)=>fetch(base+route,{signal:AbortSignal.timeout(1500),...init});
const read=async()=>{
 const response=await request('/api/places');
 assert.equal(response.status,200);
 return response.json();
};
try{
 let ready=false;
 for(let i=0;i<60&&child.exitCode===null&&!ready;i++){
  const data=await request('/api/health').then(r=>r.json()).catch(()=>null);
  ready=data?.pid===child.pid&&data.app==='calendar-atlas';
  if(!ready)await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.ok(ready,stderr||'Synthetic HTTP service did not start');
 const initial=await read();
 assert.equal(initial.file,'synthetic-places.csv');
 assert.deepEqual(initial.places,[]);
 const updates=[{location:'Synthetic place',lat:'31.2',lon:'121.4',datum:'wgs84',address:'Test address'}];
 const headers={'Content-Type':'application/json','X-Atlas-Write':'1',Origin:base};
 const save=(version,extra={})=>request('/api/places',{method:'POST',headers:{...headers,...extra},body:JSON.stringify({version,updates})});
 assert.equal((await save(initial.version)).status,200);
 assert.equal((await read()).places.length,1);
 assert.equal((await save(initial.version)).status,409);
 assert.equal((await save(initial.version,{Origin:'https://example.com'})).status,403);
 for(const route of ['/','/app.js','/basemaps.js','/core.js','/organize.js','/vendor/leaflet.js','/style.css','/api/calendar']){
  const response=await request(route);
  assert.equal(response.status,200,route);
  await response.arrayBuffer();
 }
 assert.equal((await request('/tools/place-sync.mjs')).status,404);
 const [index,part]=await Promise.all(['/data/city-index.json','/data/cities/31.json']
  .map(route=>request(route).then(response=>response.json())));
 assert.ok(index.length>300&&index.every(city=>!Object.hasOwn(city,'geometry')));
 assert.ok(part.features.length&&part.features.every(f=>f.properties.province==='上海市'));
 assert.equal((await request('/data/cities/99.json')).status,404);
 console.log('Synthetic HTTP read/write, conflict handling, origin check and static routes passed');
}finally{
 if(child.exitCode===null)child.kill();
 await stopped;
}
