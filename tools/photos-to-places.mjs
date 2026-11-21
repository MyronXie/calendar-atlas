// 照片地点提取：只读照片元信息（EXIF/HEIC 的 GPS 与拍摄时间），先做「地点簇」聚类，
// 再匹配本地地点库，最后按需做「两级」高德反查，输出按日期/时间的行程报告。
//
// 目标与约束：
//  - 大量照片往往在同一时间、同一地点连拍，逐张调用高德既慢又浪费额度；因此先按空间范围
//    聚类（可跨时间、跨文件夹），每个地点簇最多查询 1~2 次。
//  - 高德 API 额度有限（本任务 <1000 次/月）：先做免费的地点库匹配；只用剩余额度查未命中的簇，
//    并按簇的照片数从多到少消耗预算；查询结果落盘缓存，重复运行可复用。
//  - 「两级查询」：
//      一级（细）— place/around，按风景名胜/科教文化/交通/住宿类取具体 POI，作为“具体地点”；
//      二级（粗）— geocode/regeo，取省/市/区作为“行政区”，仅在一级没有可用结果时兜底。
//    这样既避免过于详细（停车场/售票处/几号楼等设施点），也避免过于粗略（只给城市名）。
//  - 隐私：只解析元信息，不读取或导出任何图像像素内容，也不复制图片。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseExif, parseHeic} from './photo-exif.mjs';
import {stringifyCSV} from '../server/csv-store.mjs';
import {atlasDataDirectory} from '../server/atlas-data.mjs';
import {readConfig} from '../server/config-store.mjs';
import {loadPlaces, amapAroundTypes, regeoRegion, composeAddress, rootURL} from './place-common.mjs';

const projectRoot = fileURLToPath(rootURL);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 一级（细）查询的 POI 大类：风景名胜、科教文化、交通设施、购物服务。
// 有意不含住宿（100000），避免把酒店/民宿当成到访地点；购物类用来把商场/商圈找出来。
const FINE_TYPES = '110000|140000|150000|060000';

// 住宿类判定：这些不作为“到访地点”。
export const LODGING_RE = /酒店|宾馆|民宿|公寓|客栈|青旅|旅馆|hostel|hotel|apartment|residence|service apartment/i;
// 明显不是“到访地点”的店铺/机构名（五金店、公司、培训机构等），比商场本体更细碎。
export const NOISE_NAME = /五金|商行|公司|分公司|培训|口才|家具|维修|汽修|建材|批发|烟酒|茶叶|花房|营业厅|药房|门诊|诊所|研究院|研究所|科技有限|有限公司|终身教育|开放大学|成人教育|学训|营业部|专卖店/;

// 设施点特征：这些往往是景区的附属设施，不适合当作“到访地点”。
const FACILITY_RE = /停车|公共厕所|卫生间|洗手间|售票|游客中心|观光车|乘车|出入口|出口入口|入口|驿站|服务中心|交通站|检票|换乘|加油站|公交站|公交车站|地铁站/;
// 楼栋/单元级过细名称。
const TOO_DETAIL_RE = /(栋|幢|号楼|单元|层|室|号院|号门|车库|车位|电梯|楼梯)(\d+)?$/;

const majorScore = name => {
  const t = String(name || '');
  let s = 0;
  for (const [k, w] of [['景区', 6], ['风景', 6], ['旅游', 5], ['公园', 5], ['广场', 4], ['购物中心', 6], ['商场', 5], ['商城', 4], ['百货', 4], ['天街', 4], ['商业街', 4], ['海滩', 5], ['沙滩', 5], ['银滩', 5], ['岛', 4], ['湾', 3], ['寺', 4], ['庙', 3], ['塔', 4], ['古镇', 5], ['博物馆', 5], ['美术馆', 4], ['大学', 4], ['学院', 3], ['机场', 5], ['火车站', 5], ['高铁', 4], ['汽车站', 4], ['码头', 4], ['港', 3], ['度假', 5], ['湿地', 4], ['瀑布', 5], ['峡谷', 4], ['温泉', 4], ['乐园', 5], ['海洋', 4], ['步行街', 4], ['夜市', 4], ['古城', 5], ['山庄', 3], ['酒店', 4], ['宾馆', 3], ['民宿', 4], ['客栈', 4], ['公寓', 2], ['会展', 3], ['艺术', 3], ['展览', 3]]) if (t.includes(k)) s += w;
  if (/餐饮|咖啡|茶饮|茶|小吃|便利店|超市|美发|养发|棋牌|KTV|烧烤|米粉|火锅|饭店|粉店|餐吧|药店|银行/.test(t)) s -= 3;
  if (/小米之家|无印良品|优衣库|星巴克|麦当劳|肯德基|屈臣氏|名创优品|体验店|专卖店|便利店/.test(t)) s -= 6;
  return s;
};

