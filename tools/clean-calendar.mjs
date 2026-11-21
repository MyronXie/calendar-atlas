// 清理 atlas-data/calendar.ics 中由 Outlook/Word 生成的 X-ALT-DESC HTML 正文。
// 这些 X-ALT-DESC 与 DESCRIPTION 内容重复，且约 97% 是 Word 样式样板，纯属冗余。
// 默认只做预览（不改文件）；加 --write 才会覆盖主文件，覆盖前自动备份到 atlas-data/.backups/。
// 用法：
//   node tools/clean-calendar.mjs                 # 预览统计，不写文件
//   node tools/clean-calendar.mjs --write         # 备份后覆盖 atlas-data/calendar.ics
//   node tools/clean-calendar.mjs --out=a.ics     # 清理结果写到指定文件（不碰主文件）

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ICAL from '../vendor/ical.min.js';
import {details} from '../lib/core.js';
import {atlasDataDirectory} from '../server/atlas-data.mjs';

const args = new Set(process.argv.slice(2));
const write = args.has('--write');
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));

const dataDir = atlasDataDirectory();
const source = new URL('calendar.ics', dataDir);
const raw = fs.readFileSync(source, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';

// 逐物理行删除 X-ALT-DESC 属性及其折叠续行（续行以空格或制表符开头）。
function stripAltDesc(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let removed = 0;
  let skipping = false;
  for (const l of lines) {
    if (/^X-ALT-DESC[;:]/.test(l)) { removed++; skipping = true; continue; }
    if (skipping && /^[ \t]/.test(l)) { removed++; continue; }
    skipping = false;
    kept.push(l);
  }
  return {text: kept.join(eol), removedLines: removed};
}

const {text: cleaned, removedLines} = stripAltDesc(raw);

// 用应用自身的解析逻辑对拍：删除前后每个事件的可视内容必须完全一致。
function snapshot(text) {
  const root = new ICAL.Component(ICAL.parse(text));
  return root.getAllSubcomponents('vevent').map((c) => {
    const e = new ICAL.Event(c);
    const d = details(e);
    return JSON.stringify({
      uid: e.uid,
      start: e.startDate?.toString(),
      end: e.endDate?.toString(),
      allDay: e.startDate?.isDate,
      rrule: c.getFirstPropertyValue('rrule') ? JSON.stringify(c.getFirstPropertyValue('rrule')) : '',
      rec: c.getFirstPropertyValue('recurrence-id') ? String(c.getFirstPropertyValue('recurrence-id')) : '',
      title: d.title,
      partners: d.partners,
      places: d.places,
      note: d.note,
    });
  });
}

const before = snapshot(raw);
const after = snapshot(cleaned);
let diffs = 0;
for (let i = 0; i < Math.max(before.length, after.length); i++) if (before[i] !== after[i]) diffs++;
const remainingAlt = /^X-ALT-DESC[;:]/m.test(cleaned) ? 'yes' : 'no';

const summary = {
  mode: write ? 'write' : outArg ? 'out' : 'dry-run',
  source: fileURLToPath(source),
  originalBytes: Buffer.byteLength(raw),
  cleanedBytes: Buffer.byteLength(cleaned),
  savedBytes: Buffer.byteLength(raw) - Buffer.byteLength(cleaned),
  savedPct: +(100 * (Buffer.byteLength(raw) - Buffer.byteLength(cleaned)) / Buffer.byteLength(raw)).toFixed(1),
  removedLines,
  eventsBefore: before.length,
  eventsAfter: after.length,
  contentDiffs: diffs,
  remainingAltDesc: remainingAlt,
};

if (diffs !== 0 || before.length !== after.length || remainingAlt === 'yes') {
  console.error('校验失败：删除 X-ALT-DESC 后事件内容或数量发生变化，已中止写出。');
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

if (outArg) {
  const target = path.resolve(outArg.slice('--out='.length));
  fs.writeFileSync(target, cleaned, 'utf8');
  summary.output = target;
} else if (write) {
  const backupDir = new URL('.backups/', dataDir);
  fs.mkdirSync(fileURLToPath(backupDir), {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = fileURLToPath(new URL(`calendar.ics.${stamp}.bak`, backupDir));
  fs.copyFileSync(source, backup);
  fs.writeFileSync(source, cleaned, 'utf8');
  summary.backup = backup;
  summary.output = fileURLToPath(source);
}

console.log(JSON.stringify(summary, null, 2));
