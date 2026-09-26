import type {
  LEDGER_OPERATION_TYPES,
} from "@/lib/ledger/service";

export type LedgerOperationType = (typeof LEDGER_OPERATION_TYPES)[number];

export type OutboxStatus = "pending" | "processing" | "failed";

export type OutboxOp = {
  operationId: string;
  idempotencyKey: string;
  entityType: "ledger_entry";
  entityId: string;
  operationType: LedgerOperationType;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  deviceId: string;
  status: OutboxStatus;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: number;
  createdAt: number;
};

export type LedgerEntrySnapshot = {
  id: string;
  entryType: string;
  referenceType: string;
  referenceId: string | null;
  accountId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  deviceId: string;
  reversalOf: string | null;
  serverSequence: number;
  serverReceivedAt: string | null;
};

export type PushResultItem =
  | { operation_id: string; status: "applied"; server_sequence: number; entry_id: string; duplicate?: boolean }
  | { operation_id: string; status: "rejected"; code: string; retryable: boolean; message?: string };

export type PushResponse = { results: PushResultItem[] };
export type PullResponse = { changes: LedgerEntrySnapshot[]; next_cursor: number };

export type ApiClient = {
  push: (body: {
    device_id: string;
    operations: Array<{
      operation_id: string;
      entity_type: string;
      entity_id: string;
      operation_type: string;
      payload: Record<string, unknown>;
      idempotency_key: string;
      client_timestamp: string;
    }>;
  }) => Promise<PushResponse>;
  pull: (after: number, take: number) => Promise<PullResponse>;
};

export class SyncTransportError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "SyncTransportError";
  }
}

export class SyncAuthError extends Error {
  readonly retryable = false;
  constructor(message = "authentication required") {
    super(message);
    this.name = "SyncAuthError";
  }
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

export function computeRetryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const safeAttempt = Math.min(Math.max(Math.floor(attempt), 1), 10);
  const backoff = Math.min(BASE_DELAY_MS * 2 ** (safeAttempt - 1), MAX_DELAY_MS);
  const jitter = backoff * 0.25 * (rand() * 2 - 1);
  return Math.round(backoff + jitter);
}

export function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type LedgerOutboxStore = {
  enqueue: (op: Omit<OutboxOp, "status" | "attemptCount" | "lastError" | "nextRetryAt" | "createdAt">) => Promise<OutboxOp>;
  listDue: (now: number, limit: number) => Promise<OutboxOp[]>;
  markProcessing: (keys: string[]) => Promise<void>;
  markSynced: (keys: string[]) => Promise<void>;
  markRetryable: (key: string, error: string, nextRetryAt: number) => Promise<void>;
  markFailed: (key: string, error: string) => Promise<void>;
  retryFailed: (key: string) => Promise<boolean>;
  resetProcessing: () => Promise<number>;
  countPending: () => Promise<number>;
  listFailed: () => Promise<OutboxOp[]>;
  getCursor: () => Promise<number>;
  applyPulled: (entries: LedgerEntrySnapshot[], nextCursor: number) => Promise<number>;
  listEntries: (afterSequence: number, take: number) => Promise<LedgerEntrySnapshot[]>;
};