const FAC_TOKENS = ['地面停车点', '地下停车点', '地面停车场', '地下停车场', '观光车乘车点', '游客中心', '售票处', '停车楼', '停车场', '停车点', '停车区', '公交站', '乘车点', '驿站', '服务中心', '北停车场', '南停车场', '东停车场', '西停车场', '出入口'].sort((a, b) => b.length - a.length);

export function cleanName(name) {
  const orig = String(name || '').trim();
  let n = orig.replace(/[\u2010-\u2015\uFF0D\u2212\uFE63\u00B7\u30FC]/g, '-');
  n = n.replace(/[\(（]([^()（）]{1,30})[\)）]\s*$/g, (m, inner) => FACILITY_RE.test(inner) ? '' : m).trim();
  for (let k = 0; k < 10; k++) {
    const before = n;
    const dm = n.match(/^(.*?)-\s*([^-]{1,30})$/);
    if (dm && FACILITY_RE.test(dm[2])) n = dm[1].trim();
    n = n.replace(/^(.*\S)[\u4e00-\u9fff]{2,4}(?:路|街|道)(地面停车点|地下停车点|地面停车场|地下停车场|停车楼|停车场|停车点|停车区|公交站|游客中心|售票处|观光车乘车点|乘车点|驿站|服务中心|出入口)$/, '$1').trim();
    for (const t of FAC_TOKENS) { if (n.length > t.length && n.endsWith(t)) { n = n.slice(0, -t.length).trim(); break; } }
    n = n.replace(/[A-Za-z]?\d{1,3}$/, '').trim();
    n = n.replace(/地上$/, '').trim();
    n = n.replace(/[\-–—:：\s]+$/, '');
    if (n === before) break;
  }
  return n || orig;
}

export const haversine = (a, b) => {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const median = arr => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** 读取目录下所有图片的元信息（只读文件前缀，不解析像素）。 */
export async function readPhotos(dirs, opts = {}) {
  const maxBytes = opts.maxBytes ?? 16_000_000;
  const IMG = /\.(jpe?g|heic|heif)$/i, HEIC = /\.(heic|heif)$/i;
  const stats = {images: 0, noExif: 0, noGps: 0, noDate: 0, skippedOther: 0, unreadable: 0, truncated: 0};
  const photos = [];
  for (const dir of dirs) {
    let base, files;
    try { base = path.basename(path.resolve(dir)); files = await walk(dir); } catch (e) { console.error('跳过目录(不可读): ' + dir + ' — ' + e.message); continue; }
    for (const f of files) {
      if (!IMG.test(f)) { stats.skippedOther++; continue; }
      stats.images++;
      let buf;
      try {
        const st = await fs.stat(f);
        const take = Math.min(st.size, maxBytes);
        if (st.size > maxBytes) stats.truncated++;
        const fh = await fs.open(f, 'r');
        try { buf = new Uint8Array(take); await fh.read(buf, 0, take, 0); } finally { await fh.close(); }
      } catch { stats.unreadable++; continue; }
      let ex = null;
      try { ex = HEIC.test(f) ? parseHeic(buf) : parseExif(buf); } catch { ex = null; }
      if (!ex) { stats.noExif++; continue; }
      if (ex.lat == null || ex.lon == null) { stats.noGps++; continue; }
      if (!ex.dateTime) { stats.noDate++; continue; }
      const m = String(ex.dateTime).match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}:\d{2}:\d{2})?/);
      if (!m) { stats.noDate++; continue; }
      photos.push({
        file: f,
        rel: path.join(base, path.relative(dir, f)),
        dir: path.resolve(dir),
        lat: +ex.lat, lon: +ex.lon,
        date: `${m[1]}-${m[2]}-${m[3]}`,
        time: (m[4] || '').slice(0, 5),
        dateTime: String(ex.dateTime).trim()
      });
    }
  }
  return {photos, stats};
}

/**
 * 空间聚类（leader 聚类 + 网格加速，可跨时间/跨文件夹）。
 * 单点与簇质心距离 ≤ radius 即并入，簇直径不超过 2×radius，避免链式合并。
 */
