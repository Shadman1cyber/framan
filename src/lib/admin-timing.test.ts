import { describe, it, expect } from "vitest";
import {
  ORDERS_REFRESH_MS,
  CASHIER_REMINDER_MS,
  SALES_FLOW_REFRESH_MS,
  LEAVE_HEADER_REFRESH_MS,
} from "@/lib/admin-timing";

describe("admin live intervals", () => {
  it("refreshes the live order board every 10 seconds without reloading", () => {
    expect(ORDERS_REFRESH_MS).toBe(10_000);
  });
  it("reminds the cashier every 2 minutes (single timer, cleaned up on unmount)", () => {
    expect(CASHIER_REMINDER_MS).toBe(120_000);
  });
  it("keeps background polls from stampeding the server", () => {
    expect(SALES_FLOW_REFRESH_MS).toBe(30_000);
    expect(LEAVE_HEADER_REFRESH_MS).toBe(30_000);
    expect(CASHIER_REMINDER_MS).toBeGreaterThan(ORDERS_REFRESH_MS);
  });
});
