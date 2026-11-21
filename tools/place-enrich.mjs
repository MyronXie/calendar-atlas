// 给地点的 address / adcode 补全：
// - 缺 address：用百度检索补（免费）
// - 缺 adcode：用高德「逆地理编码」补（省额度；不调用关键字/周边搜索）
// 用法：node tools/place-enrich.mjs --rows temps/新增地点_最终_xxxx.csv [--write] [--no-baidu] [--no-amap]
// 需要高德时先设置环境变量 AMAP_KEY。
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../lib/data-formats.js';
import {norm, coreSim, baiduText, regeoRegion, composeAddress} from './place-common.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const rowsFile = path.resolve(root, arg('--rows'));
if (!argv.includes('--rows')) { console.error('need --rows <csv>'); process.exit(1); }
const write = argv.includes('--write');
const useBaidu = !argv.includes('--no-baidu');
const useAmap = !argv.includes('--no-amap');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const headers = ['location','address','adcode','lat','lon','firstShown','lastShown','valid','type','labels','aliases'];
const rows = parseCSV(await fs.readFile(rowsFile, 'utf8')).places;
let addrBaidu = 0, addrAmap = 0, adcode = 0, fail = 0;

if (useBaidu) for (const r of rows) {
  if (r.address) continue;
  const cands = await baiduText(r.location, 0);
  const exact = cands.find(c => norm(c.name) === norm(r.location));
  const best = exact || cands.map(c => ({...c, sim: coreSim(r.location, c.name)})).filter(c => c.sim >= 0.85).sort((a, b) => b.sim - a.sim)[0];
  if (best && best.address) { r.address = best.address; addrBaidu++; }
}
if (useAmap) for (const r of rows) {
  if (r.adcode) continue;
  const lat = +r.lat, lon = +r.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { fail++; continue; }
  const reg = await regeoRegion(lon, lat);
  if (reg && reg.adcode) { r.adcode = reg.adcode; adcode++; if (!r.address) { r.address = composeAddress(reg, ''); addrAmap++; } }
  else fail++;
  await sleep(350);
}
if (write) await fs.writeFile(rowsFile, stringifyCSV({headers, places: rows}), 'utf8');
console.log(JSON.stringify({rows: rows.length, write, addrBaidu, addrAmap, adcode, amapFailed: fail}, null, 2));
