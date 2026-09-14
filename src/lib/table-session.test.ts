import { describe, it, expect } from "vitest";
import {
  createTableSessionValue,
  verifyTableSession,
  generateQrCode,
  TABLE_SESSION_COOKIE,
} from "@/lib/table-session";

describe("table sessions (cross-table protection)", () => {
  it("issues a verifiable signed session", () => {
    const value = createTableSessionValue("table-1", "qr-1");
    expect(value.split(".")).toHaveLength(4);
    expect(verifyTableSession(value, "table-1")).toBe(true);
  });

  it("rejects a session used for a different table", () => {
    const value = createTableSessionValue("table-3", "qr-3");
    expect(verifyTableSession(value, "table-5")).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const value = createTableSessionValue("table-1", "qr-1");
    const parts = value.split(".");
    parts[3] = "0".repeat(32);
    expect(verifyTableSession(parts.join("."), "table-1")).toBe(false);
    expect(verifyTableSession("garbage", "table-1")).toBe(false);
    expect(verifyTableSession(undefined, "table-1")).toBe(false);
  });

  it("generates unguessable QR tokens", () => {
    const a = generateQrCode("t");
    const b = generateQrCode("t");
    expect(a).toMatch(/^t_[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("uses a dedicated cookie name", () => {
    expect(TABLE_SESSION_COOKIE).toBe("ftable");
  });
});
