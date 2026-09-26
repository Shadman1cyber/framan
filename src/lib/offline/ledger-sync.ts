"use client";

import { useSyncExternalStore } from "react";
import { getSession } from "next-auth/react";
import {
  createFetchApiClient,
  createIndexedDbOutboxStore,
  getDeviceId,
  newUuid,
  runLedgerSync,
  type LedgerOutboxStore,
} from "./ledger-outbox";

// finance.view is OWNER-only; cashiers would get permanent 403s.
async function canSyncLedger(): Promise<boolean> {
  try {
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    return role === "OWNER" || role === "ADMIN";
  } catch {
    return false;
  }
}

export type LedgerSyncState =
  | "idle"
  | "offline"
  | "syncing"
  | "synced"
  | "error"
  | "auth-required";

export type LedgerSnapshot = {
  state: LedgerSyncState;
  pending: number;
  failed: number;
  cursor: number;
  lastError: string | null;
};

let store: LedgerOutboxStore | null = null;
let inFlight = false;
let listenersBound = false;
const listeners = new Set<() => void>();
let snapshot: LedgerSnapshot = { state: "idle", pending: 0, failed: 0, cursor: 0, lastError: null };

function getStore(): LedgerOutboxStore {
  if (!store) store = createIndexedDbOutboxStore();
  return store;
}

function emit() {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      // one bad subscriber must not break the rest
    }
  }
}

function setSnapshot(patch: Partial<LedgerSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

async function readNetworkStatus(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if ("Capacitor" in window) {
    try {
      const { Network } = await import("@capacitor/network");
      return (await Network.getStatus()).connected;
    } catch {
      // fall through to browser API
    }
  }
  return navigator.onLine;
}

export async function refreshLedgerSnapshot(): Promise<LedgerSnapshot> {
  try {
    const [pending, failed, cursor] = await Promise.all([
      getStore().countPending(),
      getStore().listFailed(),
      getStore().getCursor(),
    ]);
    setSnapshot({
      pending,
      failed: failed.length,
      cursor,
      ...(snapshot.state !== "syncing" && snapshot.state !== "auth-required"
        ? { state: pending > 0 ? "error" : snapshot.state }
        : {}),
    });
  } catch {
    // IndexedDB unavailable (SSR/private mode): keep last snapshot
  }
  return snapshot;
}

export function subscribeLedgerSync(cb: () => void): () => void {
  listeners.add(cb);
  bindListeners();
  void refreshLedgerSnapshot();
  return () => {
    listeners.delete(cb);
  };
}

export function getLedgerSnapshot(): LedgerSnapshot {
  return snapshot;
}

export function useLedgerSync(): LedgerSnapshot & {
  syncNow: () => void;
  retryFailed: (key: string) => Promise<void>;
} {
  const snap = useSyncExternalStore(subscribeLedgerSync, getLedgerSnapshot, getLedgerSnapshot);
  return {
    ...snap,
    syncNow: () => void runLedgerSyncNow(),
    retryFailed: (key: string) => retryFailedLedgerOperation(key),
  };
}

export async function runLedgerSyncNow(): Promise<void> {
  if (typeof window === "undefined" || inFlight) return;
  if (!(await canSyncLedger())) {
    setSnapshot({ state: "idle", lastError: null });
    return;
  }
  inFlight = true;
  setSnapshot({ state: "syncing", lastError: null });
  try {
    if (!(await readNetworkStatus())) {
      setSnapshot({ state: "offline" });
      return;
    }
    const summary = await runLedgerSync(getStore(), createFetchApiClient(), getDeviceId(), {
      isOnline: readNetworkStatus,
    });
    const [pending, failed] = await Promise.all([
      getStore().countPending(),
      getStore().listFailed(),
    ]);
    if (summary.authRequired) {
      setSnapshot({ state: "auth-required", pending, failed: failed.length, cursor: summary.cursor, lastError: "نشست منقضی شده است؛ لطفاً دوباره وارد شوید" });
    } else if (failed.length > 0 || summary.error) {
      setSnapshot({
        state: "error",
        pending,
        failed: failed.length,
        cursor: summary.cursor,
        lastError: failed.length > 0 ? (failed[0].lastError ?? "خطا در همگام‌سازی") : summary.error,
      });
    } else if (pending > 0) {
      setSnapshot({ state: "error", pending, failed: 0, cursor: summary.cursor, lastError: summary.error });
    } else {
      setSnapshot({ state: "synced", pending: 0, failed: 0, cursor: summary.cursor, lastError: null });
    }
  } catch (e) {
    setSnapshot({
      state: "error",
      lastError: e instanceof Error ? e.message : "خطا در همگام‌سازی",
    });
  } finally {
    inFlight = false;
  }
}

export async function recoverAndSyncLedger(): Promise<void> {
  try {
    await getStore().resetProcessing();
  } catch {
    return;
  }
  await runLedgerSyncNow();
}

export async function enqueueLedgerEntry(input: {
  entryType: string;
  amount: number;
  referenceType?: string;
  referenceId?: string | null;
  accountId?: string;
  currency?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ operationId: string; idempotencyKey: string; entryId: string }> {
  const entryId = newUuid();
  const operationId = newUuid();
  const idempotencyKey = newUuid();
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  await getStore().enqueue({
    operationId,
    idempotencyKey,
    entityType: "ledger_entry",
    entityId: entryId,
    operationType: "CREATE_TRANSACTION",
    payload: {
      entry: {
        id: entryId,
        entryType: input.entryType,
        referenceType: input.referenceType ?? "order",
        referenceId: input.referenceId ?? null,
        accountId: input.accountId ?? "cash",
        amount: input.amount,
        currency: input.currency ?? "TOMAN",
        occurredAt: input.occurredAt ?? now,
        deviceId,
        metadata: input.metadata ?? {},
      },
    },
    clientTimestamp: now,
    deviceId,
  });
  await refreshLedgerSnapshot();
  void readNetworkStatus().then((online) => {
    if (online) void runLedgerSyncNow();
  });
  return { operationId, idempotencyKey, entryId };
}

export async function retryFailedLedgerOperation(key: string): Promise<void> {
  try {
    await getStore().retryFailed(key);
  } catch {
    return;
  }
  await refreshLedgerSnapshot();
  await runLedgerSyncNow();
}

export async function retryAllFailedLedger(): Promise<number> {
  let failed: { idempotencyKey: string }[] = [];
  try {
    failed = await getStore().listFailed();
    for (const f of failed) await getStore().retryFailed(f.idempotencyKey);
  } catch {
    return 0;
  }
  await refreshLedgerSnapshot();
  await runLedgerSyncNow();
  return failed.length;
}

function bindListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  void recoverAndSyncLedger();
  const onOnline = () => void recoverAndSyncLedger();
  const onVisible = () => {
    if (document.visibilityState === "visible") void runLedgerSyncNow();
  };
  if ("Capacitor" in window) {
    import("@capacitor/network")
      .then(({ Network }) => {
        Network.addListener("networkStatusChange", (s) => {
          if (s.connected) void recoverAndSyncLedger();
          else setSnapshot({ state: "offline" });
        }).catch(() => undefined);
      })
      .catch(() => undefined);
  } else {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setSnapshot({ state: "offline" }));
  }
  window.addEventListener("focus", () => void runLedgerSyncNow());
  document.addEventListener("visibilitychange", onVisible);
}
