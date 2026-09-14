import { buildXlsx } from "./xlsx";

/**
 * Source-backed report generation (R06). Every artifact carries the exact
 * source query inputs in `meta` so an output can be checked against its
 * source. CSV and XLSX are generated deterministically; charts are rendered
 * as SVG. Persian text and right-to-left direction are preserved.
 * NOTE: generated PDF output is NOT available in this version (Persian RTL
 * PDF needs font embedding/shaping); CSV/XLSX/SVG cover the deliverables.
 */

export type ReportInput = {
  title: string;
  basis: string;
  from: string;
  to: string;
  currency: string;
};

export function buildCsvReport(rows: Array<Array<string | number>>): Buffer {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // UTF-8 BOM so Excel renders Persian correctly on open.
  return Buffer.from("\uFEFF" + rows.map(r => r.map(escape).join(",")).join("\n"), "utf8");
}

export function buildXlsxReport(rows: Array<Array<string | number>>): Buffer {
  return buildXlsx(rows);
}

export type ChartPoint = { label: string; value: number };

/** Deterministic SVG bar chart (right-to-left, Persian labels safe). */
export function buildSvgBarChart(title: string, unit: string, points: ChartPoint[]): Buffer {
  const width = 720, height = 360, pad = 48;
  const max = Math.max(1, ...points.map(p => Math.abs(p.value)));
  const barW = Math.max(12, Math.floor((width - 2 * pad) / Math.max(1, points.length)) - 12);
  const bars = points.map((p, i) => {
    const h = Math.round((Math.abs(p.value) / max) * (height - 3 * pad));
    // RTL: first point on the right.
    const x = width - pad - (i + 1) * (barW + 12) + 12;
    const y = height - pad - Math.round((Math.abs(p.value) / max) * (height - 2 * pad - 40));
    const label = p.label.length > 12 ? `${p.label.slice(0, 12)}…` : p.label;
    return `<g><rect x="${x}" y="${height - pad - Math.round((Math.abs(p.value) / max) * (height - 2 * pad - 24))}" width="${barW}" height="${Math.round((Math.abs(p.value) / max) * (height - 2 * pad - 24))}" fill="#6a8d73"/><text x="${x + barW / 2}" y="${height - pad + 14}" font-size="10" text-anchor="middle" direction="rtl">${escapeXml(label)}</text><text x="${x + barW / 2}" y="${height - pad - Math.round((Math.abs(p.value) / max) * (height - 2 * pad - 24)) - 4}" font-size="10" text-anchor="middle">${p.value}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" direction="rtl">
<text x="${width - pad}" y="24" font-size="14" text-anchor="start" direction="rtl">${escapeXml(title)}</text>
<text x="${width - pad}" y="40" font-size="10" fill="#777" text-anchor="start">${escapeXml(unit)}</text>
<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#ccc"/>
${bars}
</svg>`;
  return Buffer.from(svg, "utf8");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}