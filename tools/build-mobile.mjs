// Build static read-only web app under mobile/.
//  default (data-full): bundle user-data (place/config/calendar) — for local PWA.
//  --data-less         : DO NOT bundle private data; include in-app import (IndexedDB) — for public repo / APK.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV} from '../csv-store.mjs';
import {readConfig} from '../config-store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'mobile');
const DATA_LESS = process.argv.includes('--data-less');
const rd = (p) => fs.readFile(path.join(root, p), 'utf8');
const cp = (src, dst) => fs.cp(path.join(root, src), path.join(out, dst), { recursive: true });

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'data'), { recursive: true });

for (const f of ['style.css', 'core.js', 'place-categories.js', 'organize.js', 'emoji.js', 'filters.js', 'appearance.js', 'timeline.js', 'annual-review.js']) await fs.writeFile(path.join(out, f), await rd(f));
await cp('vendor', 'vendor');
for (const g of ['gcoord.global.prod.js', 'gcoord.LICENSE']) await fs.rm(path.join(out, 'vendor', g), { force: true });
for (const n of ['world', 'china', 'local-reference', 'city-boundaries', 'shanghai-landmarks']) await fs.copyFile(path.join(root, 'data', n + '.json'), path.join(out, 'data', n + '.json'));

let placeRows = 0;
if (!DATA_LESS) {
  const db = parseCSV(await rd('user-data/place.csv'));
  placeRows = db.places.length;
  await fs.writeFile(path.join(out, 'data', 'place.json'), JSON.stringify({ version: 'static', headers: db.headers, places: db.places, file: 'place.json' }));
  const cfg = await readConfig(path.join(root, 'user-data'));
  await fs.writeFile(path.join(out, 'data', 'config.json'), JSON.stringify(cfg));
  await fs.copyFile(path.join(root, 'user-data', 'calendar.ics'), path.join(out, 'data', 'calendar.ics'));
}

// patch app.js data endpoints -> local paths (served from bundle or IndexedDB shim)
let app = await rd('app.js');
app = app.replaceAll("'api/places'", "'data/place.json'").replaceAll("'api/config'", "'data/config.json'").replaceAll("'api/calendar'", "'data/calendar.ics'");
await fs.writeFile(path.join(out, 'app.js'), app);

// read-only shim source
await fs.copyFile(path.join(root, 'tools', 'mobile-readonly.js'), path.join(out, 'mobile-readonly.js'));

// index.html: manifest + (data-less) data-provider + read-only shim
let html = await rd('index.html');
html = html.replace('<title>日历地图</title>', '<title>日历地图</title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#f2e8d5">');
if (DATA_LESS) {
  await fs.copyFile(path.join(root, 'tools', 'mobile-data-provider.js'), path.join(out, 'data-provider.js'));
  html = html.replace('<script type="module" src="app.js"></script>', '<script src="data-provider.js"></script><script type="module" src="app.js"></script>');
}
html = html.replace('</body>', '<script type="module" src="mobile-readonly.js"></script></body>');
await fs.writeFile(path.join(out, 'index.html'), html);

await fs.writeFile(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: '日历足迹（只读）', short_name: '足迹', start_url: './', display: 'standalone',
  background_color: '#f2e8d5', theme_color: '#f2e8d5', lang: 'zh-CN', icons: []
}, null, 2));

// service worker
const files = ['index.html', 'app.js', 'mobile-readonly.js', 'style.css', 'core.js', 'place-categories.js', 'organize.js', 'emoji.js', 'filters.js', 'appearance.js', 'timeline.js', 'annual-review.js',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/leaflet.markercluster.js', 'vendor/MarkerCluster.css', 'vendor/MarkerCluster.Default.css', 'vendor/leaflet-heat.js', 'vendor/ical.min.js',
  'data/world.json', 'data/china.json', 'data/local-reference.json', 'data/city-boundaries.json', 'data/shanghai-landmarks.json', 'manifest.webmanifest'];
if (DATA_LESS) files.push('data-provider.js');
else files.push('data/place.json', 'data/config.json', 'data/calendar.ics');
const sw = `const CACHE='atlas-v7';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return resp;}).catch(()=>caches.match('index.html'))));});`;
await fs.writeFile(path.join(out, 'sw.js'), sw);

await fs.writeFile(path.join(out, 'serve.mjs'), `import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const port=Number(process.env.PORT)||8790;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ics':'text/calendar; charset=utf-8','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://x').pathname);if(p==='/'||p==='')p='/index.html';const f=path.join(root,p);if(!f.startsWith(root))throw 0;const b=await fs.readFile(f);res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end('not found');}}).listen(port,'0.0.0.0',()=>console.log('mobile: http://localhost:'+port));`);

await fs.writeFile(path.join(out, 'README.md'), `# 移动端只读版（${DATA_LESS ? '数据-less / 公共仓库打包' : '含数据 / 本地'}）

生成：\`node tools/build-mobile.mjs${DATA_LESS ? ' --data-less' : ''}\`（每次数据更新后重跑；data-less 模式不含私人数据）。

## data-less 模式（方案2）
- APK 内不含私人数据；首次打开会弹出“导入/更新数据”，选择电脑导出的 3 个文件：\`place.json\`、\`calendar.ics\`、\`config.json\`。
- 数据存入手机 IndexedDB，之后离线可用（底图仍需联网）。随时点右下角“导入/更新数据”可更新。
- 电脑侧导出数据：\`node tools/export-mobile-data.mjs\` → 生成 \`mobile-data/\`（含 3 个文件），传到手机导入。

## 含数据模式（本地 PWA）
- 直接 \`node mobile/serve.mjs\` → http://localhost:8790；手机同网访问。
`);

console.log(JSON.stringify({ out, mode: DATA_LESS ? 'data-less' : 'data-full', placeRows }));
