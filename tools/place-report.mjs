// 生成统一的地点匹配报告：候选表 + 待人工清单 + 统计。
// 用法：node tools/place-report.mjs --candidates temps/地点候选_待确认_x.csv --manual temps/地点待人工匹配_x.csv [--out temps/地点匹配报告_x.md]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCSV} from '../lib/data-formats.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const candFile = path.resolve(root, arg('--candidates', ''));
const manualArg = arg('--manual', '');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '').replace(/^20/, '');
const out = path.resolve(root, arg('--out', `temps/地点匹配报告_${stamp}.md`));
const cands = candFile && argv.includes('--candidates') ? parseCSV(await fs.readFile(candFile, 'utf8')).places : [];
const manuals = [];
if (manualArg) for (const p of manualArg.split(',').map(s => s.trim()).filter(Boolean)) {
  try { manuals.push(...parseCSV(await fs.readFile(path.resolve(root, p), 'utf8'), ['calendar_name']).places); } catch { }
}
const md = [`# 地点匹配报告（${new Date().toISOString().slice(0, 10)}）`, ''];
md.push(`候选 ${cands.length}（需逐条确认 confirmed=yes 后才能合并）；待人工 ${manuals.length}。`, '');
md.push('## 一、候选项（confirmed 默认 no）', '');
md.push('| 状态 | 来源 | 置信 | 最终名称 | 别名 | 地址 | 经纬度 | 首末次 |');
md.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of cands) md.push(`| ${c.confirmed || 'no'} | ${c.source || ''} | ${c.confidence || ''} | ${c.location} | ${c.aliases || ''} | ${c.address || ''} | ${c.lat},${c.lon} | ${c.firstShown}~${c.lastShown} |`);
md.push('', '## 二、待人工匹配（低置信/未匹配）', '');
md.push('| 日历名称 | 原因 | 最佳候选 | 地址 | 经纬度 |');
md.push('| --- | --- | --- | --- | --- |');
for (const m of manuals) md.push(`| ${m.calendar_name} | ${m.reason || ''} | ${m.best_name || ''} | ${m.address || ''} | ${m.lat ?? ''},${m.lon ?? ''} |`);
md.push('', '> 候选确认方式：在候选 CSV 的 `confirmed` 列填 `yes`（或告诉我保留哪些），再运行 `npm run merge -- --rows <候选csv> --sort firstShown --write`。');
await fs.writeFile(out, md.join('\n'), 'utf8');
console.log(JSON.stringify({candidates: cands.length, manual: manuals.length, out: path.relative(root, out)}, null, 2));
