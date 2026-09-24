import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Image storage abstraction.
 * v1 = local disk under ./uploads, served through /api/uploads/*.
 * Swap `saveImage`/`deleteImage` for an S3-compatible implementation later
 * without touching callers. Internal filesystem paths are never exposed.
 */

// UPLOADS_DIR env override exists for embedded runtimes (Windows desktop
// app) that cannot rely on cwd pointing at a writable location.
const UPLOAD_DIR = path.join(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));
const PUBLIC_PREFIX = "/api/uploads";

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export class UploadError extends Error {}

export type StoredImage = { url: string; filename: string };

export function validateImage(file: { type: string; size: number }): void {
  if (!ALLOWED_IMAGE_TYPES[file.type]) {
    throw new UploadError("فرمت تصویر پشتیبانی نمی‌شود (JPG، PNG، WebP، GIF)");
  }
  if (file.size <= 0) throw new UploadError("فایل خالی است");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("حجم تصویر باید کمتر از ۵ مگابایت باشد");
}

/** Local storage implementation. */
export async function saveImage(
  data: Buffer,
  mimeType: string,
): Promise<StoredImage> {
  const ext = ALLOWED_IMAGE_TYPES[mimeType];
  if (!ext) throw new UploadError("فرمت تصویر پشتیبانی نمی‌شود");
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filename), data);
  return { url: `${PUBLIC_PREFIX}/${filename}`, filename };
}

export async function deleteImageByUrl(url: string): Promise<void> {
  if (!url?.startsWith(PUBLIC_PREFIX)) return;
  const filename = path.basename(url);
  // Defense in depth: never allow traversal.
  if (filename.includes("/") || filename.includes("..")) return;
  try {
    await unlink(path.join(UPLOAD_DIR, filename));
  } catch {
    // Missing file is fine.
  }
}

/** Map a stored URL to a safe filename for validation before serving. */
export function safeFilenameFromUrl(url: string): string | null {
  if (!url?.startsWith(PUBLIC_PREFIX)) return null;
  const filename = path.basename(url);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;
  return filename;
}

export const LOCAL_UPLOAD_DIR = UPLOAD_DIR;
