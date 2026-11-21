// Flow: 读取更新后的日历地点 → 按 config 黑名单过滤 → 与 place.csv 精确匹配 →
// 未命中先百度（免费），百度无结果/低置信再高德（可用 --no-amap、--max-amap 控制额度）。
// 产出：报告 MD、候选决策 CSV（需人工确认）、人工匹配清单 CSV。
// 用法：node tools/place-sync.mjs [--no-amap] [--max-amap 20] [--high 0.90] [--low 0.60]
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {atlasDataDirectory} from '../server/atlas-data.mjs';
import ICAL from '../vendor/ical.min.js';
import {details} from '../lib/core.js';
import {norm, coreSim, amapText, baiduText, loadPlaces, todayStr, rootURL} from './place-common.mjs';
import {readConfig} from '../server/config-store.mjs';
import {applyRules} from '../lib/organize.js';
import {stringifyCSV} from '../server/csv-store.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const HIGH = Number(arg('--high', '0.90'));
const LOW = Number(arg('--low', '0.60'));
const MAX_AMAP = Number(arg('--max-amap', '999999'));
const NO_AMAP = argv.includes('--no-amap');
const key = todayStr().replace(/\//g, '');
const OUT = arg('--out', `temps/日历地点同步报告_${key}.md`);
const DEC = arg('--decisions', `temps/日历地点同步_候选_${key}.csv`);
const MANUAL = arg('--manual', `temps/地点待人工匹配_${key}.csv`);
const icsFile = arg('--ics');
const calendar = icsFile ? new URL(icsFile, rootURL) : new URL('calendar.ics', atlasDataDirectory());
const comp = new ICAL.Component(ICAL.parse(await fs.readFile(calendar, 'utf8')));
try { for (const z of comp.getAllSubcomponents('vtimezone')) { const tz = new ICAL.Timezone(z); ICAL.TimezoneService.register(tz.tzid, tz); } } catch { }

const tokens = new Map();
for (const c of comp.getAllSubcomponents('vevent')) {
  let e; try { e = new ICAL.Event(c); } catch { continue; }
  const s = e.startDate; if (!s) continue; const k = s.year * 10000 + s.month * 100 + s.day;
  let det; try { det = details(e); } catch { continue; }
  for (const t of det.places) { const n = norm(t); if (!n) continue; const o = tokens.get(n) || { name: t, first: k, last: k, count: 0 }; o.first = Math.min(o.first, k); o.last = Math.max(o.last, k); o.count++; tokens.set(n, o); }
}
// 按 config 的事件/地点黑名单过滤
{
  const cfg = await readConfig(fileURLToPath(atlasDataDirectory()));
  const eventsForRules = [];
  for (const c of comp.getAllSubcomponents('vevent')) {
    try { const e = new ICAL.Event(c); const det = details(e); eventsForRules.push({...det, start: e.startDate?.toJSDate() || new Date(0), uid: e.uid}); } catch { }
  }
  const allowed = new Set(applyRules(eventsForRules, cfg, true).events.flatMap(e => e.places.map(norm)));
  for (const n of [...tokens.keys()]) if (!allowed.has(n)) tokens.delete(n);
}

const db = await loadPlaces();
const idx = new Set();
for (const p of db.places) { idx.add(norm(p.location)); for (const a of String(p.aliases || '').split(/[;；]/).map(s => s.trim()).filter(Boolean)) idx.add(norm(a)); }

const direct = [], candidates = [], manual = [];
let amapCalls = 0, amapSkipped = 0;
for (const [n, o] of tokens) {
  if (idx.has(n)) { direct.push(o); continue; }
  // 1) 百度优先（免费）
  let cands = [...(await baiduText(o.name, 0))];
  if (!cands.length) cands = [...(await baiduText(o.name, 289))];
  const baiduBest = cands.map(c => ({...c, sim: coreSim(o.name, c.name)})).sort((a, b) => b.sim - a.sim)[0] || null;
  const baiduExact = cands.find(c => norm(c.name) === n);
  // 2) 百度无精确同名且置信不足时，才用高德兜底
  if (!baiduExact && (!baiduBest || baiduBest.sim < HIGH)) {
    if (NO_AMAP || amapCalls >= MAX_AMAP) { amapSkipped++; }
    else {
      try { const more = await amapText(o.name); amapCalls++; if (more.length) cands.push(...more); }
      catch { amapCalls++; }
    }
  }
  const exact = cands.find(c => norm(c.name) === n);
  if (exact) {
    candidates.push({ location_old: o.name, action: 'add', new_name: exact.name, lat: exact.lat.toFixed(6), lon: exact.lon.toFixed(6), adcode: exact.adcode || '', address: exact.address || '', sim: '1.00', confidence: 'exact', source: exact.src, matched_by: 'exact', note: '精确同名' });
    continue;
  }
  const best = cands.map(c => ({...c, sim: coreSim(o.name, c.name)})).sort((a, b) => b.sim - a.sim)[0] || null;
  if (best && best.sim >= HIGH) {
    candidates.push({ location_old: o.name, action: 'rename', new_name: best.name, lat: best.lat.toFixed(6), lon: best.lon.toFixed(6), adcode: best.adcode || '', address: best.address || '', sim: best.sim.toFixed(2), confidence: 'high', source: best.src, matched_by: 'similar', note: '高置信相似' });
  } else if (best && best.sim >= LOW) {
    manual.push({ calendar_name: o.name, best_name: best.name, address: best.address || '', adcode: best.adcode || '', lat: best.lat, lon: best.lon, sim: best.sim.toFixed(2), source: best.src, reason: `低置信(${best.sim.toFixed(2)})`, alternatives: cands.map(c => `${c.name}@${c.src}`).slice(0, 3).join(' | ') });
  } else {
    manual.push({ calendar_name: o.name, best_name: best?.name || '', address: best?.address || '', adcode: best?.adcode || '', lat: best?.lat ?? '', lon: best?.lon ?? '', sim: best ? best.sim.toFixed(2) : '', source: best?.src || '', reason: '未匹配', alternatives: cands.map(c => `${c.name}@${c.src}`).slice(0, 3).join(' | ') });
  }
}

const high = candidates.filter(c => c.confidence === 'high').length;
const exactN = candidates.filter(c => c.confidence === 'exact').length;
const md = [
  `# 日历地点同步报告（${todayStr()}）`, '',
  `已按 config.json 事件/地点黑名单过滤。去重地点 ${tokens.size}；直接命中 ${direct.length}；候选 ${candidates.length}（精确 ${exactN}、高置信 ${high}）；待人工 ${manual.length}。`,
  `检索顺序：百度优先；百度无精确同名且相似度 < ${HIGH} 时才用高德。本轮高德调用 ${amapCalls} 次${amapSkipped ? `，跳过 ${amapSkipped} 个` : ''}。`, '',
  '## 一、候选项（需逐条确认后才可加入 place.csv）', '',
];
for (const c of candidates) md.push(`- **${c.location_old}** → \`${c.new_name}\`（${c.source}/${c.confidence}/${c.sim} ${c.lat},${c.lon} adcode ${c.adcode || '—'}）`);
md.push('', '## 二、待人工匹配（低置信或未匹配）', '');
for (const m of manual) md.push(`- **${m.calendar_name}**（${m.reason}${m.best_name ? `；最佳：${m.best_name}@${m.source}` : ''}）候选：${m.alternatives || '无'}`);
await fs.writeFile(new URL(OUT, rootURL), md.join('\n'));

await fs.writeFile(new URL(DEC, rootURL), stringifyCSV({
  headers: ['location_old', 'action', 'new_name', 'lat', 'lon', 'adcode', 'address', 'sim', 'confidence', 'source', 'matched_by', 'note'],
  places: candidates,
}));
await fs.writeFile(new URL(MANUAL, rootURL), stringifyCSV({
  headers: ['calendar_name', 'best_name', 'address', 'adcode', 'lat', 'lon', 'sim', 'source', 'reason', 'alternatives'],
  places: manual,
}));
console.log(JSON.stringify({ tokens: tokens.size, direct: direct.length, candidates: candidates.length, exact: exactN, high, manual: manual.length, amapCalls, amapSkipped, out: OUT, decisions: DEC, manualOut: MANUAL }, null, 2));
