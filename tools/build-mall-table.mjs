// 生成/更新「主要商场」表 atlas-data/mall.csv（location,address,lat,lon）。
// 数据来源：本地 place.csv（type=shop 等）+ 已有高德/OSM 查询缓存，全部为已完成查询的免费数据，不消耗高德额度。
// 目的：把「商场/商圈」单独成表，供照片地点匹配时优先落位到商场，而不是落到商场里的住宿/店铺。
// 用法: node tools/build-mall-table.mjs [--out atlas-data/mall.csv]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../csv-store.mjs';
import {loadPlaces, norm, rootURL} from './place-common.mjs';

const projectRoot = fileURLToPath(rootURL);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', path.join(projectRoot, 'atlas-data', 'mall.csv'));
const CACHE = arg('--cache', path.join(projectRoot, 'reports', '.photo-amap-cache.json'));

const MALL_RE = /购物中心|商场|商城|百货|购物广场|商业广场|城市广场|财富广场|大悦城|来福士|IFC|iapm|太古里|太古汇|恒隆|久光|环球港|美罗城|巴黎春天|置地|日月光|合生汇|K11|环贸|悦荟|百盛|银泰|宝龙广场|宝龙城市广场|爱琴海|龙湖天街|天街|印象城|万象城|万达广场|正大广场|瑞安|新天地|嘉里|世茂|国金中心|太平洋百货|新世界城|第一百货|仲盛世界|光启城|龙之梦|凯德|晶萃|高岛屋|SOHO|创趣场|世博源|又一城|步行街|商业街/;
const NOISE = /公园|度假区|乐园|动物世界|站前|文化广场|艺术广场|泼水|回归|口岸|秀水|烈士|纪念|中心广场|下沉广场|广场公园|景区|风景区|家电|超市|生鲜|菜场|路$|巷$|师范大学|大学城|校区/;
const STORE_ONLY = /小米之家|无印良品|Line Friends|U便利|Animate|Bic Camera|领克|优衣库|星巴克|麦当劳|肯德基|屈臣氏|名创优品|戴森|苹果|华为|小米|便利|体验中心|赋能中心|艺术中心|美术馆|展览馆|博物馆|车行|体验店|专卖|理发|剧本|密室|桌游|影城|影院|诊所|医院|学校|幼儿园|五金|商行|公司|培训|口才|家具|烟酒|茶叶|花房|批发|建材|营业厅|药房|联华|华联|永辉|大润发|家乐福|沃尔玛|盒马|农工商|家得利/;
const LODGING = /酒店|宾馆|民宿|公寓|客栈|青旅|hostel|hotel|apartment/;
const FOOD = /餐厅|火锅|烤肉|寿司|料理|面馆|面$|饭|菜|咖啡|茶饮|茶餐厅|小吃|烧烤|米粉|餐吧|食堂|甜品|烘焙|比萨|水饺|点心|烤鸭|串串/;

const key = s => norm(s);
// 判断是否“商场本体名”：排除住宿/餐饮/门店；若名称是“品牌(商场名)”形式（括号内是商场），则视为商场里的店，跳过。
function isMallName(name) {
  if (LODGING.test(name) || FOOD.test(name) || STORE_ONLY.test(name)) return false;
  if (NOISE.test(name)) return false;
  const m = name.match(/[（(]([^）)]*)[）)]/);
  if (m) {
    const core = name.slice(0, name.indexOf(m[0]));
    if (MALL_RE.test(m[1]) && !MALL_RE.test(core)) return false;
  }
  return MALL_RE.test(name);
}
const add = (map, row) => {
  const name = String(row.location || '').trim();
  if (!name) return;
  const k = key(name);
  if (map.has(k)) return;
  const lat = +row.lat, lon = +row.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  map.set(k, {location: name, address: String(row.address || '').trim(), lat: lat.toFixed(6), lon: lon.toFixed(6)});
};

const map = new Map();
// 1) place.csv：商场本体名，排除住宿/餐饮/纯门店
const db = await loadPlaces();
for (const p of db.places) {
  if (String(p.valid).toLowerCase() === 'no') continue;
  const name = p.location || '';
  if (!isMallName(name)) continue;
  if (p.type === 'stay' || p.type === 'food') continue;
  add(map, p);
}
// 2) 已有查询缓存：商场本体名、境内坐标
try {
  const cache = JSON.parse(await fs.readFile(CACHE, 'utf8'));
  for (const [k, v] of Object.entries(cache)) {
    const name = v.place || '';
    if (!isMallName(name)) continue;
    const [lon, lat] = k.split(',').map(Number);
    if (!(lat >= 18 && lat <= 54 && lon >= 73 && lon <= 135)) continue; // 只收境内
    add(map, {location: name, address: v.address || '', lat, lon});
  }
} catch { }

const rows = [...map.values()].sort((a, b) => a.location.localeCompare(b.location, 'zh'));
await fs.mkdir(path.dirname(OUT), {recursive: true});
await fs.writeFile(OUT, stringifyCSV({headers: ['location', 'address', 'lat', 'lon'], places: rows}));
console.log(JSON.stringify({out: OUT, malls: rows.length}, null, 2));
