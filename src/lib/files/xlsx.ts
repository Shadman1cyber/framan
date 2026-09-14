import { inflateRawSync } from "zlib";

/**
 * Minimal dependency-free XLSX (OOXML) support for bounded workspace uploads
 * and report generation (R06). Reader supports the subset Excel/Numbers
 * produce for single-sheet workbooks: shared strings + inline/number cells.
 * Writer produces a genuine ZIP archive (stored entries) containing a
 * SpreadsheetML workbook — opens in Excel, Numbers and LibreOffice.
 * Persian text and RTL sheet direction are preserved (rightToLeft view flag).
 */

export class FileFormatError extends Error {}

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number };

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Parse a ZIP archive into a name → bytes map (stored + deflate). */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new FileFormatError("ZIP_INVALID");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const index: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) throw new FileFormatError("ZIP_INVALID");
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    index.push({ name, method, offset: localOffset, compressedSize });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  const out = new Map<string, Buffer>();
  for (const e of index) {
    const local = e.offset;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new FileFormatError("ZIP_INVALID");
    const nameLen = buf.readUInt16LE(local + 26);
    const extraLen = buf.readUInt16LE(local + 28);
    const dataStart = local + 30 + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + e.compressedSize);
    out.set(e.name, e.method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
  }
  return out;
}

function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    const parts = [...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeEntities(m[1]));
    out.push(parts.join(""));
  }
  return out;
}

const colIndex = (ref: string) => ref.split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const isNumericCell = (v: string) => v !== "" && Number.isFinite(Number(v));

/** Parse the first worksheet into rows of string|number cells. */
export function parseXlsx(buf: Buffer): Array<Array<string | number>> {
  let files: Map<string, Buffer>;
  try { files = readZipEntries(buf); } catch { throw new FileFormatError("XLSX_INVALID"); }
  const sheetKey = [...files.keys()].find(k => k === "xl/worksheets/sheet1.xml")
    ?? [...files.keys()].find(k => k.startsWith("xl/worksheets/") && k.endsWith(".xml"));
  if (!sheetKey) throw new FileFormatError("XLSX_NO_SHEET");
  const sheetXml = files.get(sheetKey)!.toString("utf8");
  const shared = files.has("xl/sharedStrings.xml") ? sharedStrings(files.get("xl/sharedStrings.xml")!.toString("utf8")) : [];
  const rows: Array<Array<string | number>> = [];
  for (const rowM of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Array<string | number> = [];
    for (const c of rowM[1].matchAll(/<c(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[0])?.[1];
      const col = ref ? colIndex(ref) : cells.length;
      while (cells.length < col) cells.push("");
      const body = c[1] ?? "";
      const t = /t="([a-z]+)"/.exec(c[0])?.[1];
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const isInline = /<is(?:\s[^>]*)?>/.test(body);
      if (t === "s" && v !== undefined) cells.push(shared[Number(v)] ?? "");
      else if (isInline) {
        const inline = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decodeEntities(m[1])).join("");
        cells.push(inline);
      } else if (v !== undefined) {
        cells.push(isNumericCell(v) ? Number(v) : decodeEntities(v));
      } else cells.push("");
    }
    rows.push(cells);
  }
  return rows.filter(r => r.some(c => c !== "" && c !== undefined));
}

/* ── XLSX writer (stored-entry ZIP + SpreadsheetML) ──────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Build a valid single-sheet XLSX (right-to-left view) from rows of cells. */
export function buildXlsx(rows: Array<Array<string | number>>): Buffer {
  const sheetRows = rows.map((row, r) => {
    const colRef = (c: number) => {
      let s = ""; let n = c;
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return `${s}${r + 1}`;
    };
    const cells = row.map((cell, c) => {
      const ref = colRef(c);
      if (typeof cell === "number" && Number.isFinite(cell)) return `<c r="${xmlEscape(ref)}"><v>${cell}</v></c>`;
      const s = String(cell ?? "");
      if (s === "") return "";
      if (/^-?\d+(\.\d+)?$/.test(s.trim()) && !/^0\d/.test(s.trim())) return `<c r="${xmlEscape(ref)}"><v>${Number(s)}</v></c>`;
      return `<c r="${xmlEscape(ref)}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(s)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return buildZip(new Map<string, Buffer>([
    ["[Content_Types].xml", Buffer.from(contentTypes, "utf8")],
    ["_rels/.rels", Buffer.from(rootRels, "utf8")],
    ["xl/workbook.xml", Buffer.from(workbookXml, "utf8")],
    ["xl/_rels/workbook.xml.rels", Buffer.from(relsXml, "utf8")],
    ["xl/worksheets/sheet1.xml", Buffer.from(sheetXml, "utf8")],
  ]));
}

/** Minimal ZIP writer: stored (uncompressed) entries — valid xlsx containers. */
export function buildZip(files: Map<string, Buffer>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.size, 8);
  eocd.writeUInt16LE(files.size, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, eocd]);
}
