import { beforeEach, describe, expect, it, vi } from "vitest";

const receipts = new Map<string, { key: string; value: string }>();
const tx = {
  setting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => receipts.get(where.key) ?? null),
    create: vi.fn(async ({ data }: { data: { key: string; value: string } }) => {
      if (receipts.has(data.key)) throw new Error("duplicate");
      receipts.set(data.key, data);
      return data;
    }),
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => receipts.get(where.key) ?? null),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { isAllowedOfflineAdminMutation } from "./admin-mutation";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "./server";

function request(id?: string) {
  return new Request("http://localhost/api/admin/customers/customer-1/points", {
    method: "POST",
    headers: id ? { "X-Farman-Mutation-Id": id } : undefined,
  });
}

describe("offline admin mutation allowlist", () => {
  it("allows operational writes and rejects deletes or structural table writes", () => {
    expect(isAllowedOfflineAdminMutation({
      path: "/api/admin/orders/order-1/status",
      method: "PUT",
      body: { status: "CONFIRMED" },
    })).toBe(true);
    expect(isAllowedOfflineAdminMutation({
      path: "/api/admin/tables/table-1",
      method: "PUT",
      body: { isOccupied: true },
    })).toBe(true);
    expect(isAllowedOfflineAdminMutation({
      path: "/api/admin/tables/table-1",
      method: "PUT",
      body: { isActive: false },
    })).toBe(false);
    expect(isAllowedOfflineAdminMutation({
      path: "/api/admin/reservations/reservation-1",
      method: "PATCH",
      body: {},
    })).toBe(false);
  });
});

describe("offline server receipts", () => {
  beforeEach(() => {
    receipts.clear();
    vi.clearAllMocks();
  });

  it("applies a mutation once and replays its durable receipt", async () => {
    const id = "fm_admin_mutation_1234567890abcdef";
    let writes = 0;
    const execute = async () => {
      writes += 1;
      return { body: { points: 12 } };
    };

    const first = await runIdempotentOfflineMutation(request(id), "actor-1", { amount: 2 }, execute);
    const replay = await runIdempotentOfflineMutation(request(id), "actor-1", { amount: 2 }, execute);

    expect(first).toMatchObject({ replayed: false, body: { points: 12 } });
    expect(replay).toMatchObject({ replayed: true, body: { points: 12 } });
    expect(writes).toBe(1);
  });

  it("rejects reuse of a mutation id with different input", async () => {
    const id = "fm_admin_mutation_abcdef1234567890";
    await runIdempotentOfflineMutation(request(id), "actor-1", { amount: 2 }, async () => ({ body: { points: 2 } }));
    await expect(
      runIdempotentOfflineMutation(request(id), "actor-1", { amount: 3 }, async () => ({ body: { points: 3 } })),
    ).rejects.toBeInstanceOf(OfflineMutationConflict);
  });

  it("scopes the same mutation id to the authenticated actor", async () => {
    const id = "fm_admin_mutation_actorbound123456";
    let writes = 0;
    const execute = async () => ({ body: { value: ++writes } });

    await runIdempotentOfflineMutation(request(id), "actor-1", { occupied: true }, execute);
    await runIdempotentOfflineMutation(request(id), "actor-2", { occupied: true }, execute);

    expect(writes).toBe(2);
  });
});