export function createMemoryOutboxStore(): LedgerOutboxStore {
  const ops = new Map<string, OutboxOp>();
  const entries = new Map<string, LedgerEntrySnapshot>();
  let cursor = 0;
  return {
    async enqueue(op) {
      if (ops.has(op.idempotencyKey)) return ops.get(op.idempotencyKey)!;
      const record: OutboxOp = {
        ...op,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        nextRetryAt: 0,
        createdAt: Date.now(),
      };
      ops.set(record.idempotencyKey, record);
      return record;
    },
    async listDue(now, limit) {
      return [...ops.values()]
        .filter((o) => o.status === "pending" && o.nextRetryAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit);
    },
    async markProcessing(keys) {
      for (const k of keys) {
        const o = ops.get(k);
        if (o && o.status === "pending") o.status = "processing";
      }
    },
    async markSynced(keys) {
      for (const k of keys) ops.delete(k);
    },
    async markRetryable(key, error, nextRetryAt) {
      const o = ops.get(key);
      if (!o) return;
      o.status = "pending";
      o.attemptCount += 1;
      o.lastError = error;
      o.nextRetryAt = nextRetryAt;
    },
    async markFailed(key, error) {
      const o = ops.get(key);
      if (!o) return;
      o.status = "failed";
      o.attemptCount += 1;
      o.lastError = error;
    },
    async retryFailed(key) {
      const o = ops.get(key);
      if (!o || o.status !== "failed") return false;
      o.status = "pending";
      o.nextRetryAt = 0;
      return true;
    },
    async resetProcessing() {
      let n = 0;
      for (const o of ops.values()) {
        if (o.status === "processing") {
          o.status = "pending";
          n += 1;
        }
      }
      return n;
    },
    async countPending() {
      let n = 0;
      for (const o of ops.values()) if (o.status !== "failed") n += 1;
      return n;
    },
    async listFailed() {
      return [...ops.values()]
        .filter((o) => o.status === "failed")
        .sort((a, b) => a.createdAt - b.createdAt);
    },
    async getCursor() {
      return cursor;
    },
    async applyPulled(pulled, nextCursor) {
      for (const e of pulled) {
        const prev = entries.get(e.id);
        if (!prev || (e.serverSequence ?? 0) >= (prev.serverSequence ?? 0)) entries.set(e.id, e);
      }
      if (nextCursor > cursor) cursor = nextCursor;
      return cursor;
    },
    async listEntries(afterSequence, take) {
      return [...entries.values()]
        .filter((e) => e.serverSequence > afterSequence)
        .sort((a, b) => a.serverSequence - b.serverSequence)
        .slice(0, take);
    },
  };
}

