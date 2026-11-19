// Dependency-free metadata (EXIF) reader/writer for JPEG and HEIC.
//  parseExif(buffer)  -> for JPEG (GPS + DateTimeOriginal)
//  parseHeic(buffer)  -> for HEIC/HEIF (ISO BMFF 'meta' -> iinf/iloc/idat)
//  buildExifJpeg / buildHeicWithExif -> test fixtures
const TYPESIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const concat = (...arrs) => { let n = 0; for (const a of arrs) n += a.length; const out = new Uint8Array(n); let p = 0; for (const a of arrs) { out.set(a, p); p += a.length; } return out; };
const str4 = (dv, p) => String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));

export function parseTiffBuffer(u8) {
  if (!u8 || u8.length < 8) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const bo = dv.getUint16(0); if (bo !== 0x4949 && bo !== 0x4D4D) return null;
  return parseTiff(dv, 0);
}

function parseTiff(dv, base) {
  const bo = dv.getUint16(base); const le = bo === 0x4949;
  if (!le && bo !== 0x4D4D) return null;
  const get16 = o => dv.getUint16(base + o, le);
  const get32 = o => dv.getUint32(base + o, le);
  if (get16(2) !== 42) return null;
  const ifd0 = get32(4);
  const readVal = (type, count, vpos) => {
    const size = (TYPESIZE[type] || 1) * count;
    const pos = size <= 4 ? vpos : get32(vpos);
    if (type === 2) { let s = ''; for (let i = 0; i < count; i++) { const c = dv.getUint8(base + pos + i); if (c === 0) break; s += String.fromCharCode(c); } return s; }
    if (type === 3) { const a = []; for (let i = 0; i < count; i++) a.push(get16(pos + i * 2)); return a; }
    if (type === 4) { const a = []; for (let i = 0; i < count; i++) a.push(get32(pos + i * 4)); return a; }
    if (type === 5) { const a = []; for (let i = 0; i < count; i++) { const n = get32(pos + i * 8), d = get32(pos + i * 8 + 4); a.push(d ? n / d : 0); } return a; }
    if (type === 9) { const a = []; for (let i = 0; i < count; i++) a.push(dv.getInt32(base + pos + i * 4, le)); return a; }
    if (type === 10) { const a = []; for (let i = 0; i < count; i++) { const n = dv.getInt32(base + pos + i * 8, le), d = dv.getInt32(base + pos + i * 8 + 4, le); a.push(d ? n / d : 0); } return a; }
    return null;
  };
  const readIFD = off => { const cnt = get16(off); const map = {}; for (let i = 0; i < cnt; i++) { const e = off + 2 + i * 12; map[get16(e)] = readVal(get16(e + 2), get32(e + 4), e + 8); } return map; };
  const one = v => Array.isArray(v) ? v[0] : v;
  const m0 = readIFD(ifd0);
  let dateTime = null, lat = null, lon = null;
  if (m0[0x8769] != null) { const ex = readIFD(one(m0[0x8769])); if (ex[0x9003]) dateTime = ex[0x9003]; }
  if (!dateTime && m0[0x0132]) dateTime = m0[0x0132];
  if (m0[0x8825] != null) {
    const g = readIFD(one(m0[0x8825])); const la = g[2], lo = g[4];
    if (Array.isArray(la) && Array.isArray(lo)) {
      const dms = a => (a[0] || 0) + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
      lat = dms(la); lon = dms(lo);
      if (String(g[1] || '').toUpperCase() === 'S') lat = -lat;
      if (String(g[3] || '').toUpperCase() === 'W') lon = -lon;
    }
  }
  return { lat, lon, dateTime: dateTime ? String(dateTime).trim() : null };
}

export function parseExif(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 4) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 0xFFD8) return null;
  let off = 2;
  while (off + 4 <= u8.length) {
    if (dv.getUint8(off) !== 0xFF) break;
    const marker = dv.getUint16(off);
    if (marker === 0xFFD9 || marker === 0xFFDA) break;
    if (marker === 0xFF01 || (marker >= 0xFFD0 && marker <= 0xFFD7)) { off += 2; continue; }
    const len = dv.getUint16(off + 2);
    if (marker === 0xFFE1) { let t = ''; for (let i = 0; i < 6; i++) t += String.fromCharCode(dv.getUint8(off + 4 + i)); if (t === 'Exif\0\0') return parseTiff(dv, off + 4 + 6); }
    off += 2 + len;
  }
  return null;
}