export function clusterPhotos(photos, radius = 200) {
  if (!photos.length) return [];
  const meanLat = photos.reduce((s, p) => s + p.lat, 0) / photos.length;
  const mLat = 111320, mLon = Math.max(1, 111320 * Math.cos(meanLat * Math.PI / 180));
  const toXY = p => [p.lon * mLon, p.lat * mLat];
  const grid = new Map();
  const clusters = [];
  const cellOf = (x, y) => Math.floor(x / radius) + ',' + Math.floor(y / radius);
  for (const p of photos) {
    const [x, y] = toXY(p);
    const gx = Math.floor(x / radius), gy = Math.floor(y / radius);
    let best = null, bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get((gx + dx) + ',' + (gy + dy));
      if (!arr) continue;
      for (const c of arr) { const d = Math.hypot(x - c._x, y - c._y); if (d < bd) { bd = d; best = c; } }
    }
    if (best && bd <= radius) {
      best.photos.push(p);
      const n = best.photos.length;
      best._x += (x - best._x) / n; best._y += (y - best._y) / n;
      const nk = cellOf(best._x, best._y);
      if (nk !== best._cell) {
        const arr = grid.get(best._cell);
        if (arr) { const i = arr.indexOf(best); if (i >= 0) arr.splice(i, 1); }
        const na = grid.get(nk) || []; na.push(best); grid.set(nk, na); best._cell = nk;
      }
    } else {
      const c = {id: clusters.length + 1, photos: [p], _x: x, _y: y, _cell: gx + ',' + gy};
      clusters.push(c);
      const arr = grid.get(c._cell) || []; arr.push(c); grid.set(c._cell, arr);
    }
  }
  for (const c of clusters) {
    c.lat = median(c.photos.map(p => p.lat));
    c.lon = median(c.photos.map(p => p.lon));
    c.sample = c.photos[0].rel;
    c.spread = Math.round(Math.max(...c.photos.map(p => haversine([c.lat, c.lon], [p.lat, p.lon]))));
    c.dirs = [...new Set(c.photos.map(p => { const sub = path.dirname(p.rel).split(path.sep).slice(1).join('/'); return sub || path.basename(p.dir); }))].sort();
    c.dates = [...new Set(c.photos.map(p => p.date))].sort();
  }
  clusters.sort((a, b) => (a.dates[0] || '').localeCompare(b.dates[0] || '') || a.photos.length - b.photos.length);
  clusters.forEach((c, i) => { c.id = i + 1; });
  return clusters;
}

/**
 * 免费匹配：只匹配本地地点库（valid≠no、非住宿，半径较小更精准）。
 * 命中即视为已定位，无需再查高德。
 */
export function matchLocal(clusters, places, radius = 60) {
  for (const c of clusters) {
    let best = null, bd = Infinity;
    for (const pl of places) {
      const d = haversine([c.lat, c.lon], [pl.lat, pl.lon]);
      if (d < bd) { bd = d; best = pl; }
    }
    c.nearestPlaceM = Number.isFinite(bd) ? Math.round(bd) : null;
    if (best && bd <= radius) {
      c.place = best.location; c.address = best.address; c.adcode = best.adcode;
      c.dist = Math.round(bd); c.source = '地点库'; c.level = '地点库'; c.needsQuery = false;
      continue;
    }
    c.place = ''; c.address = ''; c.adcode = ''; c.dist = Number.isFinite(bd) ? Math.round(bd) : 0;
    c.source = ''; c.level = ''; c.needsQuery = true;
  }
  return clusters;
}

/** 从候选 POI 中挑出“到访地点”，过滤设施点与楼栋级过细名称。 */
export function pickPoi(cands) {
  let best = null, bs = -Infinity;
  for (const c of cands || []) {
    if (!c || !c.name) continue;
    const cleaned = cleanName(c.name);
    if (!cleaned || FACILITY_RE.test(cleaned) || TOO_DETAIL_RE.test(cleaned)) continue;
    if (/^(省|市|区|县|镇|乡|村|街道)$/.test(cleaned)) continue;
    if (/小米之家|无印良品|优衣库|星巴克|麦当劳|肯德基|屈臣氏|名创优品|体验店|专卖店|便利店/.test(cleaned)) continue;
    if (LODGING_RE.test(cleaned) || NOISE_NAME.test(cleaned)) continue; // 住宿/店铺/机构不算到访地点
    const s = majorScore(c.name) - Math.min(12, (c.dist || 0) / 150);
    if (s > bs) { bs = s; best = {...c, name: cleaned, score: s}; }
  }
  return best;
}

const cacheKeyOf = c => c.lon.toFixed(4) + ',' + c.lat.toFixed(4);

async function loadCache(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; }
}

