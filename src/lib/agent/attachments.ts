import type { Prisma } from "@prisma/client";
import { parseCsv } from "@/lib/csv";
import { parseXlsx } from "@/lib/files/xlsx";
import { readArtifactBytes } from "@/lib/files/artifacts";
import { AgentError } from "./contracts";

/**
 * Bounded attachment → planner context (R06 extension). The uploader's stored
 * bytes are re-read from private storage, parsed back into table rows and
 * truncated into a small text block. Contents are UNTRUSTED DATA for the
 * planner — never instructions — and extraction failures degrade to an honest
 * note instead of invented content.
 */

export type AttachmentContext = { id: string; filename: string; kind: string; content: string };

const MAX_ROWS = 25;
const MAX_ROW_CELLS = 12;
const MAX_CELL_CHARS = 60;
const MAX_CONTENT_CHARS = 1200;

/** Re-extract bounded table rows from a stored artifact's bytes. */
export async function extractArtifactRows(artifact: {
  kind: string; storagePath: string;
}): Promise<Array<Array<string | number>>> {
  const buf = await readArtifactBytes(artifact.storagePath);
  if (artifact.kind === "upload_csv" || artifact.kind === "upload_txt") return parseCsv(buf.toString("utf8"));
  if (artifact.kind === "upload_xlsx") return parseXlsx(buf);
  return [];
}

function tableText(rows: Array<Array<string | number>>): string {
  const lines: string[] = [];
  let length = 0;
  for (const r of rows.slice(0, MAX_ROWS)) {
    const line = r.slice(0, MAX_ROW_CELLS).map(c => String(c).slice(0, MAX_CELL_CHARS)).join(" | ");
    length += line.length + 1;
    if (length > MAX_CONTENT_CHARS) break;
    lines.push(line);
  }
  return lines.join("\n");
}

export async function loadAttachmentContext(
  db: Prisma.TransactionClient | { agentArtifact: Prisma.AgentArtifactDelegate },
  scopeId: string,
  userId: string,
  ids: string[],
): Promise<AttachmentContext[]> {
  const unique = [...new Set(ids)].slice(0, 5);
  if (!unique.length) return [];
  const rows = await (db as Prisma.TransactionClient).agentArtifact.findMany({
    where: { id: { in: unique }, scopeId, createdBy: userId },
  });
  // A silently ignored attachment would pretend analysis happened — reject instead.
  if (rows.length !== unique.length) throw new AgentError("NOT_FOUND", 404);
  const out: AttachmentContext[] = [];
  for (const a of rows) {
    let content: string;
    try {
      const rows2 = await extractArtifactRows(a);
      content = rows2.length ? tableText(rows2)
        : a.kind === "upload_pdf"
          ? "(PDF: استخراج کامل متن در این نسخه پشتیبانی نمی‌شود)"
          : `(فایل ${a.kind}: متن استخراج‌ناپذیر)`;
    } catch {
      content = "(محتوای فایل قابل خواندن مجدد نبود)";
    }
    out.push({ id: a.id, filename: a.filename.slice(0, 80), kind: a.kind, content: content.slice(0, MAX_CONTENT_CHARS) });
  }
  return out;
}

/**
 * Deterministic source-backed analysis of one attachment's rows (no model in
 * the loop): row count, numeric column aggregates and the argmax/argmin row
 * label. Every number comes from the stored bytes — nothing is invented.
 * Messy files (a stray prose line before the table) are scanned over the
 * first few start offsets and the first interpretation with a numeric
 * column wins — junk lines are skipped, never merged into the sums.
 */
export type AttachmentAnalysis = {
  id: string; filename: string; kind: string;
  rowCount: number; columns: string[] | null;
  numeric: { column: string; sum: number; mean: number; max: number; min: number; maxLabel: string | null; minLabel: string | null }[];
  sample: Array<Array<string | number>>;
  note?: string;
};

const ANALYSIS_MAX_ROWS = 2000;

