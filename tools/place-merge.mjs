// 把「新增地点行」合并进 place.csv：去重、补 type/labels、可选按 firstShown 排序，并备份后原子写入。
// 用法：node tools/place-merge.mjs --rows temps/新增地点_最终_高德补全_261121.csv [--file atlas-data/place.csv] [--sort firstShown] [--write] [--no-classify]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../lib/data-formats.js';
import {compact as norm} from '../lib/place-name.js';
import {inferPlaceType, inferPlaceLabels, placeTypes} from '../lib/place-categories.js';
import {backupText, atomicWrite} from '../server/atomic-file.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const rowsArg = arg('--rows');
if (!rowsArg) { console.error('need --rows <csv>'); process.exit(1); }
const file = path.resolve(root, arg('--file', 'atlas-data/place.csv'));
const rowsFile = path.resolve(root, rowsArg);
const write = argv.includes('--write');
const classify = !argv.includes('--no-classify');
const sortKey = arg('--sort', 'firstShown');

const raw = await fs.readFile(file, 'utf8');
const db = parseCSV(raw);
const incoming = parseCSV(await fs.readFile(rowsFile, 'utf8')).places;
const all = argv.includes('--all');
const confirmedOk = r => ['yes', 'y', '1', 'true'].includes(String(r.confirmed ?? '').toLowerCase());
const usable = all ? incoming : incoming.filter(confirmedOk);
const unconfirmed = incoming.length - usable.length;
const existing = new Set(db.places.map(p => norm(p.location)));
let added = 0, skipped = 0, typed = 0, labeled = 0;
for (const row of usable) {
  const name = String(row.location || '').trim();
  if (!name || existing.has(norm(name))) { skipped++; continue; }
  const out = Object.fromEntries(db.headers.map(h => [h, row[h] ?? '']));
  out.location = name;
  if (classify) {
    if (!out.type) { const t = inferPlaceType(out.location, out.address); if (t) { out.type = t; typed++; } }
    if (!out.labels) { const l = inferPlaceLabels(out.location, out.address).join('；') || placeTypes[out.type] || '其他'; out.labels = l; labeled++; }
  }
  db.places.push(out); existing.add(norm(name)); added++;
}
// 排序：默认按 firstShown 升序，空值排最后（YY/MM/DD 可字典序）
if (sortKey) {
  const key = p => String(p[sortKey] || '').trim();
  db.places = db.places.map((p, i) => ({p, i})).sort((a, b) => {
    const va = key(a.p) || '99/99/99', vb = key(b.p) || '99/99/99';
    return va === vb ? a.i - b.i : (va < vb ? -1 : 1);
  }).map(x => x.p);
}
if (write && added > 0) { await backupText(file, raw); await atomicWrite(file, stringifyCSV(db)); }
console.log(JSON.stringify({file, write, incoming: incoming.length, confirmed: usable.length, unconfirmed, added, skipped, typed, labeled, sort: sortKey, rowsAfter: db.places.length}, null, 2));
