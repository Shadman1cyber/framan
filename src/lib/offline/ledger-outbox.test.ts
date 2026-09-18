import { describe, expect, it } from "vitest";
import {
  computeRetryDelayMs,
  createMemoryOutboxStore,
  newUuid,
  runLedgerSync,
  SyncAuthError,
  SyncTransportError,
  type ApiClient,
  type LedgerEntrySnapshot,
  type LedgerOutboxStore,
  type PushResponse,
} from "./ledger-outbox";

function enqueueExpense(
  store: LedgerOutboxStore,
  amount: number,
  deviceId = "11111111-1111-4111-8111-111111111111",
) {
  const entryId = newUuid();
  return store.enqueue({
    operationId: newUuid(),
    idempotencyKey: newUuid(),
    entityType: "ledger_entry",
    entityId: entryId,
    operationType: "CREATE_TRANSACTION",
    payload: {
      entry: {
        id: entryId,
        entryType: "EXPENSE",
        referenceType: "order",
        referenceId: "order-1",
        accountId: "cash",
        amount,
        currency: "TOMAN",
        occurredAt: "2026-09-18T10:00:00.000Z",
        deviceId,
        metadata: {},
      },
    },
    clientTimestamp: "2026-09-18T10:00:00.000Z",
    deviceId,
  });
}

type FakeServerOpts = {
  failPush?: "transport" | "http500" | "auth" | null;
  failPull?: "transport" | "auth" | "malformed" | null;
};

function createFakeServer() {
  const applied = new Map<string, { seq: number; entryId: string }>();
  const ledger: Array<{ id: string; amount: number; seq: number }> = [];
  let seq = 0;
  const api = (opts: FakeServerOpts = {}): ApiClient => ({
    async push(body) {
      if (opts.failPush === "transport") throw new SyncTransportError("network down");
      if (opts.failPush === "auth") throw new SyncAuthError();
      if (opts.failPush === "http500") throw new SyncTransportError("server error 500");
      const results: PushResponse["results"] = [];
      for (const op of body.operations) {
        const prev = applied.get(op.idempotency_key);
        if (prev) {
          results.push({ operation_id: op.operation_id, status: "applied", server_sequence: prev.seq, entry_id: prev.entryId, duplicate: true });
          continue;
        }
        const amount = (op.payload.entry as { amount?: unknown } | undefined)?.amount;
        if (typeof amount !== "number" || amount === 0) {
          results.push({ operation_id: op.operation_id, status: "rejected", code: "INVALID_AMOUNT", retryable: false });
          continue;
        }
        seq += 1;
        const entryId = (op.payload.entry as { id: string }).id;
        applied.set(op.idempotency_key, { seq, entryId });
        ledger.push({ id: entryId, amount, seq });
        results.push({ operation_id: op.operation_id, status: "applied", server_sequence: seq, entry_id: entryId });
      }
      return { results };
    },
    async pull(after, take) {
      if (opts.failPull === "transport") throw new SyncTransportError("network down");
      if (opts.failPull === "auth") throw new SyncAuthError();
      if (opts.failPull === "malformed") return { changes: [], next_cursor: "bad" } as unknown as { changes: LedgerEntrySnapshot[]; next_cursor: number };
      const changes = ledger
        .filter((e) => e.seq > after)
        .slice(0, take)
        .map(
          (e): LedgerEntrySnapshot => ({
            id: e.id,
            entryType: "EXPENSE",
            referenceType: "order",
            referenceId: "order-1",
            accountId: "cash",
            amount: e.amount,
            currency: "TOMAN",
            occurredAt: "2026-09-18T10:00:00.000Z",
            deviceId: "device",
            reversalOf: null,
            serverSequence: e.seq,
            serverReceivedAt: "2026-09-18T10:00:01.000Z",
          }),
        );
      return { changes, next_cursor: changes.length > 0 ? changes[changes.length - 1].serverSequence : after };
    },
  });
  return { api, applied, ledger };
}

const online = () => true;
const offline = () => false;
const fixedRand = () => 0.5;

