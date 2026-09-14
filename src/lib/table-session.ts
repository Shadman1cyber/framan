import crypto from "crypto";

/**
 * Signed table sessions.
 * Scanning a table QR issues a short-lived HMAC-signed cookie bound to the
 * table. Placing a table order requires a valid session for THAT table, so a
 * guest at table 3 cannot order (or meddle) for table 5 — QR codes themselves
 * are unguessable random tokens.
 */

export const TABLE_SESSION_COOKIE = "ftable";
export const TABLE_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? "farmans-dev-secret";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);
}

export function createTableSessionValue(tableId: string, qrCodeId: string): string {
  const ts = Date.now().toString(36);
  const payload = `${tableId}.${qrCodeId}.${ts}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyTableSession(
  cookieValue: string | undefined | null,
  tableId: string,
): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return false;
  const [tid, qid, ts, sig] = parts;
  if (tid !== tableId) return false;
  const issued = Number.parseInt(ts, 36);
  if (!Number.isFinite(issued) || Date.now() - issued > TABLE_SESSION_TTL_MS) return false;
  const expected = sign(`${tid}.${qid}.${ts}`);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Unguessable QR code tokens (prevents guests from typing other tables' URLs). */
export function generateQrCode(prefix = "t"): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}
