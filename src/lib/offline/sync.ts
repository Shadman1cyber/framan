"use client";

import { getQueuedActions, removeAction, updateAction } from "./queue";
import type { QueuedAction } from "./queue";

type SyncStatus = "idle" | "syncing" | "error" | "synced";

type SyncCallbacks = {
  onStatusChange?: (status: SyncStatus) => void;
  onActionSynced?: (action: QueuedAction) => void;
  onActionFailed?: (action: QueuedAction, error: Error) => void;
  onAllSynced?: () => void;
};

let syncInProgress = false;
let callbacks: SyncCallbacks = {};

export function setSyncCallbacks(cb: SyncCallbacks) {
  callbacks = cb;
}

async function placeOrderAPI(payload: Record<string, unknown>) {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "خطا در ثبت سفارش");
  return json;
}

async function updateProfileAPI(payload: Record<string, unknown>) {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "خطا در به‌روزرسانی پروفایل");
  return json;
}

async function submitRatingAPI(payload: Record<string, unknown>) {
  const res = await fetch("/api/ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "خطا در ثبت امتیاز");
  return json;
}

async function executeAction(action: QueuedAction): Promise<void> {
  const { type, payload } = action;

  switch (type) {
    case "PLACE_ORDER":
      await placeOrderAPI(payload as Record<string, unknown>);
      break;
    case "UPDATE_PROFILE":
      await updateProfileAPI(payload as Record<string, unknown>);
      break;
    case "SUBMIT_RATING":
      await submitRatingAPI(payload as Record<string, unknown>);
      break;
    default:
      throw new Error(`Unknown action type: ${(type as string)}`);
  }
}

// Check if running in Capacitor
function isCapacitor(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

// Get network status - uses Capacitor Network plugin if available, falls back to navigator.onLine
async function getNetworkStatus(): Promise<boolean> {
  if (isCapacitor()) {
    try {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      return status.connected;
    } catch {
      // Fall back to browser API
    }
  }
  return navigator.onLine;
}

// Listen for network changes - uses Capacitor Network plugin if available
function addNetworkListener(callback: (online: boolean) => void): () => void {
  if (isCapacitor()) {
    let listener: { remove: () => void } | null = null;
    import("@capacitor/network")
      .then(({ Network }) => {
        Network.addListener("networkStatusChange", (status) => {
          callback(status.connected);
        })
          .then((l) => { listener = l; })
          .catch(() => {});
      })
      .catch(() => {});
    return () => { listener?.remove(); };
  } else {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }
}

export async function syncQueue(): Promise<void> {
  if (syncInProgress) return;
  if (typeof window === "undefined") return;
  if (!(await getNetworkStatus())) return;

  syncInProgress = true;
  callbacks.onStatusChange?.("syncing");

  try {
    const actions = await getQueuedActions();
    const pendingActions = actions.filter((a) => a.retryCount < 5);

    for (const action of pendingActions) {
      try {
        await executeAction(action);
        await removeAction(action.id);
        callbacks.onActionSynced?.(action);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const updatedAction = { ...action, retryCount: action.retryCount + 1, lastError: error.message };
        await updateAction(updatedAction);
        callbacks.onActionFailed?.(action, error);
      }
    }

    const remaining = await getQueuedActions();
    if (remaining.length === 0) {
      callbacks.onStatusChange?.("synced");
      callbacks.onAllSynced?.();
    } else {
      callbacks.onStatusChange?.("error");
    }
  } catch (err) {
    callbacks.onStatusChange?.("error");
    console.error("Sync failed:", err);
  } finally {
    syncInProgress = false;
  }
}

export function isSyncing(): boolean {
  return syncInProgress;
}

export function triggerSyncIfOnline(): void {
  getNetworkStatus().then((online) => {
    if (online && !syncInProgress) {
      syncQueue();
    }
  });
}

if (typeof window !== "undefined") {
  // Set up network listener
  const cleanup = addNetworkListener((online) => {
    if (online) {
      triggerSyncIfOnline();
    }
  });

  // Also listen for focus/visibility changes as fallback
  window.addEventListener("focus", () => {
    getNetworkStatus().then((online) => {
      if (online) triggerSyncIfOnline();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      getNetworkStatus().then((online) => {
        if (online) triggerSyncIfOnline();
      });
    }
  });

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    cleanup();
  });
}