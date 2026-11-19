// Flow 1: read updated calendar, match with place (location+aliases); for unmatched, map-verify and
// produce an MD report + decision CSV. Does NOT modify place.csv.
// Usage: AMAP_KEY=xxx node tools/place-sync.mjs [--out reports/..md] [--decisions reports/..csv]
import fs from 'node:fs/promises';
import {atlasDataDirectory} from '../atlas-data.mjs';
import ICAL from '../vendor/ical.min.js';
import {details} from '../core.js';
import {norm, coreSim, amapText, baiduText, loadPlaces, fmtKey, todayStr, rootURL} from './place-common.mjs';
import {stringifyCSV} from '../csv-store.mjs';
const argv = process.argv.slice(2); const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const key = todayStr().replace(/\//g, '');
const OUT = arg('--out', `reports/日历地点同步报告_${key}.md`);
const DEC = arg('--decisions', `reports/日历地点同步_决策_${key}.csv`);
const icsFile = arg('--ics');
const calendar = icsFile?new URL(icsFile,rootURL):new URL('calendar.ics',atlasDataDirectory());
const comp = new ICAL.Component(ICAL.parse(await fs.readFile(calendar, 'utf8')));
try { for (const z of comp.getAllSubcomponents('vtimezone')) { const tz = new ICAL.Timezone(z); ICAL.TimezoneService.register(tz.tzid, tz); } } catch { }
const tokens = new Map(); // norm -> {name, first, last, count}
for (const c of comp.getAllSubcomponents('vevent')) {
  let e; try { e = new ICAL.Event(c); } catch { continue; } const s = e.startDate; if (!s) continue; const k = s.year * 10000 + s.month * 100 + s.day;
  let det; try { det = details(e); } catch { continue; }
  for (const t of det.places) { const n = norm(t); if (!n) continue; const o = tokens.get(n) || { name: t, first: k, last: k, count: 0 }; o.first = Math.min(o.first, k); o.last = Math.max(o.last, k); o.count++; tokens.set(n, o); }
}
const db = await loadPlaces();
const idx = new Set(); for (const p of db.places) { idx.add(norm(p.location)); for (const a of String(p.aliases || '').split(/[;；]/).map(s => s.trim()).filter(Boolean)) idx.add(norm(a)); }
const direct = [], addList = [], renameList = [], unmatched = [];
for (const [n, o] of tokens) {
  if (idx.has(n)) { direct.push(o); continue; }
  let cands = [...(await amapText(o.name)), ...(await baiduText(o.name))];
  const exact = cands.find(c => norm(c.name) === n);
  if (exact) { addList.push({ token: o.name, new: exact.name, lat: exact.lat, lon: exact.lon, adcode: exact.adcode, src: exact.src, first: o.first, last: o.last }); continue; }
  const best = cands.map(c => ({ ...c, sim: coreSim(o.name, c.name) })).filter(c => c.sim >= 0.6).sort((a, b) => b.sim - a.sim)[0];
  if (best) { renameList.push({ token: o.name, new: best.name, lat: best.lat, lon: best.lon, adcode: best.adcode, sim: best.sim, src: best.src, addr: best.address, first: o.first, last: o.last }); continue; }
  unmatched.push({ token: o.name, count: o.count, top: cands.slice(0, 3).map(c => `${c.name}@${c.src}`) });
}
const md = [`# 日历地点同步报告（${todayStr()}）`, '', `日历去重地点 ${tokens.size}；直接匹配 ${direct.length}；建议新增 ${addList.length}；建议改名 ${renameList.length}；无法匹配 ${unmatched.length}。`, '', '## 一、建议新增（日历有、库里没有，地图可确认）', ''];
for (const x of addList) md.push(`- **${x.token}** → \`${x.new}\`（${x.src} ${x.lat.toFixed(5)},${x.lon.toFixed(5)} adcode ${x.adcode||''}）首次${fmtKey(x.first)} 末次${fmtKey(x.last)}`);
md.push('', '## 二、建议改名匹配（名称有差异，同店）', '');
for (const x of renameList) md.push(`- **${x.token}** → \`${x.new}\`（核心相似${x.sim.toFixed(2)}；${x.src} ${x.lat.toFixed(5)},${x.lon.toFixed(5)}；${x.addr||''}）`);
md.push('', '## 三、无法匹配（需人工判断）', '');
for (const x of unmatched) md.push(`- **${x.token}**（出现${x.count}次）候选：${x.top.join('；') || '无'}`);
await fs.writeFile(new URL(OUT, rootURL), md.join('\n'));
const rows = [
  ...addList.map(x => ({ location_old: x.token, action: 'add', new_name: x.new, lat: x.lat.toFixed(6), lon: x.lon.toFixed(6), adcode: x.adcode, note: '地图确认新增' })),
  ...renameList.map(x => ({ location_old: x.token, action: 'rename', new_name: x.new, lat: x.lat.toFixed(6), lon: x.lon.toFixed(6), adcode: x.adcode, note: '改名匹配' })),
];
await fs.writeFile(new URL(DEC, rootURL), stringifyCSV({ headers: ['location_old', 'action', 'new_name', 'lat', 'lon', 'adcode', 'note'], places: rows }));
console.log(JSON.stringify({ tokens: tokens.size, direct: direct.length, add: addList.length, rename: renameList.length, unmatched: unmatched.length, out: OUT, decisions: DEC }, null, 2));
