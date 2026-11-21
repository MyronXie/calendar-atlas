// 把 place-sync 的候选决策 CSV 转成"待确认候选表"：补 firstShown/lastShown（按日历，含重复事件）、
// valid=今天、type/labels，并加 confirmed=no / source / confidence 列。默认不写入 place.csv。
// 例外清单（atlas-data/place-overrides.json）：accept / reject / keepOriginal。
// 用法：node tools/place-screen.mjs --decisions temps/日历地点同步_候选_xxxx.csv [--high 0.90] [--out ...] [--rejected ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../lib/data-formats.js';
import {compact as norm} from '../lib/place-name.js';
import {inferPlaceType, inferPlaceLabels, placeTypes} from '../lib/place-categories.js';
import {placeDateRanges, fmtDate} from '../lib/place-dates.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
if (!argv.includes('--decisions')) { console.error('need --decisions <csv>'); process.exit(1); }
const decFile = path.resolve(root, arg('--decisions'));
const overridesFile = path.resolve(root, arg('--overrides', 'atlas-data/place-overrides.json'));
const HIGH = Number(arg('--high', '0.90'));
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '').replace(/^20/, '');
const outFile = path.resolve(root, arg('--out', `temps/地点候选_待确认_${stamp}.csv`));
const rejFile = path.resolve(root, arg('--rejected', `temps/地点候选_例外排除_${stamp}.csv`));
const today = new Date().toLocaleDateString('sv-SE').slice(2).replace(/-/g, '/');

const dec = parseCSV(await fs.readFile(decFile, 'utf8'), ['location_old']).places;
let overrides = {accept: [], reject: [], keepOriginal: []};
try { overrides = {...overrides, ...JSON.parse(await fs.readFile(overridesFile, 'utf8'))}; } catch (e) { if (e.code !== 'ENOENT') throw e; }
const setOf = k => new Set((overrides[k] || []).map(norm));
const ranges = placeDateRanges(await fs.readFile(path.join(root, 'atlas-data/calendar.ics'), 'utf8'));

const candidates = [], rejected = [];
function build(location, alias, d, confidence, note) {
 const dt = ranges.get(norm(d.location_old));
 const first = dt ? fmtDate(dt.first) : '', last = dt ? fmtDate(dt.last) : '';
 const type = inferPlaceType(location, d.address);
 const labels = inferPlaceLabels(location, d.address).join('；') || placeTypes[type] || '其他';
 candidates.push({
  confirmed: 'no', source: d.source || '', confidence,
  location, address: d.address || '', adcode: d.adcode || '', lat: d.lat, lon: d.lon,
  firstShown: first, lastShown: last, valid: today, type, labels,
  aliases: alias && alias !== location ? alias : '', note,
 });
}
for (const d of dec) {
 const token = (d.location_old || '').trim(); const official = (d.new_name || token).trim();
 const conf = d.confidence || (Number(d.sim) >= HIGH ? 'high' : 'exact');
 if (setOf('reject').has(norm(token))) { rejected.push({location_old: token, new_name: official, reason: '例外排除'}); continue; }
 if (setOf('keepOriginal').has(norm(token))) { build(token, official, d, conf, '保留原名，官方名作别名'); continue; }
 if (setOf('accept').has(norm(token)) || conf === 'exact' || conf === 'high' || Number(d.sim) >= HIGH) { build(official, token, d, conf, conf === 'exact' ? '精确同名' : '高置信相似'); continue; }
 rejected.push({location_old: token, new_name: official, reason: `低置信(${d.sim})`});
}
const headers = ['confirmed', 'source', 'confidence', 'location', 'address', 'adcode', 'lat', 'lon', 'firstShown', 'lastShown', 'valid', 'type', 'labels', 'aliases', 'note'];
await fs.writeFile(outFile, stringifyCSV({headers, places: candidates}), 'utf8');
await fs.writeFile(rejFile, stringifyCSV({headers: ['location_old', 'new_name', 'reason'], places: rejected}), 'utf8');
console.log(JSON.stringify({decisions: dec.length, candidates: candidates.length, rejected: rejected.length, out: path.relative(root, outFile), rejectedOut: path.relative(root, rejFile)}, null, 2));
