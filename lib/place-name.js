// 统一的名称规范化。不同场景对“同名”的宽严不同，集中在这里，避免各处各写一套。
//   search  —— 展示与搜索：保留空格，仅统一大小写与全半角。
//   compact —— 地点身份比较：去空白，用于 place.csv 去重、地点索引。
//   loose   —— 模糊匹配：连标点/符号一起去掉，用于地图候选名比对（照片/核验）。
const base = s => String(s ?? '').normalize('NFKC');
export const search = s => base(s).trim().toLowerCase();
export const compact = s => base(s).toLowerCase().replace(/\s+/g, '').trim();
export const loose = s => base(s).toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
export const normalizePlace = compact;
