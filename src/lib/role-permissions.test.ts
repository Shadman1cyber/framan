import { describe, it, expect } from "vitest";
import { roleHas, isOwner, normalizeRole } from "@/lib/constants";

describe("role permissions (server-enforced OWNER/CASHIER gates)", () => {
  it("restricts discount management to the owner", () => {
    expect(roleHas("OWNER", "discounts.manage")).toBe(true);
    expect(roleHas("ADMIN", "discounts.manage")).toBe(true); // legacy owner
    expect(roleHas("CASHIER", "discounts.manage")).toBe(false);
    expect(roleHas("CUSTOMER", "discounts.manage")).toBe(false);
  });
  it("restricts staff/pay management to the owner", () => {
    expect(roleHas("OWNER", "staff.manage")).toBe(true);
    expect(roleHas("CASHIER", "staff.manage")).toBe(false);
  });
  it("lets cashiers work orders/tables while owners keep every permission", () => {
    expect(roleHas("CASHIER", "orders.view")).toBe(true);
    expect(roleHas("CASHIER", "orders.status")).toBe(true);
    expect(roleHas("CASHIER", "tables.manage")).toBe(true);
    expect(roleHas("CASHIER", "finance.view")).toBe(false);
    expect(roleHas("OWNER", "finance.view")).toBe(true);
  });
  it("maps legacy roles without widening access", () => {
    expect(normalizeRole("ADMIN")).toBe("OWNER");
    expect(normalizeRole("STAFF")).toBe("CASHIER");
    expect(isOwner("CASHIER")).toBe(false);
    expect(isOwner("OWNER")).toBe(true);
  });
});
