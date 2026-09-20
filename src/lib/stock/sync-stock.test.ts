import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

const dir = mkdtempSync(join(tmpdir(), "farman-stock-sync-test-"));
const url = `file:${join(dir, "test.db")}`;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const env = { ...process.env };
const session = vi.hoisted(() => ({ user: { id: "owner", role: "OWNER" } as { id: string; role: string } | null }));
vi.mock("@/lib/db", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guards")>();
  return { ...actual, getSessionUser: async () => session.user };
});

function ledgerOp(amount: number, key = randomUUID()) {
  const id = randomUUID();
  return {
    operation_id: randomUUID(),
    entity_type: "ledger_entry",
    entity_id: id,
    operation_type: "CREATE_TRANSACTION",
    payload: {
      entry: {
        id,
        entryType: "EXPENSE",
        referenceType: "order",
        referenceId: "order-9",
        accountId: "cash",
        amount,
        currency: "TOMAN",
        occurredAt: "2026-09-19T08:00:00.000Z",
        deviceId: randomUUID(),
        metadata: {},
      },
    },
    idempotency_key: key,
    client_timestamp: "2026-09-19T08:00:00.000Z",
  };
}

function stockOp(ingredientId: string, delta: number, key = randomUUID()) {
  const id = randomUUID();
  return {
    operation_id: randomUUID(),
    entity_type: "stock_movement",
    entity_id: id,
    operation_type: "RECORD_MOVEMENT",
    payload: {
      movement: {
        id,
        ingredientId,
        delta,
        reason: "خرید روزانه",
        occurredAt: "2026-09-19T08:00:00.000Z",
        deviceId: randomUUID(),
        ...(delta < 0 ? { allowNegative: true } : {}),
      },
    },
    idempotency_key: key,
    client_timestamp: "2026-09-19T08:00:00.000Z",
  };
}

const post = (body: unknown) =>
  new NextRequest("http://localhost:3080/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) => new NextRequest(`http://localhost:3080${path}`);

let ingredientId = "";

beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  process.env.AGENT_CAFE_ID = "cafe";
  await db.cafe.create({ data: { id: "cafe", slug: "t", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "cashier", role: "CASHIER" }] });
  const ing = await db.ingredient.create({
    data: { nameFa: "قهوه", unit: "GRAM", stockQuantity: 100 },
  });
  ingredientId = ing.id;
  await db.category.create({
    data: { slug: "hot", nameFa: "گرم", order: 1 },
  });
}, 60000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
  process.env = env;
});

describe("stock movement sync", () => {
  it("pushes a mixed batch, replays it, and rejects tampered key reuse", async () => {
    const { POST } = await import("../../app/api/sync/push/route");
    const device_id = randomUUID();
    const ops = [ledgerOp(100), stockOp(ingredientId, 20)];
    const first = await POST(post({ device_id, operations: ops }));
    expect(first.status).toBe(200);
    const r1 = (await first.json()) as {
      results: Array<{ status: string; server_sequence: number; entity_id: string; entry_id: string }>;
    };
    expect(r1.results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(r1.results.map((r) => r.server_sequence).sort()).toEqual([1, 2]);
    for (const r of r1.results) expect(r.entity_id).toBe(r.entry_id);

    const replay = await POST(post({ device_id, operations: ops }));
    const r2 = (await replay.json()) as {
      results: Array<{ status: string; server_sequence: number; duplicate?: boolean; entity_id: string }>;
    };
    expect(r2.results.every((r) => r.status === "applied" && r.duplicate === true)).toBe(true);
    expect(r2.results.map((r) => r.server_sequence).sort()).toEqual([1, 2]);
    expect(await db.stockMovement.count({ where: { scopeId: "cafe" } })).toBe(1);
    expect((await db.ingredient.findUnique({ where: { id: ingredientId } }))?.stockQuantity).toBe(120);

    const tampered = {
      ...ops[1],
      payload: {
        movement: { ...((ops[1].payload as { movement: object }).movement as object), delta: 999 },
      },
    };
    const third = await POST(post({ device_id, operations: [tampered] }));
    const r3 = (await third.json()) as { results: Array<{ status: string; code: string; retryable: boolean }> };
    expect(r3.results[0]).toMatchObject({
      status: "rejected",
      code: "IDEMPOTENCY_KEY_REUSE",
      retryable: false,
    });
    expect((await db.ingredient.findUnique({ where: { id: ingredientId } }))?.stockQuantity).toBe(120);
  });

  it("rejects negative stock as a permanent validation failure", async () => {
    const { POST } = await import("../../app/api/sync/push/route");
    const res = await POST(post({ device_id: randomUUID(), operations: [stockOp(ingredientId, -500)] }));
    const j = (await res.json()) as { results: Array<{ status: string; retryable: boolean }> };
    expect(j.results[0].status).toBe("rejected");
    expect(j.results[0].retryable).toBe(false);
  });

  it("pulls ledger and stock changes in one total order with pagination", async () => {
    const pull = await import("../../app/api/sync/pull/route");
    const all = await pull.GET(get("/api/sync/pull?after=0&take=200"));
    expect(all.status).toBe(200);
    const j = (await all.json()) as {
      changes: Array<{ kind: string; server_sequence: number; delta?: number; amount?: number }>;
      next_cursor: number;
    };
    expect(j.changes.map((c) => [c.kind, c.server_sequence])).toEqual([
      ["ledger_entry", 1],
      ["stock_movement", 2],
    ]);
    expect(j.next_cursor).toBe(2);
    const page = await pull.GET(get("/api/sync/pull?after=1&take=1"));
    const jp = (await page.json()) as { changes: Array<{ kind: string }>; next_cursor: number };
    expect(jp.changes.map((c) => c.kind)).toEqual(["stock_movement"]);
    expect(jp.next_cursor).toBe(2);
    const tail = await pull.GET(get("/api/sync/pull?after=2"));
    const jt = (await tail.json()) as { changes: unknown[]; next_cursor: number };
    expect(jt.changes).toEqual([]);
    expect(jt.next_cursor).toBe(2);
  });

  it("reports movement counts in status and guards the catalog by role", async () => {
    const status = await import("../../app/api/sync/status/route");
    const st = await status.GET();
    const js = (await st.json()) as { cursor: number; entry_count: number; movement_count: number };
    expect(js).toMatchObject({ cursor: 2, entry_count: 1, movement_count: 1 });

    const catalog = await import("../../app/api/sync/catalog/route");
    const first = await catalog.GET();
    expect(first.status).toBe(200);
    const c1 = (await first.json()) as {
      version: number;
      products: unknown[];
      ingredients: Array<{ id: string; stock_quantity: number }>;
      categories: unknown[];
    };
    expect(c1.products).toEqual([]);
    expect(c1.categories.length).toBe(1);
    expect(c1.ingredients.find((i) => i.id === ingredientId)?.stock_quantity).toBe(120);

    await db.product.create({
      data: {
        slug: "espresso",
        nameFa: "اسپرسو",
        description: "–",
        price: 50000,
        categoryId: (await db.category.findFirstOrThrow()).id,
      },
    });
    const second = await catalog.GET();
    const c2 = (await second.json()) as { version: number; products: Array<{ price: number }> };
    expect(c2.version).toBeGreaterThan(c1.version);
    expect(c2.products).toHaveLength(1);
    expect(c2.products[0].price).toBe(50000);

    session.user = { id: "cashier", role: "CASHIER" };
    const denied = await catalog.GET();
    expect(denied.status).toBe(403);
    session.user = { id: "owner", role: "OWNER" };
  });
});
