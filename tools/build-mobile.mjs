// Build static read-only web app under mobile/.
//  default (data-full): copy atlas-data files — for local PWA.
//  --data-less         : DO NOT bundle private data; include in-app import (IndexedDB) — for public repo / PWA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {atlasFiles,atlasDataDirectory} from '../server/atlas-data.mjs';
import {partitionCityBoundaries} from '../lib/city-boundary-data.mjs';
import {palettes} from '../lib/appearance.js';
import {stampAppVersion} from '../server/app-version.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'mobile');
const DATA_LESS = process.argv.includes('--data-less');
const rd = (p) => fs.readFile(path.join(root, p), 'utf8');
const appIcons = [
  {src:'assets/icons/icon-192.png', sizes:'192x192', type:'image/png', purpose:'any'},
  {src:'assets/icons/icon-512.png', sizes:'512x512', type:'image/png', purpose:'any maskable'},
];
const staticFiles = [
  'style.css', 'lib/core.js', 'lib/data-formats.js', 'lib/place-name.js', 'lib/geo.js', 'lib/place-categories.js', 'lib/organize.js', 'lib/basemaps.js', 'lib/filters.js', 'lib/appearance.js', 'lib/timeline.js', 'lib/annual-review.js',
  'lib/calendar-import.js', 'lib/travel.js', 'lib/trip-share.js', 'lib/activity.js',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css', 'vendor/leaflet-heat.js', 'vendor/ical.min.js',
  'data/world.json', 'data/china.json', 'data/shanghai-landmarks.json',
  'assets/icons/favicon-32.png', 'assets/icons/apple-touch-icon.png', ...appIcons.map(icon => icon.src),
];

await fs.rm(out, { recursive: true, force: true });
for (const dir of ['data', 'vendor', 'assets/icons', 'lib']) await fs.mkdir(path.join(out, dir), { recursive: true });
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
let html = await stampAppVersion(await rd('index.html'), root);
const defaultCanvas=palettes.green.canvas;
html = html.replace('</title>', '</title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="'+defaultCanvas+'">');
html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-mobile-source="'+(DATA_LESS?'import':'files')+'">');
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module" src="data-provider.js"></script><script type="module" src="app.js"></script>');
html = html.replace('</body>', '<script type="module" src="mobile-readonly.js"></script></body>');
await fs.writeFile(path.join(out, 'index.html'), html);

await fs.writeFile(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: '日历足迹', short_name: '日历足迹', start_url: './', display: 'standalone',
  background_color: defaultCanvas, theme_color: defaultCanvas, lang: 'zh-CN', icons: appIcons
}, null, 2));

// service worker
const optionalAssets=[fullBoundaries,'data/china.json','data/city-index.json','data/world.json','data/shanghai-landmarks.json','vendor/leaflet-heat.js'];
const files = ['index.html', 'app.js', 'data-provider.js', 'mobile-readonly.js', 'manifest.webmanifest',
  ...staticFiles.filter(file=>!optionalAssets.includes(file))];
if (!DATA_LESS) files.push(...atlasFiles.map(name=>'data/'+name));
const hash=createHash('sha256');
for(const file of [...files,...optionalAssets])hash.update(file+'\0').update(await fs.readFile(path.join(out,file))).update('\0');
const version=hash.digest('hex').slice(0,16);
const sw = `const VERSION=${JSON.stringify(version)};const FILES=${JSON.stringify(files)};const OPTIONAL=${JSON.stringify(optionalAssets)};
const scope=new URL(self.registration.scope);
const entry=new URL('index.html',scope);
const prefix='calendar-atlas:'+scope.href+':';
const CACHE=prefix+VERSION;
const isEntry=url=>url.origin===scope.origin&&(url.pathname===scope.pathname||url.pathname===entry.pathname);

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Fresh releases cannot reuse an older HTTP-cached response for the same asset URL.
    await cache.addAll(FILES.map(file=>new Request(new URL(file,scope),{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    let legacyCache=false;
    for(const key of await caches.keys()){
      if(key.startsWith(prefix)&&key!==CACHE)await caches.delete(key);
      else if(/^atlas-[a-f0-9]{16}$/.test(key)&&await (await caches.open(key)).match(entry)){
        await caches.delete(key);
        legacyCache=true;
      }
    }
    await self.clients.claim();
    if(legacyCache){
      // The old pages have no controllerchange handler. Move them to the new shell once.
      for(const client of await self.clients.matchAll({type:'window'})){
        if(isEntry(new URL(client.url)))void client.navigate(client.url).catch(()=>{});
      }
    }
  })());
});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const request=e.request;
    const cached=await cache.match(request.mode==='navigate'&&isEntry(url)?entry:request);
    if(cached)return cached;
    const response=await fetch(request);
    const relative=url.pathname.slice(scope.pathname.length);
    if(response.ok && (OPTIONAL.includes(relative)||relative.startsWith('data/cities/'))){
      await cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  })());
});`;
await fs.writeFile(path.join(out, 'sw.js'), sw);

await fs.writeFile(path.join(out, 'serve.mjs'), `import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=await fs.realpath(path.dirname(fileURLToPath(import.meta.url)));const port=Number(process.env.PORT)||8790;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.ics':'text/calendar; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
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
