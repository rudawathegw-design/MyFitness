// Minimal Excel (.xlsx) writer — no libraries. Builds the SpreadsheetML parts and packs them in a zip.
//
// xlsx([{ name, rtl, title, sub: ['line', …], plain, cols: [{ h, f, w }], rows: [[…]], foot: […] }]) → Uint8Array
// xlsxCompressed(same) → Promise<Uint8Array> (deflated, much smaller)
//   f (column format): 'text' | 'num' | 'int' | 'money' | 'pct' | 'datetime' | 'date'
//   A cell is a value (string / number / null) or { v, f, b } to override the format or make it bold.
//   'datetime' / 'date' cells take a timestamp in ms and show it in business time (see util.js TZ).
import { TZ } from './util.js';

const enc = new TextEncoder();

/* ---------- zip (stored, no compression) ---------- */
let CRC = null;
function crc32(bytes) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes) {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    return out.length < bytes.length ? out : null;
  } catch { return null; }
}
const bytesOf = (d) => (typeof d === 'string' ? enc.encode(d) : d);
function zip(files) { // [{ name, data, comp? }] — comp = raw-deflated data, otherwise stored
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = bytesOf(f.data);
    const body = f.comp || data;
    const method = f.comp ? 8 : 0;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, body.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true); // extra/comment lengths, disk, attributes stay 0
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

/* ---------- SpreadsheetML ---------- */
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s) => String(s).replace(BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const sheetName = (n, used) => {
  let base = String(n || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base, k = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${k++}`;
  used.add(name.toLowerCase());
  return name;
};
// style ids (see STYLES): 0 text · 1 header · 2 #,##0 · 3 date+time · 4 date · 5 bold #,##0 · 6 bold text · 7 % · 8 title · 9 muted note · 10 general number
const STYLE = { text: 0, int: 2, money: 2, datetime: 3, date: 4, pct: 7, num: 10 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="15"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF6C6962"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD34D"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF8F8C85"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF8F8C85"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const serial = (ts) => Math.round(((ts + TZ.off * 60000) / 86400000 + 25569) * 1e6) / 1e6;
function cellXml(ref, raw, colFmt, boldRow) {
  const isObj = raw !== null && typeof raw === 'object';
  const v = isObj ? raw.v : raw;
  const f = (isObj && raw.f) || colFmt || 'text';
  const bold = boldRow || (isObj && raw.b);
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v) && f !== 'text') {
    const val = f === 'datetime' || f === 'date' ? serial(v) : v;
    const s = bold && (f === 'int' || f === 'money' || f === 'num') ? 5 : STYLE[f] ?? 10;
    return `<c r="${ref}" s="${s}"><v>${val}</v></c>`;
  }
  const s = isObj && raw.s != null ? raw.s : bold ? 6 : 0;
  return `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
const textLen = (v) => {
  const x = v !== null && typeof v === 'object' ? v.v : v;
  if (x == null) return 0;
  return typeof x === 'number' ? String(Math.round(x)).length + 3 : String(x).length;
};
function sheetXml(sh) {
  const rows = [];
  let r = 0;
  if (sh.title) { r++; rows.push(`<row r="${r}" ht="22" customHeight="1">${cellXml(`A${r}`, { v: sh.title, s: 8 })}</row>`); }
  for (const line of sh.sub || []) { r++; rows.push(`<row r="${r}">${cellXml(`A${r}`, { v: line, s: 9 })}</row>`); }
  if (sh.title || sh.sub?.length) r++; // blank line before the table
  const head = r + 1;
  r++;
  rows.push(`<row r="${r}" ht="20" customHeight="1">${sh.cols.map((c, i) => `<c r="${colName(i)}${r}" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(c.h)}</t></is></c>`).join('')}</row>`);
  for (const row of sh.rows) {
    r++;
    rows.push(`<row r="${r}">${row.map((v, i) => cellXml(`${colName(i)}${r}`, v, sh.cols[i]?.f)).join('')}</row>`);
  }
  const last = r;
  if (sh.foot) { r++; rows.push(`<row r="${r}">${sh.foot.map((v, i) => cellXml(`${colName(i)}${r}`, v, sh.cols[i]?.f, true)).join('')}</row>`); }
  const widths = sh.cols.map((c, i) => c.w || Math.min(60, Math.max(8, Math.max(String(c.h).length, ...sh.rows.slice(0, 400).map((row) => textLen(row[i]))) * 1.15 + 2)));
  const lastCol = colName(sh.cols.length - 1);
  const filter = !sh.plain && sh.rows.length ? `A${head}:${lastCol}${last}` : null;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${sh.rtl ? ' rightToLeft="1"' : ''}><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.round(w * 10) / 10}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.join('')}</sheetData>${filter ? `<autoFilter ref="${filter}"/>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;
  return { xml, filter, head, last, lastCol };
}

function parts(sheets) {
  const used = new Set();
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const built = named.map(sheetXml);
  const files = [];
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  const defined = built.map((b, i) => (b.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(named[i].name).replace(/'/g, "''")}'!$A$${b.head}:$${b.lastCol}$${b.last}</definedName>` : '')).join('');
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${named.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}</workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: STYLES });
  built.forEach((b, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b.xml }));
  return files;
}
/** Uncompressed workbook (sync). */
export const xlsx = (sheets) => zip(parts(sheets));
/** Compressed workbook — about 10× smaller; falls back to uncompressed where the browser cannot deflate. */
export async function xlsxCompressed(sheets) {
  const files = parts(sheets).map((f) => ({ ...f, data: bytesOf(f.data) }));
  for (const f of files) f.comp = await deflateRaw(f.data);
  return zip(files);
}
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
