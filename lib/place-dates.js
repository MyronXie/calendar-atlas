// 用日历（含重复事件展开）计算每个地点的首次/末次出现日期。
import {parseCalendar, expand} from './core.js';
import {compact as norm} from './place-name.js';

export function placeDateRanges(text) {
 const events = parseCalendar(text);
 let min = Infinity, max = -Infinity;
 for (const e of events) {
  const d = e.startDate?.toJSDate();
  if (d && !Number.isNaN(+d)) { const t = +d; if (t < min) min = t; if (t > max) max = t; }
 }
 if (!Number.isFinite(min)) return new Map();
 const from = new Date(min - 366 * 864e5), to = new Date(max + 366 * 864e5);
 const {events: expanded} = expand(events, from, to, true);
 const map = new Map();
 for (const ev of expanded) {
  const d = ev.start;
  if (!(d instanceof Date) || Number.isNaN(+d)) continue;
  for (const name of ev.places || []) {
   const k = norm(name); if (!k) continue;
   const o = map.get(k) || {first: d, last: d};
   if (d < o.first) o.first = d;
   if (d > o.last) o.last = d;
   map.set(k, o);
  }
 }
 return map;
}

export function fmtDate(d) {
 return `${String(d.getFullYear()).slice(-2)}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
