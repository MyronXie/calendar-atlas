// 确定性地为 place.csv 补 type / labels（默认只补空值，不覆盖已填内容）。
// 用法：node tools/place-classify.mjs [--file atlas-data/place.csv] [--all] [--write]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV, stringifyCSV} from '../lib/data-formats.js';
import {inferPlaceType, inferPlaceLabels, placeTypes} from '../lib/place-categories.js';
import {backupText, atomicWrite} from '../server/atomic-file.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const file = path.resolve(root, arg('--file', 'atlas-data/place.csv'));
const all = argv.includes('--all');
const write = argv.includes('--write');
const raw = await fs.readFile(file, 'utf8');
const db = parseCSV(raw);
let typed = 0, labeled = 0;
for (const p of db.places) {
  if (all || !p.type) { const t = inferPlaceType(p.location, p.address); if (t !== p.type) { p.type = t; typed++; } }
  if (all || !p.labels) { const labels = inferPlaceLabels(p.location, p.address).join('；') || placeTypes[p.type] || '其他'; if (labels && labels !== p.labels) { p.labels = labels; labeled++; } }
}
if (write) { await backupText(file, raw); await atomicWrite(file, stringifyCSV(db)); }
console.log(JSON.stringify({file, write, rows: db.places.length, typeFilled: typed, labelsFilled: labeled}, null, 2));