// 境外判断：高德对中国大陆以外覆盖差，境外簇改走免费 OSM/Photon。
// 港澳台单独框出；香港框的纬度上界卡在 22.46，避免把深圳市区误判为境外。
const CN_BOX = {latMin: 18, latMax: 53.6, lonMin: 73.5, lonMax: 135.1};
const OVERSEA_BOXES = [
  {latMin: 21.8, latMax: 22.46, lonMin: 113.82, lonMax: 114.45}, // 香港
  {latMin: 22.05, latMax: 22.23, lonMin: 113.52, lonMax: 113.61}  // 澳门
];
export function isDefinitelyOverseas(c) {
  if (c.lat < CN_BOX.latMin || c.lat > CN_BOX.latMax || c.lon < CN_BOX.lonMin || c.lon > CN_BOX.lonMax) return true;
  return OVERSEA_BOXES.some(b => c.lat >= b.latMin && c.lat <= b.latMax && c.lon >= b.lonMin && c.lon <= b.lonMax);
}

// Photon（OSM，免费）反查：优先公园/景点/博物馆等，取不到则用城市/地区兜底。
async function photonReverseRich(lat, lon) {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=10`;
    const r = await fetch(url, {signal: AbortSignal.timeout(12000), headers: {'User-Agent': 'calendar-atlas-photo/1.0'}});
    const j = await r.json(); const feats = j.features || [];
    let best = null, bs = -Infinity, region = '';
    for (const f of feats) {
      const p = f.properties || {};
      if (!region) {
        if (p.city && !/^\d+$/.test(String(p.city))) region = p.city;
        else if (p.state && !/^\d+$/.test(String(p.state))) region = p.state;
        else if (p.country && !/^\d+$/.test(String(p.country))) region = p.country;
      }
      const name = p.name; if (!name || /^\d+$/.test(String(name))) continue;
      // 过滤设施/楼栋类过细名称
      if (/^(car park|canteen|block\b|tower \d+|toilets?|atm|parking)\b/i.test(String(name)) || /^第\d+座/.test(String(name)) || /^[a-z]座\b/i.test(String(name)) || /停车场|停車場|停车楼|厕所|洗手間|卫生间|食堂|垃圾/.test(String(name))) continue;
      if (LODGING_RE.test(String(name)) || NOISE_NAME.test(String(name))) continue;
      const k = p.osm_key || '', v = p.osm_value || '';
      let s = 0;
      if (k === 'tourism' || k === 'leisure' || k === 'historic') s += 6;
      else if (k === 'place') s += 5;
      else if (k === 'railway' || k === 'public_transport') s += 4;
      else if (k === 'amenity') s += 3;
      else if (k === 'building') s += 1;
      else if (k === 'highway') s -= 5;
      else if (k === 'shop' || k === 'office') s -= 3;
      if (/attraction|museum|park|garden|viewpoint|theatre|artwork|zoo|theme_park|university|college|marketplace|station|subway|metro|ferry_terminal/.test(v)) s += 4;
      if (/bus_stop|postcode|house|residential|school|jewelry|hardware|fuel|atm|bank|pharmacy|toilets|clinic|parking|hotel|hostel|guest_house/.test(v)) s -= 6;
      const coords = (f.geometry && f.geometry.coordinates) || [lon, lat];
      const d = haversine([lat, lon], [coords[1], coords[0]]);
      s -= Math.min(4, d / 300);
      if (s > bs) { bs = s; best = {name: String(name), dist: Math.round(d)}; }
    }
    if (best && bs >= 4) return {place: best.name, address: region, adcode: '', dist: best.dist, source: 'OSM', level: '具体地点', fine: best.name, coarse: region};
    if (region) return {place: region, address: region, adcode: '', dist: 0, source: 'OSM', level: '行政区', fine: '', coarse: region};
    return null;
  } catch { return null; }
}

/**
 * 两级高德反查 + 境外 OSM 兜底 + 额度预算 + 缓存。
 * 境外簇走 Photon（免费，不耗高德额度）；境内一级（细）POI 1 次，无可用结果时二级（粗）行政区 1 次。
 * 按照片数降序消耗预算，超出预算的簇标记“额度不足”。
 */
export async function resolveClusters(clusters, opts) {
  const cache = opts.cache || {};
  const stats = {calls: 0, cacheHits: 0, fine: 0, coarse: 0, osm: 0, exhausted: 0, failed: 0};
  // 已解析缓存（含坐标），用于重新聚类后按邻近复用，避免重复调用高德
  const cacheList = Object.entries(cache).map(([k, v]) => { const [lon, lat] = k.split(',').map(Number); return {lat, lon, v}; }).filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lon));
  const queue = clusters.filter(c => c.needsQuery).sort((a, b) => b.photos.length - a.photos.length);
  let dirty = 0;
  for (const c of queue) {
    const key = cacheKeyOf(c);
    // 境外簇直接走 OSM（高德覆盖差），不消耗高德额度
    if (isDefinitelyOverseas(c)) {
      await sleep(220);
      const info = await photonReverseRich(c.lat, c.lon);
      stats.osm++;
      if (info) {
        Object.assign(c, {...info, needsQuery: false});
        cache[key] = info;
        if (info.level === '具体地点') stats.fine++; else stats.coarse++;
        if (++dirty >= 10 && opts.cachePath) { await saveCache(opts.cachePath, cache); dirty = 0; }
      } else { c.place = '(未匹配地点)'; c.source = 'OSM失败'; c.level = ''; c.needsQuery = false; }
      continue;
    }
    // 精确坐标命中（住宿类缓存不再采用，需要重新匹配）
    const hit = cache[key];
    if (hit && hit.place && hit.place !== '(未匹配地点)' && !LODGING_RE.test(hit.place) && !NOISE_NAME.test(hit.place) && !FACILITY_RE.test(hit.place)) {
      Object.assign(c, {place: cleanName(hit.place), address: hit.address, adcode: hit.adcode, dist: hit.dist, source: hit.source + '(缓存)', level: hit.level, needsQuery: false});
      stats.cacheHits++;
      if (hit.level === '具体地点') stats.fine++; else if (hit.level === '行政区') stats.coarse++;
      continue;
    }
    // 邻近缓存复用（半径内、非住宿）
    if (opts.cacheRadius > 0) {
      let best = null, bd = Infinity;
      for (const e of cacheList) {
        if (!e.v.place || e.v.place === '(未匹配地点)' || LODGING_RE.test(e.v.place) || NOISE_NAME.test(e.v.place) || FACILITY_RE.test(e.v.place)) continue;
        const d = haversine([c.lat, c.lon], [e.lat, e.lon]);
        if (d < bd) { bd = d; best = e; }
      }
      if (best && bd <= opts.cacheRadius) {
        Object.assign(c, {place: cleanName(best.v.place), address: best.v.address, adcode: best.v.adcode, dist: Math.round(bd), source: (best.v.source || '') + '(邻近缓存)', level: best.v.level, needsQuery: false});
        stats.cacheHits++;
        if (best.v.level === '具体地点') stats.fine++; else if (best.v.level === '行政区') stats.coarse++;
        continue;
      }
    }
    if (stats.calls >= opts.maxCalls) {
      c.place = '(未匹配地点)'; c.source = '额度不足'; c.level = ''; c.needsQuery = false; stats.exhausted++;
      continue;
    }
    // 一级（细）：具体 POI
    let info = null;
    let pois = [];
    try { pois = await amapAroundTypes(c.lon, c.lat, opts.fineRadius, FINE_TYPES); stats.calls++; } catch { stats.calls++; stats.failed++; }
    const poi = pickPoi(pois);
    if (poi) {
      info = {place: poi.name, address: poi.address || '', adcode: poi.adcode || '', dist: Math.round(poi.dist || 0), source: '高德POI', level: '具体地点', fine: poi.name, coarse: ''};
      stats.fine++;
    } else if (stats.calls < opts.maxCalls) {
      // 二级（粗）：行政区兜底
      let rg = null;
      try { await sleep(120); rg = await regeoRegion(c.lon, c.lat); stats.calls++; } catch { stats.calls++; stats.failed++; }
      if (rg) {
        const mid = rg.city && rg.city !== rg.prov ? rg.city : '';
        const label = [rg.prov, mid, rg.district].filter(Boolean).join('·') || '';
        if (label) { info = {place: label, address: composeAddress(rg, ''), adcode: rg.adcode || '', dist: 0, source: '行政区', level: '行政区', fine: '', coarse: label}; stats.coarse++; }
      }
    }
    // 境内仍无结果时，最后用 OSM 免费兜底
    if (!info) {
      await sleep(220);
      const pi = await photonReverseRich(c.lat, c.lon); stats.osm++;
      if (pi) { info = pi; if (pi.level === '具体地点') stats.fine++; else stats.coarse++; }
    }
    if (!info) { c.place = '(未匹配地点)'; c.source = ''; c.level = ''; c.needsQuery = false; continue; }
    Object.assign(c, {...info, needsQuery: false});
    cache[key] = {place: info.place, address: info.address, adcode: info.adcode, dist: info.dist, source: info.source, level: info.level, fine: info.fine, coarse: info.coarse};
    if (++dirty >= 10 && opts.cachePath) { await saveCache(opts.cachePath, cache); dirty = 0; }
  }
  if (dirty && opts.cachePath) await saveCache(opts.cachePath, cache);
  stats.budget = opts.maxCalls;
  return stats;
}

async function saveCache(file, cache) {
  try { await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, JSON.stringify(cache, null, 0)); } catch { }
}

const LEVEL_RANK = {'具体地点': 5, '地点库': 3, '行政区': 2, '': 1, '额度不足': 0};
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekdayOf = (d) => { const t = new Date(d + 'T00:00:00'); return Number.isNaN(t.getTime()) ? '' : WD[t.getDay()]; };

/** 生成按日期/时间排序的行程（同一天同地点或近邻合并）。 */
export function buildVisits(clusters, dedupe = 80) {
  const byDate = new Map();
  for (const c of clusters) {
    const perDate = new Map();
    for (const p of c.photos) { if (!perDate.has(p.date)) perDate.set(p.date, []); perDate.get(p.date).push(p.time); }
    for (const [date, times] of perDate) {
      const ts = times.slice().sort();
      const v = {
        date, first_time: ts[0] || '', last_time: ts[ts.length - 1] || '',
        place: c.place, level: c.level, address: c.address, adcode: c.adcode,
        lat: +c.lat.toFixed(6), lon: +c.lon.toFixed(6), distance_m: c.dist, source: c.source,
        photo_count: times.length, sample_photo: c.sample, _pid: c.id
      };
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(v);
    }
  }
  const result = [];
  for (const date of [...byDate.keys()].sort()) {
    const arr = byDate.get(date).map(r => ({...r}));
    const merged = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]._done) continue;
      const base = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[j]._done) continue;
        const sameName = base.place && base.place !== '(未匹配地点)' && arr[j].place === base.place;
        const near = haversine([base.lat, base.lon], [arr[j].lat, arr[j].lon]) <= dedupe;
        if (!sameName && !near) continue;
        base.first_time = !base.first_time ? arr[j].first_time : (!arr[j].first_time ? base.first_time : (arr[j].first_time < base.first_time ? arr[j].first_time : base.first_time));
        base.last_time = arr[j].last_time > base.last_time ? arr[j].last_time : base.last_time;
        base.photo_count += arr[j].photo_count;
        const a = LEVEL_RANK[base.level] || 0, b = LEVEL_RANK[arr[j].level] || 0;
        if (b > a || (b === a && arr[j].photo_count > base.photo_count && arr[j].place && arr[j].place !== '(未匹配地点)')) {
          base.place = arr[j].place; base.level = arr[j].level; base.address = arr[j].address;
          base.adcode = arr[j].adcode; base.source = arr[j].source; base.lat = arr[j].lat; base.lon = arr[j].lon;
        }
        base.distance_m = Math.min(base.distance_m || 0, arr[j].distance_m || 0);
        arr[j]._done = true;
      }
      merged.push(base);
    }
    merged.sort((a, b) => (a.first_time || '').localeCompare(b.first_time || ''));
    for (const m of merged) { delete m._done; delete m._pid; result.push(m); }
  }
  return result;
}

/** 连续日期合并为“行程”。 */
export function groupTrips(visits) {
  const dates = [...new Set(visits.map(v => v.date))].sort();
  const trips = [];
  let cur = null;
  for (const d of dates) {
    const t = new Date(d + 'T00:00:00').getTime();
    if (cur && (t - cur._last) / 86400000 <= 1.5) { cur.end = d; cur._last = t; cur.days++; }
    else { cur = {start: d, end: d, days: 1, _last: t, visits: 0, photos: 0}; trips.push(cur); }
  }
  for (const tr of trips) {
    const vs = visits.filter(v => v.date >= tr.start && v.date <= tr.end);
    tr.visits = vs.length; tr.photos = vs.reduce((s, v) => s + v.photo_count, 0);
    tr.places = [...new Set(vs.map(v => v.place).filter(p => p && p !== '(未匹配地点)'))];
  }
  return trips;
}

export function renderReport(meta) {
  const {stamp, dirs, stats, clusters, visits, amap, opts} = meta;
  const photoCount = clusters.reduce((s, c) => s + c.photos.length, 0);
  const levels = {'具体地点': 0, '地点库': 0, '行政区': 0, '': 0, '额度不足': 0};
  for (const c of clusters) levels[c.level] = (levels[c.level] || 0) + 1;
  const unresolved = clusters.filter(c => !c.level || c.level === '').length;
  const md = [];
  md.push(`# 照片地点行程（${stamp}）`, '');
  md.push(`照片目录：${dirs.map(d => '`' + d + '`').join('、')}`, '');
  md.push(`共扫描图片 ${stats.images} 张；解析出带 GPS 与拍摄时间 ${photoCount} 张；按约 ${opts.clusterRadius} 米聚成 ${clusters.length} 个地点簇。${stats.excluded ? `已排除指定区域的照片 ${stats.excluded} 张。` : ''}`);
  md.push(`匹配：具体地点 ${levels['具体地点'] || 0}、地点库 ${levels['地点库'] || 0}、行政区 ${levels['行政区'] || 0}、未匹配/额度不足 ${unresolved}。`);
  if (amap) md.push(`高德查询 ${amap.calls} 次（预算 ${amap.budget}，缓存命中 ${amap.cacheHits}${amap.exhausted ? `，额度不足 ${amap.exhausted}` : ''}）${amap.osm ? `；OSM 境外反查 ${amap.osm} 次` : ''}。`);
  md.push(`去重半径 ${opts.dedupe} 米；无元信息 ${stats.noExif}，无 GPS ${stats.noGps}，无日期 ${stats.noDate}，不可读 ${stats.unreadable}，跳过其它 ${stats.skippedOther}${stats.truncated ? `，超长截断 ${stats.truncated}` : ''}。`);
  md.push('', '> 隐私：仅解析照片元信息（EXIF/HEIC 的位置与时间），未读取或导出图像内容，也未复制图片。', '');

  if (!visits.length) { md.push('没有可用的带 GPS 与日期的照片。'); return md.join('\n'); }

  // 按月概览（日常出行常连续多天，用“行程”合并会误连成长段，按月更直观）
  const months = new Map();
  for (const v of visits) {
    const m = v.date.slice(0, 7);
    if (!months.has(m)) months.set(m, {dates: new Set(), visits: 0, photos: 0, places: new Set()});
    const o = months.get(m);
    o.dates.add(v.date); o.visits++; o.photos += v.photo_count;
    if (v.place && v.place !== '(未匹配地点)') o.places.add(v.place);
  }
  md.push('## 月度概览', '');
  for (const [m, o] of [...months].sort()) {
    md.push(`- ${m} · ${o.dates.size} 天 · ${o.visits} 处 · ${o.photos} 张${o.places.size ? ' · ' + [...o.places].slice(0, 6).join('、') : ''}`);
  }
  md.push('');
  const byDate = new Map();
  for (const v of visits) { if (!byDate.has(v.date)) byDate.set(v.date, []); byDate.get(v.date).push(v); }
  for (const date of [...byDate.keys()].sort()) {
    md.push(`## ${date} ${weekdayOf(date)}`, '');
    md.push('| 时间 | 地点 | 层级 | 地址 | 照片 |', '|---|---|---|---|---|');
    for (const v of byDate.get(date)) {
      const time = v.first_time ? (v.last_time && v.last_time !== v.first_time ? `${v.first_time}–${v.last_time}` : v.first_time) : '—';
      md.push(`| ${time} | ${v.place || '(未匹配地点)'} | ${v.level || '—'} | ${v.address || ''} | ${v.photo_count} |`);
    }
    md.push('');
  }
  md.push('> “具体地点”来自高德 POI，“行政区”是具体 POI 不可信时的省/市/区兜底，“地点库”命中本地 place.csv。', '');
  return md.join('\n');
}