const IDB_NAME = "farmans-ledger-outbox";
const IDB_VERSION = 1;
const OPS_STORE = "operations";
const ENTRIES_STORE = "entries";
const META_STORE = "meta";
const CURSOR_KEY = "ledger-cursor";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        const s = db.createObjectStore(OPS_STORE, { keyPath: "idempotencyKey" });
        s.createIndex("status", "status", { unique: false });
        s.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        const s = db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
        s.createIndex("serverSequence", "serverSequence", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

export function createIndexedDbOutboxStore(): LedgerOutboxStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= idb());
  return {
    async enqueue(op) {
      const d = await db();
      const existing = await req(d.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).get(op.idempotencyKey) as IDBRequest<OutboxOp | undefined>);
      if (existing) return existing;
      const record: OutboxOp = {
        ...op,
        status: "pending",
        attemptCount: 0,
        lastError: null,
        nextRetryAt: 0,
        createdAt: Date.now(),
      };
      const t = d.transaction(OPS_STORE, "readwrite");
      t.objectStore(OPS_STORE).add(record);
      await txDone(t);
      return record;
    },
    async listDue(now, limit) {
      const d = await db();
      const all = await req(d.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).getAll() as IDBRequest<OutboxOp[]>);
      return all
        .filter((o) => o.status === "pending" && o.nextRetryAt <= now)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, limit);
    },
    async markProcessing(keys) {
      if (keys.length === 0) return;
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      for (const k of keys) {
        const o = await req(s.get(k) as IDBRequest<OutboxOp | undefined>);
        if (o && o.status === "pending") {
          o.status = "processing";
          s.put(o);
        }
      }
      await txDone(t);
    },
    async markSynced(keys) {
      if (keys.length === 0) return;
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      for (const k of keys) s.delete(k);
      await txDone(t);
    },
    async markRetryable(key, error, nextRetryAt) {
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      const o = await req(s.get(key) as IDBRequest<OutboxOp | undefined>);
      if (o) {
        o.status = "pending";
        o.attemptCount += 1;
        o.lastError = error;
        o.nextRetryAt = nextRetryAt;
        s.put(o);
      }
      await txDone(t);
    },
    async markFailed(key, error) {
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      const o = await req(s.get(key) as IDBRequest<OutboxOp | undefined>);
      if (o) {
        o.status = "failed";
        o.attemptCount += 1;
        o.lastError = error;
        s.put(o);
      }
      await txDone(t);
    },
    async retryFailed(key) {
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      const o = await req(s.get(key) as IDBRequest<OutboxOp | undefined>);
      if (!o || o.status !== "failed") {
        await txDone(t);
        return false;
      }
      o.status = "pending";
      o.nextRetryAt = 0;
      s.put(o);
      await txDone(t);
      return true;
    },
    async resetProcessing() {
      const d = await db();
      const t = d.transaction(OPS_STORE, "readwrite");
      const s = t.objectStore(OPS_STORE);
      const all = await req(s.getAll() as IDBRequest<OutboxOp[]>);
      let n = 0;
      for (const o of all) {
        if (o.status === "processing") {
          o.status = "pending";
          s.put(o);
          n += 1;
        }
      }
      await txDone(t);
      return n;
    },
    async countPending() {
      const d = await db();
      const all = await req(d.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).getAll() as IDBRequest<OutboxOp[]>);
      return all.filter((o) => o.status !== "failed").length;
    },
    async listFailed() {
      const d = await db();
      const all = await req(d.transaction(OPS_STORE, "readonly").objectStore(OPS_STORE).getAll() as IDBRequest<OutboxOp[]>);
      return all.filter((o) => o.status === "failed").sort((a, b) => a.createdAt - b.createdAt);
    },
    async getCursor() {
      const d = await db();
      try {
        const row = await req(
          d.transaction(META_STORE, "readonly").objectStore(META_STORE).get(CURSOR_KEY) as IDBRequest<{ key: string; value: number } | undefined>,
        );
        return row?.value ?? 0;
      } catch {
        return 0;
      }
    },
    async applyPulled(pulled, nextCursor) {
      const d = await db();
      const t = d.transaction([ENTRIES_STORE, META_STORE], "readwrite");
      const es = t.objectStore(ENTRIES_STORE);
      const ms = t.objectStore(META_STORE);
      const cur = await req(ms.get(CURSOR_KEY) as IDBRequest<{ key: string; value: number } | undefined>).catch(() => undefined);
      const cursor = cur?.value ?? 0;
      for (const e of pulled) {
        const prev = await req(es.get(e.id) as IDBRequest<LedgerEntrySnapshot | undefined>);
        if (!prev || (e.serverSequence ?? 0) >= (prev.serverSequence ?? 0)) es.put(e);
      }
      const next = Math.max(cursor, nextCursor);
      ms.put({ key: CURSOR_KEY, value: next });
      await txDone(t);
      return next;
    },
    async listEntries(afterSequence, take) {
      const d = await db();
      const idx = d.transaction(ENTRIES_STORE, "readonly").objectStore(ENTRIES_STORE).index("serverSequence");
      const range = IDBKeyRange.lowerBound(afterSequence + 1);
      const out: LedgerEntrySnapshot[] = await new Promise((resolve, reject) => {
        const acc: LedgerEntrySnapshot[] = [];
        const cursorReq = idx.openCursor(range);
        cursorReq.onsuccess = () => {
          const c = cursorReq.result;
          if (!c || acc.length >= take) return resolve(acc);
          acc.push(c.value as LedgerEntrySnapshot);
          c.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error ?? new Error("cursor failed"));
      });
      return out;
    },
  };
}

export type SyncRunSummary = {
  pushed: number;
  synced: number;
  failed: number;
  pulled: number;
  cursor: number;
  authRequired: boolean;
  error: string | null;
};

export type SyncEngineDeps = {
  isOnline: () => boolean | Promise<boolean>;
  now?: () => number;
  rand?: () => number;
  batchSize?: number;
  pullTake?: number;
};

const PUSH_BATCH = 20;