// ---- HEIC (ISO BMFF) ----
function boxes(dv, start, end) {
  const out = []; let p = start;
  while (p + 8 <= end) {
    let size = dv.getUint32(p); const type = str4(dv, p + 4); let hs = 8;
    if (size === 1) { size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12); hs = 16; }
    else if (size === 0) size = end - p;
    if (size < hs || p + size > end) break;
    out.push({ type, start: p, payloadStart: p + hs, payloadEnd: p + size }); p += size;
  }
  return out;
}
const readN = (dv, p, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + dv.getUint8(p + i); return v; };
function parseIloc(dv, box) {
  const p0 = box.payloadStart; const ver = dv.getUint8(p0); let p = p0 + 4;
  const b1 = dv.getUint8(p++), b2 = dv.getUint8(p++);
  const offsetSize = b1 >> 4, lengthSize = b1 & 0xF, baseSize = b2 >> 4, indexSize = (ver === 1 || ver === 2) ? (b2 & 0xF) : 0;
  const itemCount = ver < 2 ? dv.getUint16(p) : dv.getUint32(p); p += ver < 2 ? 2 : 4;
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    const id = ver < 2 ? dv.getUint16(p) : dv.getUint32(p); p += ver < 2 ? 2 : 4;
    let cm = 0; if (ver === 1 || ver === 2) { cm = dv.getUint16(p) & 0xF; p += 2; }
    p += 2; // data_reference_index
    let base = 0; if (baseSize) { base = readN(dv, p, baseSize); p += baseSize; }
    const ec = dv.getUint16(p); p += 2; const extents = [];
    for (let j = 0; j < ec; j++) { if ((ver === 1 || ver === 2) && indexSize) p += indexSize; const off = readN(dv, p, offsetSize); p += offsetSize; const len = readN(dv, p, lengthSize); p += lengthSize; extents.push({ offset: off, length: len }); }
    items.push({ id, cm, base_offset: base, extents });
  }
  return { items };
}
function tryTiffFromExifItem(data) {
  for (const b of [0, 4, 6]) { if (data.length > b + 8) { const a = data[b], c = data[b + 1]; if ((a === 0x49 && c === 0x49) || (a === 0x4D && c === 0x4D)) { const r = parseTiffBuffer(data.subarray(b)); if (r && (r.lat != null || r.dateTime)) return r; } } }
  return null;
}
function scanForExif(u8) {
  const needle = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  for (let i = 0; i + 6 < u8.length; i++) { let ok = true; for (let j = 0; j < 6; j++) if (u8[i + j] !== needle[j]) { ok = false; break; } if (ok) { const r = parseTiffBuffer(u8.subarray(i + 6)); if (r) return r; } }
  for (let i = 0; i + 8 < u8.length; i++) { const a = u8[i], b = u8[i + 1], c = u8[i + 2], d = u8[i + 3]; if ((a === 0x4D && b === 0x4D && c === 0 && d === 0x2A) || (a === 0x49 && b === 0x49 && c === 0x2A && d === 0)) { const r = parseTiffBuffer(u8.subarray(i)); if (r) return r; } }
  return null;
}
export function parseHeic(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const top = boxes(dv, 0, u8.length);
  const meta = top.find(b => b.type === 'meta');
  if (meta) {
    const kids = boxes(dv, meta.payloadStart + 4, meta.payloadEnd);
    const iinf = kids.find(k => k.type === 'iinf'), iloc = kids.find(k => k.type === 'iloc'), idat = kids.find(k => k.type === 'idat');
    let exifID = null;
    if (iinf) {
      let p = iinf.payloadStart + 4; const cnt = dv.getUint16(p); p += 2;
      const infes = boxes(dv, p, iinf.payloadEnd);
      for (const inf of infes) { if (inf.type !== 'infe') continue; const ver = dv.getUint8(inf.payloadStart); const id = dv.getUint16(inf.payloadStart + 4); let type = null; if (ver >= 2) type = str4(dv, inf.payloadStart + 8); if (type === 'Exif') exifID = id; }
    }
    if (exifID != null && iloc) {
      const info = parseIloc(dv, iloc); const it = info.items.find(x => x.id === exifID);
      if (it && it.extents.length) {
        const ext = it.extents[0]; const base = it.base_offset || 0;
        const off = it.cm === 1 ? (idat ? idat.payloadStart + base + ext.offset : -1) : (base + ext.offset);
        if (off >= 0 && off + ext.length <= u8.length) { const r = tryTiffFromExifItem(u8.subarray(off, off + ext.length)); if (r) return r; }
      }
    }
  }
  return scanForExif(u8);
}

