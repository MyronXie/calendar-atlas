// Export phone-importable data files from user-data/ into mobile-data/ (place.json, calendar.ics, config.json).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV} from '../csv-store.mjs';
import {readConfig} from '../config-store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'mobile-data');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
const db = parseCSV(await fs.readFile(path.join(root, 'user-data', 'place.csv'), 'utf8'));
await fs.writeFile(path.join(out, 'place.json'), JSON.stringify({ version: 'static', headers: db.headers, places: db.places, file: 'place.json' }));
const cfg = await readConfig(path.join(root, 'user-data'));
await fs.writeFile(path.join(out, 'config.json'), JSON.stringify(cfg));
await fs.copyFile(path.join(root, 'user-data', 'calendar.ics'), path.join(out, 'calendar.ics'));
console.log(JSON.stringify({ out, placeRows: db.places.length, files: ['place.json', 'calendar.ics', 'config.json'] }));
