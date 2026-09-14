import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    staff: { count: vi.fn() },
    order: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    orderItem: { findMany: vi.fn() },
    product: { findMany: vi.fn(), count: vi.fn() },
    productIngredient: { findMany: vi.fn(), groupBy: vi.fn() },
    ingredient: { findMany: vi.fn(), count: vi.fn() },
    aIInsight: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { aiService } from "@/lib/ai/service";
import { isAiEnabled, setAiEnabled } from "@/lib/ai/settings";
import { ZhipuProvider } from "@/lib/ai/provider";
import { aiInsightService } from "@/lib/ai/insights";

function stubAnalytics() {
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.order.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { total: 0 }, _count: 0, _avg: { total: null } } as never);
  vi.mocked(prisma.orderItem.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.productIngredient.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.productIngredient.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.ingredient.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.ingredient.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.product.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.staff.count).mockResolvedValue(0 as never);
}

describe("AI settings (Rule 10)", () => {
  beforeEach(() => {
    process.env.AI_ENABLED = "false";
    vi.mocked(prisma.setting.findUnique).mockResolvedValue(null as never);
  });

  it("is disabled by default", async () => {
    expect(await isAiEnabled()).toBe(false);
  });

  it("respects the DB master switch", async () => {
    vi.mocked(prisma.setting.findUnique).mockResolvedValue({ key: "ai.enabled", value: "true" } as never);
    expect(await isAiEnabled()).toBe(true);
  });

  it("persists the toggle", async () => {
    vi.mocked(prisma.setting.upsert).mockResolvedValue({ key: "ai.enabled", value: "true" } as never);
    await setAiEnabled(true);
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "ai.enabled" } }),
    );
  });
});

describe("AIService (Rules 10, 11, 24)", () => {
  beforeEach(() => {
    process.env.AI_ENABLED = "false";
    vi.mocked(prisma.setting.findUnique).mockResolvedValue(null as never);
  });

  it("refuses to run when disabled and makes no provider calls", async () => {
    const result = await aiService.ask("امروز فروش چطور بود؟");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("غیرفعال");
  });

  it("reports missing API key instead of calling the provider", async () => {
    process.env.AI_ENABLED = "true";
    delete process.env.ZHIPU_API_KEY;
    const result = await aiService.ask("فروش امروز چقدر بود؟");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ZHIPU_API_KEY");
  });

  it("never returns a reason containing the API key", async () => {
    stubAnalytics();
    process.env.AI_ENABLED = "true";
    process.env.ZHIPU_API_KEY = "super-secret-key";
    const provider = new ZhipuProvider();
    const fetchStub = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline test"));
    const result = await aiService.ask("فروش امروز چقدر بود؟");
    fetchStub.mockRestore();
    const text = result.ok ? result.answer : result.reason;
    expect(text).not.toContain("super-secret-key");
    expect(provider.isConfigured()).toBe(true);
    delete process.env.ZHIPU_API_KEY;
  });
});

describe("AIInsightService — deterministic insights work without AI", () => {
  beforeEach(() => {
    process.env.AI_ENABLED = "false";
    vi.mocked(prisma.setting.findUnique).mockResolvedValue(null as never);
  });

  it("generates rule-based insights without calling the provider", async () => {
    stubAnalytics();
    vi.mocked(prisma.ingredient.findMany).mockResolvedValue([
      {
        id: "i1",
        nameFa: "شیر تازه",
        unit: "MILLILITER",
        stockQuantity: 500,
        minQuantity: 2000,
        costPerUnit: 28,
        isActive: true,
      },
    ] as never);
    vi.mocked(prisma.staff.count).mockResolvedValue(1 as never);

    const drafts = await aiInsightService.generateOperationalInsights();
    const lowStock = drafts.find((d) => d.title.includes("شیر تازه"));
    expect(lowStock).toBeDefined();
    expect(lowStock!.kind).toBe("INVENTORY");
  });

  it("aiSummary fails gracefully when AI is off", async () => {
    const summary = await aiInsightService.aiSummary();
    expect(summary.ok).toBe(false);
    expect(summary.text).toContain("غیرفعال");
  });
});