export async function runLedgerSync(
  store: LedgerOutboxStore,
  api: ApiClient,
  deviceId: string,
  deps: SyncEngineDeps,
): Promise<SyncRunSummary> {
  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? Math.random;
  const summary: SyncRunSummary = {
    pushed: 0,
    synced: 0,
    failed: 0,
    pulled: 0,
    cursor: await store.getCursor(),
    authRequired: false,
    error: null,
  };
  if (!(await deps.isOnline())) return summary;

  const due = await store.listDue(now(), deps.batchSize ?? PUSH_BATCH);
  if (due.length > 0) {
    const keys = due.map((o) => o.idempotencyKey);
    await store.markProcessing(keys);
    let results: PushResultItem[];
    try {
      const res = await api.push({
        device_id: deviceId,
        operations: due.map((o) => ({
          operation_id: o.operationId,
          entity_type: o.entityType,
          entity_id: o.entityId,
          operation_type: o.operationType,
          payload: o.payload,
          idempotency_key: o.idempotencyKey,
          client_timestamp: o.clientTimestamp,
        })),
      });
      if (!res || !Array.isArray(res.results)) throw new SyncTransportError("malformed push response");
      results = res.results;
    } catch (e) {
      if (e instanceof SyncAuthError) {
        for (const k of keys) {
          await store.markRetryable(k, "authentication required", now());
        }
        summary.authRequired = true;
        summary.error = "authentication required";
        return summary;
      }
      const attempt = due[0]?.attemptCount ?? 0;
      const delay = computeRetryDelayMs(attempt + 1, rand);
      const msg = e instanceof Error ? e.message : String(e);
      for (const k of keys) await store.markRetryable(k, msg, now() + delay);
      summary.error = msg;
      return summary;
    }
    summary.pushed = due.length;
    const seen = new Set<string>();
    for (const r of results) {
      seen.add(r.operation_id);
      const op = due.find((o) => o.operationId === r.operation_id);
      if (!op) continue;
      if (r.status === "applied") {
        await store.markSynced([op.idempotencyKey]);
        summary.synced += 1;
      } else if (r.retryable) {
        const delay = computeRetryDelayMs(op.attemptCount + 1, rand);
        await store.markRetryable(op.idempotencyKey, `${r.code}: ${r.message ?? ""}`.trim(), now() + delay);
      } else {
        await store.markFailed(op.idempotencyKey, `${r.code}: ${r.message ?? ""}`.trim());
        summary.failed += 1;
      }
    }
    for (const op of due) {
      if (seen.has(op.operationId)) continue;
      const delay = computeRetryDelayMs(op.attemptCount + 1, rand);
      await store.markRetryable(op.idempotencyKey, "missing from server response", now() + delay);
    }
  }

  try {
    const pull = await api.pull(summary.cursor, deps.pullTake ?? 200);
    if (!pull || !Array.isArray(pull.changes) || typeof pull.next_cursor !== "number") {
      throw new SyncTransportError("malformed pull response");
    }
    summary.cursor = await store.applyPulled(pull.changes, pull.next_cursor);
    summary.pulled = pull.changes.length;
  } catch (e) {
    if (e instanceof SyncAuthError) {
      summary.authRequired = true;
      summary.error = summary.error ?? "authentication required";
    } else {
      summary.error = summary.error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  return summary;
}

export function createFetchApiClient(base = ""): ApiClient {
  const timeout = (ms: number) => AbortSignal.timeout(ms);
  return {
    async push(body) {
      let res: Response;
      try {
        res = await fetch(`${base}/api/sync/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: timeout(15000),
        });
      } catch (e) {
        throw new SyncTransportError(e instanceof Error ? e.message : "network error");
      }
      // 401 = signed out; 403 = signed in without finance.view (cashier) —
      // both need a different account, not a retry.
      if (res.status === 401 || res.status === 403) throw new SyncAuthError();
      if (res.status === 429) throw new SyncTransportError("rate limited");
      if (res.status >= 500) throw new SyncTransportError(`server error ${res.status}`);
      let json: PushResponse;
      try {
        json = (await res.json()) as PushResponse;
      } catch {
        throw new SyncTransportError("invalid push response");
      }
      return json;
    },
    async pull(after, take) {
      let res: Response;
      try {
        res = await fetch(`${base}/api/sync/pull?after=${after}&take=${take}`, { signal: timeout(15000) });
      } catch (e) {
        throw new SyncTransportError(e instanceof Error ? e.message : "network error");
      }
      // See push: 403 without finance.view is an auth/role problem, not transient.
      if (res.status === 401 || res.status === 403) throw new SyncAuthError();
      if (!res.ok) throw new SyncTransportError(`pull failed: ${res.status}`);
      try {
        return (await res.json()) as PullResponse;
      } catch {
        throw new SyncTransportError("invalid pull response");
      }
    },
  };
}

const DEVICE_KEY = "farmans-device-id";
let memDeviceId: string | null = null;

export function getDeviceId(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(DEVICE_KEY);
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
      const id = newUuid();
      window.localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      // storage unavailable (private mode): fall through to memory id
    }
  }
  if (!memDeviceId) memDeviceId = newUuid();
  return memDeviceId;
}
