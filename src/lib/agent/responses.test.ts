import { describe, expect, it } from "vitest";
import { responseText } from "./responses";

const answer = (result: unknown) => responseText({ id: "run", state: "succeeded", result: JSON.stringify(result) });

describe("source-backed agent responses", () => {
  it("answers product prices and availability using the receipt values", () => {
    const text = answer({ count: 1, products: [{ id: "latte", nameFa: "لاته", price: 95000, isAvailable: false }] });
    expect(text).toContain("لاته: 95000 تومان");
    expect(text).toContain("ناموجود");
    expect(text).toContain("شناسه: latte");
  });

  it("shows inventory quantities, thresholds and units instead of just count", () => {
    const text = answer({ count: 1, ingredients: [{ nameFa: "شیر", stockQuantity: 2.5, minQuantity: 3, unit: "لیتر" }] });
    expect(text).toContain("شیر: 2.5 لیتر");
    expect(text).toContain("حداقل: 3 لیتر");
  });

  it("renders product and historical order detail including coffee line prices", () => {
    expect(answer({ product: { id: "p", nameFa: "اسپرسو", price: 70000, coffeeLines: [{ coffeeLineId: "arabica", price: 90000, isActive: true }] } })).toContain("arabica: 90000 تومان");
    const text = answer({ order: { id: "order1", status: "READY", total: 160000, table: 4, items: [{ productName: "لاته", quantity: 2, price: 70000, optionPrice: 10000 }] } });
    expect(text).toContain("آماده تحویل");
    expect(text).toContain("160000 تومان");
    expect(text).toContain("میز 4");
    expect(text).toContain("لاته: 2 عدد × 70000 تومان + افزونه 10000 تومان");
  });

  it("preserves every step in a multi-section request", () => {
    const result = { staff: [{ name: "سارا", role: "باریستا", isActive: true }] };
    const text = answer({ steps: [{ tool: "list_inventory", result: { ingredients: [{ nameFa: "شیر", stockQuantity: 5, unit: "لیتر" }] } }, { tool: "list_staff", result }], final: result });
    expect(text).toContain("شیر: 5 لیتر");
    expect(text).toContain("سارا");
    expect(text).toContain("باریستا");
  });

  it("does not claim a bounded result count is a database total", () => {
    const text = answer({ count: 1, products: [{ nameFa: "لاته", price: 1 }] });
    expect(text).toContain("نمایش 1 مورد");
    expect(answer({ count: 1, totalCount: 100, products: [{ nameFa: "لاته", price: 1 }] })).toContain("نمایش 1 از 100 مورد");
  });

  it("renders catalog matches without inventing a price and flags stale data", () => {
    const text = answer({ results: [{ kind: "Product", label: "لاته", refId: "p1" }], count: 1 });
    expect(text).toContain("لاته");
    expect(text).toContain("شناسه: p1");
    expect(text).toContain("قیمت در نتیجه کاتالوگ موجود نیست");
    expect(text).not.toContain("تومان");
    expect(answer({ results: [], count: 0, stale: true })).toContain("به‌روز نیست");
  });

  it("does not invent rows when a live list is empty", () => {
    expect(answer({ count: 0, orders: [] })).toContain("موردی یافت نشد");
  });
  it("includes live catalog availability and coffee-line prices", () => {
    const text = answer({ count: 1, results: [{ kind: "Product", label: "موکا", refId: "m1", price: 140000, isAvailable: false,
      coffeeLines: [{ coffeeLineId: "arabica", price: 170000 }] }] });
    expect(text).toContain("ناموجود");
    expect(text).toContain("140000 تومان");
    expect(text).toContain("170000 تومان");
  });

});
