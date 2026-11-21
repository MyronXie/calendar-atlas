// Shared helpers for place workflows (Amap + Baidu + matching).
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {atlasDataDirectory} from '../server/atlas-data.mjs';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../server/csv-store.mjs';
const root = new URL('../', import.meta.url);
const gctx = {}; vm.runInNewContext(await fs.readFile(new URL('vendor/gcoord.global.prod.js', root), 'utf8'), gctx); const gc = gctx.gcoord;
export const KEY = process.env.AMAP_KEY || '';
import {loose as norm} from '../lib/place-name.js';
export {norm};
export const core = s => norm(String(s).split(/[（(]/)[0]);
export const branchOf = s => { const m = String(s).match(/[（(]([^）)]+)[）)]\s*$/); return m ? norm(m[1]) : ''; };
const lcsub = (a, b) => { if (!a || !b) return 0; const m = a.length, n = b.length; let dp = new Array(n + 1).fill(0), best = 0; for (let i = 1; i <= m; i++) { let prev = 0; for (let j = 1; j <= n; j++) { const t = dp[j]; if (a[i - 1] === b[j - 1]) { dp[j] = prev + 1; if (dp[j] > best) best = dp[j]; } else dp[j] = 0; prev = t; } } return best; };
export const coreSim = (a, b) => { const ca = core(a), cb = core(b); const L = Math.min(ca.length, cb.length); return L ? lcsub(ca, cb) / L : 0; };
const R = Math.PI / 180; export const dist = (a, b) => Math.round(Math.hypot((a[0] - b[0]) * R * Math.cos((a[1] + b[1]) / 2 * R), (a[1] - b[1]) * R) * 6371000);
let lastA = 0, lastB = 0;
export async function amapText(keyword, adcode) {
  if (!KEY) throw Error('NO AMAP_KEY');
  const d = 340 - (Date.now() - lastA); if (d > 0) await new Promise(r => setTimeout(r, d)); lastA = Date.now();
  const base = `https://restapi.amap.com/v3/place/text?key=${KEY}&keywords=${encodeURIComponent(keyword)}&offset=10&page=1&extensions=all`;
  for (const suf of [adcode ? `&city=${adcode}&citylimit=true` : null, '']) {
    if (suf === null) continue;
    try { const res = await fetch(base + suf, { signal: AbortSignal.timeout(8000) }); const j = await res.json(); if (j.status === '1' && j.pois && j.pois.length) return j.pois.filter(x => x.name && x.location).map(x => { const [lon, lat] = x.location.split(',').map(Number); return { src: 'amap', name: x.name, address: x.address || '', lat, lon, adcode: x.adcode || '', type: x.type || '' }; }); } catch (e) { }
  }
  return [];
}
export async function amapAroundTypes(lon, lat, radius = 3000, types = '110000|150000') {
  if (!KEY) return [];
  const d = 300 - (Date.now() - lastA); if (d > 0) await new Promise(r => setTimeout(r, d)); lastA = Date.now();
  try { const res = await fetch(`https://restapi.amap.com/v3/place/around?key=${KEY}&location=${lon.toFixed(6)},${lat.toFixed(6)}&radius=${radius}&types=${types}&offset=25&page=1&extensions=base`, { signal: AbortSignal.timeout(8000) }); const j = await res.json(); if (j.status !== '1') return []; return (j.pois || []).filter(p => p.name && p.location).map(p => { const [plon, plat] = p.location.split(',').map(Number); return { name: p.name, address: p.address || '', adcode: p.adcode || '', type: p.type || '', lat: plat, lon: plon, dist: dist([lat, lon], [plat, plon]) }; }); } catch { return []; }
}
export async function amapAround(lon, lat, radius = 80) {  if (!KEY) return [];
  const d = 300 - (Date.now() - lastA); if (d > 0) await new Promise(r => setTimeout(r, d)); lastA = Date.now();
  try { const res = await fetch(`https://restapi.amap.com/v3/place/around?key=${KEY}&location=${lon.toFixed(6)},${lat.toFixed(6)}&radius=${radius}&offset=10&page=1&extensions=base`, { signal: AbortSignal.timeout(8000) }); const j = await res.json(); if (j.status !== '1') return []; return (j.pois || []).filter(p => p.name && p.location).map(p => { const [plon, plat] = p.location.split(',').map(Number); return { src: 'amap-around', name: p.name, address: p.address || '', adcode: p.adcode || '', lat: plat, lon: plon, dist: dist([lat, lon], [plat, plon]) }; }); } catch { return []; }
}
export async function baiduText(keyword, cityCode = 289) {
  const d = 1200 - (Date.now() - lastB); if (d > 0) await new Promise(r => setTimeout(r, d)); lastB = Date.now();
  try {
    const res = await fetch('https://map.baidu.com/?qt=s&wd=' + encodeURIComponent(keyword) + '&c=' + cityCode + '&rn=10', { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return []; const j = await res.json(); const raw = Array.isArray(j.content) ? j.content : [];
    return raw.filter(p => p.name && p.geo && p.addr).map(p => { const m = p.geo.split('|').at(-1).match(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/); if (!m) return null; const [lon, lat] = gc.transform([+m[1], +m[2]], gc.BD09MC, gc.GCJ02); const vis = JSON.stringify([p.name, p.show_tag, p.ext_display, p.title_status, p.business_status, p.shop_status]); const closed = vis.match(/永久关闭|已停业|已关闭|已歇业/); return { src: 'baidu', name: p.name, address: (p.area_name || '') + p.addr, lat: +lat.toFixed(7), lon: +lon.toFixed(7), closed: closed ? closed[0] : '' }; }).filter(Boolean);
  } catch { return []; }
}
const placesURL=async rel=>rel?new URL(rel,root):new URL('place.csv',atlasDataDirectory());
export async function loadPlaces(rel) { return parseCSV(await fs.readFile(await placesURL(rel), 'utf8')); }
export async function savePlaces(db, rel) {
  const f = fileURLToPath(await placesURL(rel)); const raw = await fs.readFile(f, 'utf8'); const out = stringifyCSV(db);
  if (out === raw) return false;
  const path = await import('node:path'); const bakDir = path.join(path.dirname(f), '.backups'); await fs.mkdir(bakDir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(bakDir, 'place.csv.' + Date.now() + '.bak'), raw, { flag: 'wx' });
  const temp = f + '.' + Date.now() + '.tmp'; await fs.writeFile(temp, out, { flag: 'wx' });
  for (let i = 1; i <= 6; i++) { try { await fs.rename(temp, f); return true; } catch (e) { if (i === 6) { await fs.unlink(temp).catch(() => { }); throw e; } await new Promise(r => setTimeout(r, 400 * i)); } }
}
export const todayStr = (d = new Date()) => `${String(d.getFullYear()).slice(-2)}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
export const fmtKey = k => `${String(Math.floor(k / 10000)).slice(-2)}/${String(Math.floor((k % 10000) / 100)).padStart(2, '0')}/${String(k % 100).padStart(2, '0')}`;
export function parseDateYY(s) { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (!m) return null; return new Date(2000 + +m[1], +m[2] - 1, +m[3]); }
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);
export const rootURL = root;
// OSM Photon (non-domestic, free) — for overseas verification
export async function regeoRegion(lon, lat) {
  if (!KEY || !Number.isFinite(+lon) || !Number.isFinite(+lat)) return null;
  try { const r = await fetch(`https://restapi.amap.com/v3/geocode/regeo?key=${KEY}&location=${(+lon).toFixed(6)},${(+lat).toFixed(6)}&extensions=base`, { signal: AbortSignal.timeout(8000) }); const j = await r.json(); if (j.status !== '1' || !j.regeocode) return null; const a = j.regeocode.addressComponent || {}; const str = v => Array.isArray(v) ? '' : (v || ''); return { prov: str(a.province), city: str(a.city), district: str(a.district), adcode: str(a.adcode) }; } catch { return null; }
}
export function composeAddress(region, address) {
  const addr = String(address || ''); if (!region || !region.prov) return addr; const { prov, city, district } = region; const mid = (city && city !== prov ? city : '');
  if (addr.startsWith(prov)) return addr;
  if (district && addr.startsWith(district)) return prov + mid + addr;
  return prov + mid + (district || '') + addr;
}
const PHH = { 'User-Agent': 'calendar-atlas-verify/1.0' };
export async function photonReverse(lat, lon) {
  try { const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`, { signal: AbortSignal.timeout(12000), headers: PHH }); const j = await r.json(); const f = (j.features || [])[0]; if (!f) return null; const [flon, flat] = f.geometry.coordinates; return { name: f.properties?.name || '', cc: f.properties?.countrycode || '', osm: (f.properties?.osm_key || '') + '/' + (f.properties?.osm_value || ''), lat: flat, lon: flon, dist: dist([lat, lon], [flat, flon]) }; } catch { return null; }
}
export async function photonSearch(q) {
  try { const r = await fetch('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=5', { signal: AbortSignal.timeout(12000), headers: PHH }); const j = await r.json(); return (j.features || []).map(f => { const [lon, lat] = f.geometry.coordinates; return { name: f.properties?.name || '', cc: f.properties?.countrycode || '', osm: (f.properties?.osm_key || '') + '/' + (f.properties?.osm_value || ''), lat, lon }; }); } catch { return []; }
}