describe("ledger outbox sync engine", () => {
  it("pushes offline-created ops and pulls them back with a durable cursor", async () => {
    const { api, ledger } = createFakeServer();
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 100);
    await enqueueExpense(store, 200);
    const s = await runLedgerSync(store, api(), "device-1", { isOnline: online, rand: fixedRand });
    expect(s).toMatchObject({ pushed: 2, synced: 2, failed: 0, pulled: 2, cursor: 2 });
    expect(ledger).toHaveLength(2);
    expect(await store.countPending()).toBe(0);
    const mirror = await store.listEntries(0, 10);
    expect(mirror.map((e) => e.serverSequence)).toEqual([1, 2]);
  });

  it("stays offline-safe: nothing sent, ops retained", async () => {
    const { api, ledger } = createFakeServer();
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 100);
    const s = await runLedgerSync(store, api(), "device-1", { isOnline: offline, rand: fixedRand });
    expect(s.pushed).toBe(0);
    expect(ledger).toHaveLength(0);
    expect(await store.countPending()).toBe(1);
  });

  it("retries transport failures with the same idempotency key and backoff", async () => {
    const server = createFakeServer();
    const store = createMemoryOutboxStore();
    const rec = await enqueueExpense(store, 100);
    let now = 1_000_000;
    const fail = await runLedgerSync(store, server.api({ failPush: "transport" }), "device-1", {
      isOnline: online,
      now: () => now,
      rand: fixedRand,
    });
    expect(fail.error).toContain("network down");
    expect(server.ledger).toHaveLength(0);
    const due = await store.listDue(now + 999, 10);
    expect(due).toHaveLength(0);
    const later = await store.listDue(now + 1000, 10);
    expect(later.map((o) => o.idempotencyKey)).toEqual([rec.idempotencyKey]);
    now += 1000;
    const ok = await runLedgerSync(store, server.api(), "device-1", {
      isOnline: online,
      now: () => now,
      rand: fixedRand,
    });
    expect(ok.synced).toBe(1);
    expect(server.ledger).toHaveLength(1);
  });

  it("keeps permanent failures for manual retry instead of looping", async () => {
    const { api } = createFakeServer();
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 0);
    const s = await runLedgerSync(store, api(), "device-1", { isOnline: online, rand: fixedRand });
    expect(s).toMatchObject({ pushed: 1, synced: 0, failed: 1 });
    expect(await store.listFailed()).toHaveLength(1);
    expect(await store.countPending()).toBe(0);
    const due = await store.listDue(Date.now() + 3600_000, 10);
    expect(due).toHaveLength(0);
    const [failed] = await store.listFailed();
    expect(await store.retryFailed(failed.idempotencyKey)).toBe(true);
    expect(await store.listDue(Date.now(), 10)).toHaveLength(1);
  });

  it("handles 401 by keeping ops pending and flagging auth", async () => {
    const { api } = createFakeServer();
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 100);
    const s = await runLedgerSync(store, api({ failPush: "auth" }), "device-1", {
      isOnline: online,
      rand: fixedRand,
    });
    expect(s.authRequired).toBe(true);
    expect(await store.countPending()).toBe(1);
    expect(await store.listFailed()).toHaveLength(0);
  });

  it("survives a lost response: replay applies exactly once", async () => {
    const server = createFakeServer();
    const store = createMemoryOutboxStore();
    const rec = await enqueueExpense(store, 100);
    await store.markProcessing([rec.idempotencyKey]);
    await store.resetProcessing();
    const s = await runLedgerSync(store, server.api(), "device-1", { isOnline: online, rand: fixedRand });
    expect(s.synced).toBe(1);
    const again = await runLedgerSync(store, server.api(), "device-1", { isOnline: online, rand: fixedRand });
    expect(again.pushed).toBe(0);
    expect(server.ledger).toHaveLength(1);
  });

  it("recovers ops stuck in processing after a crash", async () => {
    const store = createMemoryOutboxStore();
    const rec = await enqueueExpense(store, 100);
    await store.markProcessing([rec.idempotencyKey]);
    expect(await store.listDue(Date.now(), 10)).toHaveLength(0);
    expect(await store.resetProcessing()).toBe(1);
    expect(await store.listDue(Date.now(), 10)).toHaveLength(1);
  });

  it("merges two offline devices additively", async () => {
    const server = createFakeServer();
    const storeA = createMemoryOutboxStore();
    const storeB = createMemoryOutboxStore();
    await enqueueExpense(storeA, 100, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await enqueueExpense(storeB, 200, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const sa = await runLedgerSync(storeA, server.api(), "device-a", { isOnline: online, rand: fixedRand });
    const sb = await runLedgerSync(storeB, server.api(), "device-b", { isOnline: online, rand: fixedRand });
    expect(sa.synced).toBe(1);
    expect(sb.synced).toBe(1);
    expect(server.ledger.reduce((s, e) => s + e.amount, 0)).toBe(300);
    await runLedgerSync(storeA, server.api(), "device-a", { isOnline: online, rand: fixedRand });
    expect((await storeA.listEntries(0, 10)).reduce((s, e) => s + e.amount, 0)).toBe(300);
  });

  it("does not advance the cursor on a malformed pull", async () => {
    const { api } = createFakeServer();
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 100);
    await runLedgerSync(store, api(), "device-1", { isOnline: online, rand: fixedRand });
    const before = await store.getCursor();
    expect(before).toBe(1);
    const s = await runLedgerSync(store, api({ failPull: "malformed" }), "device-1", {
      isOnline: online,
      rand: fixedRand,
    });
    expect(s.error).toContain("malformed");
    expect(await store.getCursor()).toBe(1);
  });

  it("treats ops missing from the server response as pending, never lost", async () => {
    const store = createMemoryOutboxStore();
    await enqueueExpense(store, 100);
    const empty: ApiClient = {
      push: async () => ({ results: [] }),
      pull: async () => ({ changes: [], next_cursor: 0 }),
    };
    const s = await runLedgerSync(store, empty, "device-1", { isOnline: online, rand: fixedRand });
    expect(s.synced).toBe(0);
    expect(await store.countPending()).toBe(1);
  });

  it("computes exponential backoff with a cap", () => {
    expect(computeRetryDelayMs(1, fixedRand)).toBe(1000);
    expect(computeRetryDelayMs(2, fixedRand)).toBe(2000);
    expect(computeRetryDelayMs(3, fixedRand)).toBe(4000);
    expect(computeRetryDelayMs(20, fixedRand)).toBe(60000);
  });

  it("re-enqueue of the same idempotency key returns the stored op", async () => {
    const store = createMemoryOutboxStore();
    const key = newUuid();
    const base = {
      operationId: newUuid(),
      idempotencyKey: key,
      entityType: "ledger_entry" as const,
      entityId: newUuid(),
      operationType: "CREATE_TRANSACTION" as const,
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: "device-1",
    };
    const first = await store.enqueue(base);
    const second = await store.enqueue({ ...base, operationId: newUuid() });
    expect(second.operationId).toBe(first.operationId);
    expect(await store.countPending()).toBe(1);
  });
});
