import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/guards";
import { normalizeRole, roleHas } from "@/lib/constants";
import { saveArtifactBytes, newArtifactId, MAX_ARTIFACT_BYTES, looksLikeScannedPdf } from "@/lib/files/artifacts";
import { parseXlsx, FileFormatError } from "@/lib/files/xlsx";
import { parseCsv } from "@/lib/csv";
import { AgentError } from "@/lib/agent/contracts";
import { failure } from "@/lib/agent/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ROWS = 500;
const ALLOWED: Record<string, { kind: string }> = {
  "text/csv": { kind: "upload_csv" },
  "text/plain": { kind: "upload_txt" },
  "application/pdf": { kind: "upload_pdf" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "upload_xlsx" },
  "application/vnd.ms-excel": { kind: "upload_xlsx" },
};

/**
 * Bounded workspace file upload (R06): CSV, XLSX, text-based PDF. Files are
 * stored in PRIVATE artifact storage (never the public product-image path),
 * metadata is recorded with ownership, and uploaded content is treated as
 * data, never as instructions. Scanned PDFs are detected and reported
 * honestly: OCR is required and unavailable in this version.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user || !roleHas(normalizeRole(user.role), "ai.use")) throw new AgentError("FORBIDDEN", 403);
    const cafe = await prisma.cafe.findFirst({ select: { id: true } });
    if (!cafe) throw new AgentError("SINGLE_CAFE_SCOPE_REQUIRED", 403);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AgentError("FILE_REQUIRED", 400);
    if (file.size <= 0) throw new AgentError("EMPTY_FILE", 400);
    if (file.size > MAX_ARTIFACT_BYTES) throw new AgentError("FILE_TOO_LARGE", 413);
    const kind = ALLOWED[file.type];
    if (!kind) throw new AgentError("UNSUPPORTED_FILE_TYPE", 415);

    const buf = Buffer.from(await file.arrayBuffer());
    const id = newArtifactId();
    const stored = await saveArtifactBytes(cafe.id, id, buf);

    const meta: Record<string, unknown> = { originalName: file.name.slice(0, 200) };
    let preview: { rows?: string[][]; note?: string } = {};

    if (file.type === "text/csv" || file.type === "text/plain") {
      const text = buf.toString("utf8").replace(/^\uFEFF/, "");
      const rows = parseCsv(text).slice(0, MAX_ROWS);
      if (!rows.length) throw new AgentError("EMPTY_TABLE", 422);
      meta.rows = rows.length;
      preview = { rows: rows.slice(0, 5) };
    } else if (file.type.includes("spreadsheet") || file.type === "application/vnd.ms-excel") {
      let rows;
      try { rows = parseXlsx(buf).slice(0, MAX_ROWS); } catch (e) {
        if (e instanceof FileFormatError) throw new AgentError("XLSX_INVALID", 422);
        throw e;
      }
      if (!rows.length) throw new AgentError("EMPTY_TABLE", 422);
      meta.rows = rows.length;
      preview = { rows: rows.slice(0, 5).map(r => r.map(c => String(c))) };
    } else if (file.type === "application/pdf") {
      if (looksLikeScannedPdf(buf)) {
        // Honest limitation (R06): OCR is not implemented in this version.
        throw new AgentError("OCR_UNAVAILABLE", 422);
      }
      meta.pdf = "text-based";
      preview = { note: "PDF دریافت شد؛ استخراج کامل متن PDF در این نسخه محدود است." };
    }

    const artifact = await prisma.agentArtifact.create({
      data: {
        id, scopeId: cafe.id, kind: kind.kind, filename: file.name.slice(0, 200),
        mimeType: file.type, sizeBytes: stored.sizeBytes, storagePath: stored.storagePath,
        checksum: stored.checksum, meta: JSON.stringify({ ...meta, preview }), createdBy: user.id,
      },
    });
    return NextResponse.json({
      artifact: { id: artifact.id, kind: kind.kind, filename: file.name, sizeBytes: stored.sizeBytes, checksum: stored.checksum, preview },
    });
  } catch (e) { return failure(e); }
}