function numericColumn(data: Array<Array<string | number>>, c: number): { sum: number; count: number; max: number; min: number; maxLabel: string | null; minLabel: string | null } | null {
  let sum = 0, count = 0, max = -Infinity, min = Infinity, maxLabel: string | null = null, minLabel: string | null = null;
  for (const r of data) {
    const v = r[c];
    if (v === "" || v == null) continue;
    // CSV cells arrive as strings; numeric-looking cells count as numbers.
    const num = typeof v === "number" ? v : (typeof v === "string" && Number.isFinite(Number(v.trim())) ? Number(v.trim()) : null);
    if (num === null) return null; // a text cell anywhere disqualifies the column
    sum += num; count++;
    const label = typeof r[0] === "string" || typeof r[0] === "number" ? String(r[0]).slice(0, 60) : null;
    if (num > max) { max = num; maxLabel = label; }
    if (num < min) { min = num; minLabel = label; }
  }
  return count ? { sum, count, max, min, maxLabel, minLabel } : null;
}

function analyzeAtOffset(rows: Array<Array<string | number>>, offset: number): { rowCount: number; columns: string[] | null; numeric: AttachmentAnalysis["numeric"] } | null {
  const data = rows.slice(offset);
  if (!data.length) return null;
  const first = data[0];
  const headerLike = first.some(c => typeof c === "string" && c.trim() !== "" && !Number.isFinite(Number(c.trim())));
  const headerRow = headerLike ? data[0] : null;
  const body = headerLike ? data.slice(1) : data;
  if (!body.length) return null;
  const columns = (headerRow ?? first).map((c, i) => (headerRow ? String(c).slice(0, 40) : `ستون ${i + 1}`));
  const width = Math.max(...body.map(r => r.length));
  const numeric: AttachmentAnalysis["numeric"] = [];
  for (let c = 0; c < width; c++) {
    const agg = numericColumn(body, c);
    if (agg) numeric.push({ column: columns[c] ?? `ستون ${c + 1}`, sum: agg.sum, mean: Math.round((agg.sum / agg.count) * 100) / 100, max: agg.max, min: agg.min, maxLabel: agg.maxLabel, minLabel: agg.minLabel });
  }
  return { rowCount: body.length, columns: headerRow ? columns : null, numeric };
}

export async function analyzeArtifact(a: { id: string; filename: string; kind: string; storagePath: string }): Promise<AttachmentAnalysis> {
  const base = { id: a.id, filename: a.filename.slice(0, 80), kind: a.kind };
  let rows: Array<Array<string | number>>;
  try { rows = (await extractArtifactRows(a)).slice(0, ANALYSIS_MAX_ROWS); } catch {
    return { ...base, rowCount: 0, columns: null, numeric: [], sample: [], note: "محتوای فایل قابل خواندن مجدد نبود" };
  }
  if (!rows.length) {
    return { ...base, rowCount: 0, columns: null, numeric: [], sample: [],
      note: a.kind === "upload_pdf" ? "استخراج متن PDF پشتیبانی نمی‌شود" : "داده جدولی در فایل یافت نشد" };
  }
  // First start offset that yields a numeric column wins; junk preamble lines
  // (e.g. prompt-injection prose) are skipped rather than summed.
  let chosen = analyzeAtOffset(rows, 0);
  if (!chosen?.numeric.length) {
    for (const o of [1, 2]) {
      const alt = analyzeAtOffset(rows, o);
      if (alt?.numeric.length) { chosen = alt; break; }
    }
  }
  if (!chosen) return { ...base, rowCount: 0, columns: null, numeric: [], sample: [], note: "داده جدولی در فایل یافت نشد" };
  return { ...base, rowCount: chosen.rowCount, columns: chosen.columns, numeric: chosen.numeric, sample: tableRowsSample(rows) };
}

function tableRowsSample(rows: Array<Array<string | number>>): Array<Array<string | number>> {
  return rows.slice(0, 3).map(r => r.slice(0, MAX_ROW_CELLS).map(c => (typeof c === "string" ? c.slice(0, MAX_CELL_CHARS) : c)));
}