export const VISIT_HEADERS = ['date', 'first_time', 'last_time', 'place', 'level', 'address', 'adcode', 'lat', 'lon', 'distance_m', 'source', 'photo_count', 'sample_photo'];
export const CLUSTER_HEADERS = ['cluster_id', 'lat', 'lon', 'spread_m', 'photo_count', 'dirs', 'dates', 'place', 'level', 'source', 'address', 'adcode', 'nearest_place_m'];

export function visitRows(visits) {
  return visits.map(v => ({...v, dirs: undefined}));
}

export function clusterRows(clusters) {
  return clusters.map(c => ({
    cluster_id: c.id, lat: c.lat.toFixed(6), lon: c.lon.toFixed(6), spread_m: c.spread,
    photo_count: c.photos.length, dirs: c.dirs.join(';'), dates: c.dates.join(';'),
    place: c.place || '(未匹配地点)', level: c.level || '', source: c.source || '', address: c.address || '',
    adcode: c.adcode || '', nearest_place_m: c.nearestPlaceM == null ? '' : c.nearestPlaceM
  }));
}

async function loadExcludes() {
  try {
    const cfg = await readConfig(fileURLToPath(atlasDataDirectory()));
    return cfg.photoExclusions || [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // 兼容旧的独立文件（尚未迁移到 config.json 时）
    let text;
    try {
      text = await fs.readFile(new URL('photo-exclusions.json', atlasDataDirectory()), 'utf8');
    } catch (legacyError) {
      if (legacyError.code === 'ENOENT') return [];
      throw legacyError;
    }
    const invalid = () => Error('照片排除区域需为有效经纬度范围数组（config.json 的 photos.exclusions）');
    let rectangles;
    try {
      rectangles = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch {
      throw invalid();
    }
    if (!Array.isArray(rectangles)) throw invalid();
    return rectangles.map(rectangle => {
      const {latMin, latMax, lonMin, lonMax} = rectangle ?? {};
      if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite) ||
          latMin < -90 || latMin >= latMax || latMax > 90 ||
          lonMin < -180 || lonMin >= lonMax || lonMax > 180) throw invalid();
      return {latMin, latMax, lonMin, lonMax};
    });
  }
}

