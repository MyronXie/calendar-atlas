// Apply a decisions CSV to place.csv. Modes:
//   sync   : add/rename/keep from calendar sync; also recompute firstShown/lastShown for all from calendar.
//   verify : keep/rename/closed from validity check.
// Usage: node tools/place-apply.mjs --decisions <csv> --mode sync|verify
import fs from 'node:fs/promises';
import {parseCSV, stringifyCSV} from '../csv-store.mjs';
import ICAL from '../vendor/ical.min.js';
import {details} from '../core.js';
import {norm, loadPlaces, savePlaces, todayStr, fmtKey, rootURL} from './place-common.mjs';
const argv = process.argv.slice(2); const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const DEC = arg('--decisions'); const MODE = arg('--mode', 'verify');
if (!DEC) { console.error('need --decisions'); process.exit(1); }
const today = todayStr();
const db = await loadPlaces();
const dec = parseCSV(await fs.readFile(new URL(DEC, rootURL), 'utf8'), ['location_old']).places;
const byLoc = () => { const m = new Map(); for (const p of db.places) { m.set(p.location, p); for (const a of String(p.aliases || '').split(/[;；]/).map(s => s.trim()).filter(Boolean)) if (!m.has(a)) m.set(a, p); } return m; };
let added = 0, renamed = 0, closedn = 0, kept = 0, skipped = 0;
for (const d of dec) {
  const old = (d.location_old || '').trim(); const action = (d.action || '').trim(); const nn = (d.new_name || '').trim();
  const lat = d.lat, lon = d.lon, ad = d.adcode;
  if (action === 'add') {
    if (db.places.some(p => p.location === (nn || old))) { skipped++; continue; }
    const row = Object.fromEntries(db.headers.map(h => [h, '']));
    row.location = nn || old; if (lat && lon) { row.lat = String(lat); row.lon = String(lon); } if (ad) row.adcode = ad;
    row.valid = today; db.places.push(row); added++; continue;
  }
  const p = byLoc().get(old); if (!p) { skipped++; continue; }
  if (action === 'rename') {
    const al = new Set(String(p.aliases || '').split(/[;；]/).map(s => s.trim()).filter(Boolean)); if (old && old !== nn) al.add(old);
    p.aliases = [...al].filter(a => a && a !== nn).join('；'); p.location = nn;
    if (lat && lon) { p.lat = String(lat); p.lon = String(lon); } if (ad) p.adcode = ad; p.valid = today; renamed++;
  } else if (action === 'closed') { p.valid = 'no'; closedn++; }
  else if (action === 'keep') { if (lat && lon) { p.lat = String(lat); p.lon = String(lon); } if (ad) p.adcode = ad; p.valid = today; kept++; }
  else skipped++;
}
if (MODE === 'sync') {
  const comp = new ICAL.Component(ICAL.parse(await fs.readFile(new URL('user-data/calendar.ics', rootURL), 'utf8')));
  try { for (const z of comp.getAllSubcomponents('vtimezone')) { const tz = new ICAL.Timezone(z); ICAL.TimezoneService.register(tz.tzid, tz); } } catch { }
  const first = new Map(), last = new Map();
  for (const c of comp.getAllSubcomponents('vevent')) { let e; try { e = new ICAL.Event(c); } catch { continue; } const s = e.startDate; if (!s) continue; const k = s.year * 10000 + s.month * 100 + s.day; let det; try { det = details(e); } catch { continue; } for (const t of det.places) { const n = norm(t); if (!n) continue; const f = first.get(n); if (!f || k < f) first.set(n, k); const l = last.get(n); if (!l || k > l) last.set(n, k); } }
  for (const p of db.places) {
    let f = first.get(norm(p.location)), l = last.get(norm(p.location));
    if (!f || !l) { for (const a of String(p.aliases || '').split(/[;；]/).map(s => s.trim()).filter(Boolean)) { const nn = norm(a); if (!f) f = first.get(nn); if (!l) l = last.get(nn); } }
    if (f) p.firstShown = fmtKey(f); if (l) p.lastShown = fmtKey(l);
  }
}
const wrote = await savePlaces(db);
console.log(JSON.stringify({ mode: MODE, decisions: dec.length, added, renamed, closedn, kept, skipped, wrote }, null, 2));
