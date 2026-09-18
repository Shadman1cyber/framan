import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

const dir = mkdtempSync(join(tmpdir(), "farman-push-test-"));
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

function op(amount: number, key = randomUUID()) {
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
        occurredAt: "2026-09-18T10:00:00.000Z",
        deviceId: randomUUID(),
        metadata: {},
      },
    },
    idempotency_key: key,
    client_timestamp: "2026-09-18T10:00:00.000Z",
  };
}

const post = (body: unknown) =>
  new NextRequest("http://localhost:3080/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );
  process.env.AGENT_CAFE_ID = "cafe";
  await db.cafe.create({ data: { id: "cafe", slug: "t", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "cashier", role: "CASHIER" }] });
}, 60000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
  process.env = env;
});

describe("POST /api/sync/push", () => {
  it("applies a batch, replays it idempotently, and rejects key reuse", async () => {
    const { POST } = await import("../../app/api/sync/push/route");
    const device_id = randomUUID();
    const a = op(100);
    const b = op(200);
    const first = await POST(post({ device_id, operations: [a, b] }));
    expect(first.status).toBe(200);
    const r1 = (await first.json()) as { results: Array<{ status: string; server_sequence: number }> };
    expect(r1.results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(r1.results.map((r) => r.server_sequence).sort()).toEqual([1, 2]);

    const replay = await POST(post({ device_id, operations: [a, b] }));
    const r2 = (await replay.json()) as {
      results: Array<{ status: string; server_sequence: number; duplicate?: boolean }>;
    };
    expect(r2.results.every((r) => r.status === "applied" && r.duplicate === true)).toBe(true);
    expect(r2.results.map((r) => r.server_sequence).sort()).toEqual([1, 2]);
    expect(await db.ledgerEntry.count({ where: { scopeId: "cafe" } })).toBe(2);

    const tampered = { ...a, payload: { entry: { ...(a.payload.entry as object), amount: 999 } } };
    const third = await POST(post({ device_id, operations: [tampered] }));
    const r3 = (await third.json()) as {
      results: Array<{ status: string; code: string; retryable: boolean }>;
    };
    expect(r3.results[0].status).toBe("rejected");
    expect(r3.results[0].code).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(r3.results[0].retryable).toBe(false);
    const sum = await db.ledgerEntry.aggregate({ where: { scopeId: "cafe" }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(300);
  });

  it("serves pull pagination and status cursor from committed sequences", async () => {
    const pull = await import("../../app/api/sync/pull/route");
    const status = await import("../../app/api/sync/status/route");
    const get = (path: string) => new NextRequest(`http://localhost:3080${path}`);
    const all = await pull.GET(get("/api/sync/pull?after=0&take=200"));
    expect(all.status).toBe(200);
    const j = (await all.json()) as { changes: Array<{ server_sequence: number }>; next_cursor: number };
    expect(j.changes.map((c) => c.server_sequence).sort()).toEqual([1, 2]);
    expect(j.next_cursor).toBe(2);
    const page = await pull.GET(get("/api/sync/pull?after=1"));
    const jp = (await page.json()) as { changes: Array<{ server_sequence: number }>; next_cursor: number };
    expect(jp.changes.map((c) => c.server_sequence)).toEqual([2]);
    const st = await status.GET();
    expect(st.status).toBe(200);
    const js = (await st.json()) as { cursor: number; entry_count: number; scope: string };
    expect(js).toMatchObject({ cursor: 2, entry_count: 2, scope: "cafe" });
  });

  it("rejects callers without finance.view and empty batches", async () => {
    const { POST } = await import("../../app/api/sync/push/route");
    session.user = { id: "cashier", role: "CASHIER" };
    const denied = await POST(post({ device_id: randomUUID(), operations: [op(10)] }));
    expect(denied.status).toBe(403);
    session.user = { id: "owner", role: "OWNER" };
    const empty = await POST(post({ device_id: randomUUID(), operations: [] }));
    expect(empty.status).toBe(400);
  });
});