function parseExcludes(text) {
  if (String(text).toLowerCase() === 'none' || text === '') return [];
  return String(text).split(';').map(s => s.split(',').map(Number)).filter(a => a.length === 4 && a.every(Number.isFinite))
    .map(a => ({latMin: a[0], latMax: a[1], lonMin: a[2], lonMax: a[3]}));
}
const inExcluded = (p, rects) => rects.some(r => p.lat >= r.latMin && p.lat <= r.latMax && p.lon >= r.lonMin && p.lon <= r.lonMax);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const dirs = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--dir') String(argv[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(d => dirs.push(d));
  if (!dirs.length) {
    console.error('用法: node tools/photos-to-places.mjs --dir <文件夹> [--dir <文件夹2>] [--out 前缀] [--cluster-radius 100] [--local-radius 60] [--dedupe 80] [--fine-radius 800] [--max-calls 400] [--preview|--no-amap]');
    console.error('  --cluster-radius 地点簇半径(米，默认100)；--local-radius 本地地点库匹配半径(默认60，更精准)');
    console.error('  --dedupe 同一天合并半径(默认80)；--fine-radius 高德 POI 搜索半径(米，默认800)；--max-calls 高德调用预算(默认400)');
    console.error('  --exclude-rect "latMin,latMax,lonMin,lonMax;..." 覆盖本地排除区域配置（none 表示不排除）');
    console.error('  --preview 只聚类不查询；--no-amap 不调高德');
    process.exit(1);
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const excludeArg = arg('--exclude-rect', null);
  const opts = {
    clusterRadius: Number(arg('--cluster-radius', arg('--radius', '100'))),
    localRadius: Number(arg('--local-radius', '60')),
    cacheRadius: Number(arg('--cache-radius', '120')),
    dedupe: Number(arg('--dedupe', '80')),
    fineRadius: Number(arg('--fine-radius', arg('--major-radius', '800'))),
    maxCalls: clamp(Number(arg('--max-calls', '400')), 0, 5000),
    maxBytes: Number(arg('--max-read-bytes', '16000000')),
    cachePath: arg('--cache', path.join(projectRoot, 'temps', '.photo-amap-cache.json')),
    excludes: excludeArg === null ? await loadExcludes() : parseExcludes(excludeArg),
    noAmap: argv.includes('--no-amap'),
    preview: argv.includes('--preview')
  };
  const outBase = arg('--out', null) || path.join(projectRoot, 'temps', `照片地点记录_${stamp}`);

  const {photos, stats} = await readPhotos(dirs, {maxBytes: opts.maxBytes});
  // 排除配置中的日常区域
  const kept = photos.filter(p => !inExcluded(p, opts.excludes));
  stats.excluded = photos.length - kept.length;

  const places = (await loadPlaces()).places
    .filter(p => String(p.valid).toLowerCase() !== 'no' && p.type !== 'stay' && !LODGING_RE.test(p.location))
    .map(p => ({location: p.location, address: p.address, adcode: p.adcode, lat: +p.lat, lon: +p.lon}))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  const clusters = clusterPhotos(kept, opts.clusterRadius);
  matchLocal(clusters, places, opts.localRadius);

  let amap = null;
  if (!opts.noAmap && !opts.preview) {
    const cache = await loadCache(opts.cachePath);
    amap = await resolveClusters(clusters, {...opts, cache});
  } else {
    for (const c of clusters) if (c.needsQuery) { c.place = '(未匹配地点)'; c.level = ''; c.source = opts.preview ? '预览' : '未查询'; }
  }

  const visits = buildVisits(clusters, opts.dedupe);
  const md = renderReport({stamp, dirs, stats, clusters, visits, amap, opts});
  await fs.mkdir(path.dirname(outBase), {recursive: true});
  await fs.writeFile(outBase + '.md', md);
  await fs.writeFile(outBase + '.csv', stringifyCSV({headers: VISIT_HEADERS, places: visitRows(visits)}));
  await fs.writeFile(outBase + '_簇.csv', stringifyCSV({headers: CLUSTER_HEADERS, places: clusterRows(clusters)}));

  console.log(JSON.stringify({
    dirs, images: stats.images, photos: kept.length, excluded: stats.excluded, clusters: clusters.length,
    places: places.length,
    needsQuery: clusters.filter(c => c.needsQuery).length,
    amap, visits: visits.length, dates: [...new Set(visits.map(v => v.date))].length,
    out: {md: outBase + '.md', csv: outBase + '.csv', clusters: outBase + '_簇.csv'}
  }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
