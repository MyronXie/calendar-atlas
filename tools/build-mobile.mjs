// Build static read-only web app under mobile/.
//  default (data-full): copy atlas-data files — for local PWA.
//  --data-less         : DO NOT bundle private data; include in-app import (IndexedDB) — for public repo / APK.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {atlasFiles,atlasDataDirectory} from '../atlas-data.mjs';
import {partitionCityBoundaries} from '../city-boundary-data.mjs';
import {palettes} from '../appearance.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'mobile');
const DATA_LESS = process.argv.includes('--data-less');
const rd = (p) => fs.readFile(path.join(root, p), 'utf8');
const staticFiles = [
  'style.css', 'core.js', 'data-formats.js', 'place-categories.js', 'organize.js', 'basemaps.js', 'emoji.js', 'filters.js', 'appearance.js', 'timeline.js', 'annual-review.js',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css', 'vendor/MarkerCluster.Default.css', 'vendor/leaflet-heat.js', 'vendor/ical.min.js',
  'data/world.json', 'data/china.json', 'data/shanghai-landmarks.json',
];

await fs.rm(out, { recursive: true, force: true });
for (const dir of ['data', 'vendor']) await fs.mkdir(path.join(out, dir), { recursive: true });
for (const file of staticFiles) await fs.copyFile(path.join(root, file), path.join(out, file));
const fullBoundaries='data/city-boundaries.json';
const {index,provinces}=partitionCityBoundaries(JSON.parse(await rd(fullBoundaries)));
await fs.copyFile(path.join(root,fullBoundaries),path.join(out,fullBoundaries));
await fs.writeFile(path.join(out,'data/city-index.json'),JSON.stringify(index));
await fs.mkdir(path.join(out,'data/cities'));
for(const [code,part] of provinces)await fs.writeFile(path.join(out,'data/cities',code+'.json'),JSON.stringify(part));

if (!DATA_LESS) {
  const data=atlasDataDirectory(root);
  for(const name of atlasFiles)await fs.copyFile(new URL(name,data),path.join(out,'data',name));
}
await fs.copyFile(path.join(root,'app.js'),path.join(out,'app.js'));
await fs.copyFile(path.join(root,'tools','mobile-data-provider.js'),path.join(out,'data-provider.js'));
await fs.copyFile(path.join(root, 'tools', 'mobile-readonly.js'), path.join(out, 'mobile-readonly.js'));

// index.html: manifest + (data-less) data-provider + read-only shim
let html = await rd('index.html');
const defaultCanvas=palettes.green.canvas;
html = html.replace('<title>日历地图</title>', '<title>日历地图</title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="'+defaultCanvas+'">');
html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-mobile-source="'+(DATA_LESS?'import':'files')+'">');
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module" src="data-provider.js"></script><script type="module" src="app.js"></script>');
html = html.replace('</body>', '<script type="module" src="mobile-readonly.js"></script></body>');
await fs.writeFile(path.join(out, 'index.html'), html);

await fs.writeFile(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: '日历足迹（只读）', short_name: '足迹', start_url: './', display: 'standalone',
  background_color: defaultCanvas, theme_color: defaultCanvas, lang: 'zh-CN', icons: []
}, null, 2));

// service worker
const optionalAssets=[fullBoundaries,'data/world.json','data/shanghai-landmarks.json','vendor/leaflet-heat.js'];
const files = ['index.html', 'app.js', 'data-provider.js', 'mobile-readonly.js', 'manifest.webmanifest', 'data/city-index.json',
  ...staticFiles.filter(file=>!optionalAssets.includes(file))];
if (!DATA_LESS) files.push(...atlasFiles.map(name=>'data/'+name));
const hash=createHash('sha256');
for(const file of [...files,...optionalAssets])hash.update(file+'\0').update(await fs.readFile(path.join(out,file))).update('\0');
const cache='atlas-'+hash.digest('hex').slice(0,16);
const sw = `const CACHE=${JSON.stringify(cache)};const FILES=${JSON.stringify(files)};const OPTIONAL=${JSON.stringify(optionalAssets)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('atlas-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==location.origin)return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(e.request);
    if(cached)return cached;
    try{
      const response=await fetch(e.request);
      const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
      if(response.ok && (OPTIONAL.includes(relative)||relative.startsWith('data/cities/'))){
        await cache.put(e.request,response.clone()).catch(()=>{});
      }
      return response;
    }
    catch(error){if(e.request.mode==='navigate')return await cache.match('index.html')||Response.error();throw error;}
  })());
});`;
await fs.writeFile(path.join(out, 'sw.js'), sw);

await fs.writeFile(path.join(out, 'serve.mjs'), `import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=await fs.realpath(path.dirname(fileURLToPath(import.meta.url)));const port=Number(process.env.PORT)||8790;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.ics':'text/calendar; charset=utf-8','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://x').pathname);
    const file=await fs.realpath(path.join(root,pathname==='/'?'index.html':pathname));
    const relative=path.relative(root,file);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Not found');
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404).end('not found');}
}).listen(port,'0.0.0.0',()=>console.log('mobile: http://localhost:'+port));`);

console.log(JSON.stringify({ out, mode: DATA_LESS ? 'data-less' : 'data-full' }));
