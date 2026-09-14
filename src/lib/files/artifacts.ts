import { mkdir, writeFile, readFile, stat, unlink } from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";

/**
 * Private artifact storage (R06). Bytes live under uploads/private-artifacts,
 * deliberately OUTSIDE the public product-image directory (/api/uploads/*).
 * Delivery only ever happens through authenticated, ownership-checked APIs.
 */

const ROOT = path.join(process.cwd(), "uploads", "private-artifacts");

export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024; // 10 MB bounded work limit

export type StoredArtifact = { storagePath: string; checksum: string; sizeBytes: number };

export async function saveArtifactBytes(scopeId: string, id: string, data: Buffer): Promise<StoredArtifact> {
  if (data.length <= 0) throw new Error("EMPTY_FILE");
  if (data.length > MAX_ARTIFACT_BYTES) throw new Error("FILE_TOO_LARGE");
  const dir = path.join(ROOT, scopeId.replace(/[^a-zA-Z0-9_-]/g, ""));
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, id);
  await writeFile(storagePath, data);
  return { storagePath, checksum: createHash("sha256").update(data).digest("hex"), sizeBytes: data.length };
}

export async function readArtifactBytes(storagePath: string): Promise<Buffer> {
  // Defense in depth: only paths inside the private root are readable.
  const resolved = path.resolve(storagePath);
  if (!resolved.startsWith(ROOT + path.sep)) throw new Error("INVALID_PATH");
  return readFile(resolved);
}

export async function deleteArtifactBytes(storagePath: string): Promise<void> {
  const resolved = path.resolve(storagePath);
  if (!resolved.startsWith(ROOT + path.sep)) return;
  try { await unlink(resolved); } catch { /* already gone */ }
}

export async function artifactExists(storagePath: string): Promise<boolean> {
  try { await stat(storagePath); return true; } catch { return false; }
}

/**
 * Scanned-PDF detection (R06). A text PDF declares fonts; a scanned page
 * embeds page-size images. Heuristic over the raw bytes: no /Font resources
 * plus at least one image XObject ⇒ scanned, and this version has no OCR —
 * the caller must surface OCR_UNAVAILABLE honestly.
 */
export function looksLikeScannedPdf(buf: Buffer): boolean {
  const head = buf.subarray(0, 2048).toString("latin1");
  if (!head.startsWith("%PDF-")) return false;
  const body = buf.toString("latin1");
  const hasFont = /\/Font\b/.test(body);
  const hasImage = /\/Subtype\s*\/Image/.test(body);
  return hasImage && !hasFont;
}

export function newArtifactId(): string {
  return randomUUID();
}