// ---- builders (test fixtures) ----
export function buildTiffBytes({ lat, lon, dateTime = '2024:05:01 09:30:00' }) {
  const total = 178; const tiff = new Uint8Array(total); const dv = new DataView(tiff.buffer);
  const w16 = (o, v) => dv.setUint16(o, v, true); const w32 = (o, v) => dv.setUint32(o, v, true);
  tiff[0] = 0x49; tiff[1] = 0x49; w16(2, 42); w32(4, 8);
  w16(8, 2); w16(10, 0x8769); w16(12, 4); w32(14, 1); w32(18, 38); w16(22, 0x8825); w16(24, 4); w32(26, 1); w32(30, 76); w32(34, 0);
  w16(38, 1); w16(40, 0x9003); w16(42, 2); w32(44, 20); w32(48, 56); w32(52, 0);
  const ds = (String(dateTime) + '                   ').slice(0, 19) + '\0'; for (let i = 0; i < 20; i++) tiff[56 + i] = ds.charCodeAt(i) & 0xFF;
  w16(76, 4);
  w16(78, 1); w16(80, 2); w32(82, 2); w32(86, 0); tiff[86] = 0x4E; tiff[87] = 0;
  w16(90, 2); w16(92, 5); w32(94, 3); w32(98, 130);
  w16(102, 3); w16(104, 2); w32(106, 2); w32(110, 0); tiff[110] = 0x45; tiff[111] = 0;
  w16(114, 4); w16(116, 5); w32(118, 3); w32(122, 154); w32(126, 0);
  const rat = (pos, val) => { const x0 = Math.abs(val); const d = Math.floor(x0); const m0 = Math.floor((x0 - d) * 60); const sec = ((x0 - d) * 60 - m0) * 60; const arr = [[d, 1], [m0, 1], [Math.round(sec * 1000000), 1000000]]; for (let i = 0; i < 3; i++) { w32(pos + i * 8, arr[i][0]); w32(pos + i * 8 + 4, arr[i][1]); } };
  rat(130, lat == null ? 0 : lat); rat(154, lon == null ? 0 : lon);
  return tiff;
}
export function buildExifJpeg({ lat, lon, dateTime } = {}) {
  const tiff = buildTiffBytes({ lat, lon, dateTime });
  const app1Data = concat(Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), tiff);
  const segLen = app1Data.length + 2;
  return Buffer.from(concat(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE1, (segLen >> 8) & 0xFF, segLen & 0xFF]), app1Data, Uint8Array.from([0xFF, 0xD9])));
}
export function buildHeicWithExif({ lat, lon, dateTime } = {}) {
  const tiff = buildTiffBytes({ lat, lon, dateTime });
  const exifPayload = concat(new Uint8Array(4), tiff);
  const box = (type, payload) => { const b = new Uint8Array(8 + payload.length); const dv = new DataView(b.buffer); dv.setUint32(0, 8 + payload.length); for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i); b.set(payload, 8); return b; };
  const ftypPayload = new Uint8Array(16); ftypPayload.set([0x68, 0x65, 0x69, 0x63], 0); new DataView(ftypPayload.buffer).setUint32(4, 0); ftypPayload.set([0x6D, 0x69, 0x66, 0x31], 8); ftypPayload.set([0x68, 0x65, 0x69, 0x63], 12);
  const infePayload = new Uint8Array(4 + 2 + 2 + 4 + 5); { const dv = new DataView(infePayload.buffer); infePayload[0] = 2; dv.setUint16(4, 1); dv.setUint16(6, 0); infePayload.set([0x45, 0x78, 0x69, 0x66], 8); infePayload.set([0x45, 0x78, 0x69, 0x66, 0x00], 12); }
  const infe = box('infe', infePayload);
  const iinfPayload = new Uint8Array(6); new DataView(iinfPayload.buffer).setUint16(4, 1);
  const iinf = box('iinf', concat(iinfPayload, infe));
  const ilocPayload = new Uint8Array(24); { const dv = new DataView(ilocPayload.buffer); ilocPayload[0] = 1; ilocPayload[4] = 0x44; ilocPayload[5] = 0x00; dv.setUint16(6, 1); dv.setUint16(8, 1); dv.setUint16(10, 1); dv.setUint16(12, 0); dv.setUint16(14, 1); dv.setUint32(16, 0); dv.setUint32(20, exifPayload.length); }
  const iloc = box('iloc', ilocPayload);
  const idat = box('idat', exifPayload);
  const meta = box('meta', concat(new Uint8Array(4), iinf, iloc, idat));
  return Buffer.from(concat(box('ftyp', ftypPayload), meta));
}
