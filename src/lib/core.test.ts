import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";
import { normalizeFa } from "@/lib/search-normalize";
import { parseCsv, rowsToObjects } from "@/lib/csv";
import { validateRow, normalizeHeaders } from "@/lib/importer";
import {
  ROLES,
  ROLE_PERMISSIONS,
  roleHas,
  normalizeRole,
  isOwner,
  orderStatusLabel,
  ORDER_STATUSES,
} from "@/lib/constants";
import { getPublicAppUrl, detectLanIp, aiEnvEnabled } from "@/lib/config-helpers";
import { validateImage } from "@/lib/storage-helpers";
import { calculateProfitPerUnit, productMatrixQuadrant } from "@/lib/operations";

describe("slug auto-generation (Rule 17)", () => {
  it("slugifies Latin names", () => {
    expect(slugify("Butter Croissant")).toBe("butter-croissant");
  });
  it("keeps Persian letters", () => {
    expect(slugify("چای سیاه")).toBe("چای-سیاه");
  });
  it("never returns an empty slug", () => {
    expect(slugify("!!!").length).toBeGreaterThan(0);
  });
});

describe("search normalization", () => {
  it("normalizes Arabic Kaf/Yeh to Persian", () => {
    expect(normalizeFa("كي")).toBe("کی");
    expect(normalizeFa("كاپوچينو")).toBe("کاپوچینو");
  });
});

describe("csv parser", () => {
  it("parses quoted fields", () => {
    const rows = parseCsv('name,price\n"کاپوچینو, ویژه",120000');
    expect(rows[1][0]).toBe("کاپوچینو, ویژه");
    expect(rows[1][1]).toBe("120000");
  });
  it("handles semicolon delimiter and BOM", () => {
    const rows = parseCsv("\uFEFFname;price\nچای;55000", ";");
    expect(rows[1][0]).toBe("چای");
  });
  it("converts to objects", () => {
    const objs = rowsToObjects([
      ["name", "price"],
      ["چای", "55000"],
    ]);
    expect(objs[0]).toEqual({ name: "چای", price: "55000" });
  });
});

describe("import validation (invalid records are caught)", () => {
  it("requires a name", () => {
    const errors = validateRow("PRODUCTS", { name: "", price: "100" }, 2);
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });
  it("rejects invalid prices", () => {
    const errors = validateRow("PRODUCTS", { name: "چای", price: "abc" }, 2);
    expect(errors.some((e) => e.field === "price")).toBe(true);
  });
  it("rejects invalid ingredient units", () => {
    const errors = validateRow("INGREDIENTS", { name: "شیر", quantity: "5", unit: "bushel" }, 2);
    expect(errors.some((e) => e.field === "unit")).toBe(true);
  });
  it("accepts valid rows", () => {
    const errors = validateRow(
      "PRODUCTS",
      { name: "چای", price: "55000", category: "نوشیدنی" },
      2,
    );
    expect(errors).toHaveLength(0);
  });
  it("maps Persian headers", () => {
    expect(normalizeHeaders(["نام", "قیمت"])).toEqual(["name", "price"]);
  });
});

describe("RBAC (Rules 8 & 9)", () => {
  it("maps legacy roles", () => {
    expect(normalizeRole("ADMIN")).toBe("OWNER");
    expect(normalizeRole("STAFF")).toBe("CASHIER");
  });

  it("cashier can manage order status, tables and QR codes but not owner config", () => {
    expect(roleHas(ROLES.CASHIER, "orders.status")).toBe(true);
    expect(roleHas(ROLES.CASHIER, "orders.view")).toBe(true);
    expect(roleHas(ROLES.CASHIER, "qr.manage")).toBe(true);
    expect(roleHas(ROLES.CASHIER, "products.manage")).toBe(false);
    expect(roleHas(ROLES.CASHIER, "finance.view")).toBe(false);
    expect(roleHas(ROLES.CASHIER, "ai.use")).toBe(false);
    expect(roleHas(ROLES.CASHIER, "import.run")).toBe(false);
  });

  it("customer cannot access management permissions", () => {
    expect(roleHas(ROLES.CUSTOMER, "orders.view")).toBe(false);
    expect(roleHas(ROLES.CUSTOMER, "orders.status")).toBe(false);
    expect(roleHas(ROLES.CUSTOMER, "qr.manage")).toBe(false);
    expect(roleHas(ROLES.CUSTOMER, "finance.view")).toBe(false);
  });

  it("owner has every permission", () => {
    for (const p of ROLE_PERMISSIONS.OWNER) {
      expect(roleHas(ROLES.OWNER, p)).toBe(true);
    }
    expect(isOwner(ROLES.OWNER)).toBe(true);
  });
});

describe("order status labels (Rules 3 & 4)", () => {
  it("READY is labelled آماده تحویل", () => {
    expect(orderStatusLabel("READY", "TAKEAWAY")).toBe("آماده تحویل");
  });
  it("table orders have no آماده سرو state", () => {
    expect(ORDER_STATUSES).not.toContain("READY_TO_SERVE");
  });
  it("has the READY state for takeaway", () => {
    expect(ORDER_STATUSES).toContain("READY");
  });
});

describe("QR / app URL configuration (Rules 15 & 16)", () => {
  it("prefers the explicit PUBLIC_APP_URL", () => {
    process.env.PUBLIC_APP_URL = "http://192.168.1.100:3080";
    expect(getPublicAppUrl()).toBe("http://192.168.1.100:3080");
    process.env.PUBLIC_APP_URL = "";
  });
  it("falls back to the LAN IP when no explicit URL is set", () => {
    const url = getPublicAppUrl();
    if (detectLanIp()) {
      expect(url).not.toContain("localhost");
      expect(url).not.toContain("127.0.0.1");
    }
  });
  it("AI is disabled unless AI_ENABLED=true (Rule 10)", () => {
    process.env.AI_ENABLED = "false";
    expect(aiEnvEnabled()).toBe(false);
    process.env.AI_ENABLED = "true";
    expect(aiEnvEnabled()).toBe(true);
    process.env.AI_ENABLED = "false";
  });
});

describe("image validation (Rules 12 & 13)", () => {
  it("accepts supported image types", () => {
    expect(() => validateImage({ type: "image/png", size: 1024 })).not.toThrow();
    expect(() => validateImage({ type: "image/webp", size: 1024 })).not.toThrow();
  });
  it("rejects unsupported types", () => {
    expect(() => validateImage({ type: "application/pdf", size: 1024 })).toThrow();
    expect(() => validateImage({ type: "image/svg+xml", size: 1024 })).toThrow();
  });
  it("rejects oversized files", () => {
    expect(() => validateImage({ type: "image/png", size: 6 * 1024 * 1024 })).toThrow();
  });
});

describe("product matrix profit per unit", () => {
  it("normalizes product profit by its sold quantity", () => {
    expect(calculateProfitPerUnit(900_000, 100_000, 100)).toBe(8_000);
    expect(calculateProfitPerUnit(800_000, 600_000, 0)).toBeNull();
  });

  it("uses per-unit profit rather than total profit for quadrants", () => {
    expect(productMatrixQuadrant(8_000, 20_000, 100, 10)).toBe("CHANGE_RECIPE");
    expect(productMatrixQuadrant(30_000, 20_000, 5, 10)).toBe("REVIEW_TRAINING");
    expect(productMatrixQuadrant(30_000, 20_000, 20, 10)).toBe("KEEP");
    expect(productMatrixQuadrant(8_000, 20_000, 5, 10)).toBe("REMOVE_FIX");
  });
});
