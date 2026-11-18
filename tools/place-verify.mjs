// Flow 2: periodic validity re-check. Skips valid=no and valid dated < N months ago.
// Produces MD report + decision CSV. Does NOT modify place.csv.
// Usage: AMAP_KEY=xxx node tools/place-verify.mjs [--months 3]
import fs from 'node:fs/promises';
import {norm, coreSim, dist, amapText, amapAround, baiduText, photonReverse, photonSearch, loadPlaces, todayStr, parseDateYY, daysBetween, rootURL} from './place-common.mjs';
import {stringifyCSV} from '../csv-store.mjs';
const argv = process.argv.slice(2); const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const MONTHS = Number(arg('--months', 3)); const key = todayStr().replace(/\//g, '');
const OUT = arg('--out', `reports/地点有效性核验报告_${key}.md`);
const DEC = arg('--decisions', `reports/地点有效性核验_决策_${key}.csv`);
const today = new Date();
const db = await loadPlaces();
const skipNo = [], skipFresh = [], keep = [], rename = [], closed = [], review = [];
for (const p of db.places) {
  if (String(p.valid).toLowerCase() === 'no') { skipNo.push(p); continue; }
  const d = parseDateYY(p.valid);
  if (d && daysBetween(d, today) < MONTHS * 30) { skipFresh.push(p); continue; }
  // verify
  const lat = +p.lat, lon = +p.lon;
  const overseas = Number.isFinite(lat) && Number.isFinite(lon) && !(lon >= 73 && lon <= 135 && lat >= 18 && lat <= 54);
  if (overseas) {
    const rev = await photonReverse(lat, lon); const fwd = await photonSearch(p.location);
    const fwdNear = fwd.map(f => ({ ...f, d: dist([lat, lon], [f.lat, f.lon]) })).sort((a, b) => a.d - b.d)[0];
    const strongFwd = fwdNear && fwdNear.d <= 800 && (coreSim(p.location, fwdNear.name) >= 0.6 || norm(fwdNear.name) === norm(p.location));
    const strongRev = rev && rev.dist <= 150 && coreSim(p.location, rev.name) >= 0.6;
    if (strongFwd || strongRev) keep.push(p); else review.push(p);
    continue;
  }
  let cands = [...(await amapText(p.location, p.adcode)), ...(await baiduText(p.location))];
  let near = []; if (Number.isFinite(lat) && Number.isFinite(lon)) near = await amapAround(lon, lat, 80);
  const exact = cands.find(c => norm(c.name) === norm(p.location));
  const rn = cands.map(c => ({ ...c, sim: coreSim(p.location, c.name) })).filter(c => c.sim >= 0.6 && norm(c.name) !== norm(p.location)).sort((a, b) => b.sim - a.sim)[0];
  const nearSame = near.find(n => norm(n.name) === norm(p.location) || coreSim(p.location, n.name) >= 0.7);
  if (exact || nearSame) { keep.push(p); }
  else if (rn) { rename.push({ p, to: rn }); }
  else if (near.length && near[0].dist <= 60) { closed.push({ p, near: near.slice(0, 2) }); }
  else { review.push(p); }
}
const md = [`# 地点有效性核验报告（${todayStr()}）`, '', `跳过：valid=no ${skipNo.length}；3个月内已核验 ${skipFresh.length}。需复核结果：建议存在 ${keep.length}；建议改名 ${rename.length}；疑似停业 ${closed.length}；待人工 ${review.length}。`, '', '## 一、建议存在（刷新 valid=今天）', ''];
for (const p of keep) md.push(`- ${p.location}（原 ${p.valid || '空'}）`);
md.push('', '## 二、建议改名', '');
for (const { p, to } of rename) md.push(`- ${p.location} → \`${to.name}\`（${to.src} ${to.lat.toFixed(5)},${to.lon.toFixed(5)}；核心相似${to.sim.toFixed(2)}）`);
md.push('', '## 三、疑似停业（原址现为他店）', '');
for (const { p, near } of closed) md.push(`- ${p.location}（原址80m现为：${near.map(n => n.name + '@' + n.dist + 'm').join('，')}）`);
md.push('', '## 四、待人工', '');
for (const p of review) md.push(`- ${p.location}`);
await fs.writeFile(new URL(OUT, rootURL), md.join('\n'));
const rows = [
  ...keep.map(p => ({ location_old: p.location, action: 'keep', new_name: '', lat: '', lon: '', adcode: '', note: '存在,刷新valid' })),
  ...rename.map(({ p, to }) => ({ location_old: p.location, action: 'rename', new_name: to.name, lat: to.lat.toFixed(6), lon: to.lon.toFixed(6), adcode: to.adcode || '', note: '改名' })),
  ...closed.map(({ p }) => ({ location_old: p.location, action: 'closed', new_name: '', lat: '', lon: '', adcode: '', note: '疑似停业' })),
];
await fs.writeFile(new URL(DEC, rootURL), stringifyCSV({ headers: ['location_old', 'action', 'new_name', 'lat', 'lon', 'adcode', 'note'], places: rows }));
console.log(JSON.stringify({ skipNo: skipNo.length, skipFresh: skipFresh.length, keep: keep.length, rename: rename.length, closed: closed.length, review: review.length, out: OUT, decisions: DEC }, null, 2));
