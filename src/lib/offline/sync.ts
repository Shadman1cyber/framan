"use client";

import { getQueuedActions, removeAction, updateAction } from "./queue";
import type { QueuedAction } from "./queue";
import { isAllowedOfflineAdminMutation, type OfflineAdminMutation } from "./admin-mutation";

type SyncStatus = "idle" | "syncing" | "error" | "synced";

type SyncCallbacks = {
  onStatusChange?: (status: SyncStatus) => void;
  onActionSynced?: (action: QueuedAction) => void;
  onActionFailed?: (action: QueuedAction, error: Error) => void;
  onAllSynced?: () => void;
};

let syncInProgress = false;
let callbacks: SyncCallbacks = {};

class SyncActionError extends Error {
  constructor(message: string, public kind: "transient" | "conflict") {
    super(message);
  }
}

export function setSyncCallbacks(cb: SyncCallbacks) {
  callbacks = cb;
}

async function placeOrderAPI(payload: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new SyncActionError("ارتباط با سرور قطع شد", "transient");
  }
  if (res.ok) return res.json();
  const json = await res.json().catch(() => ({})) as { error?: string };
  const message = json.error ?? "خطا در ثبت سفارش";
  // Never silently resubmit at a different price: a rejected order (bad,
  // expired, inactive or exhausted discount code, invalid cart/table) is a
  // permanent conflict the customer must see — not a transient retry.
  const transient = [408, 425, 429, 502, 503, 504].includes(res.status);
  throw new SyncActionError(message, transient || res.status >= 500 ? "transient" : "conflict");
}

async function updateProfileAPI(payload: Record<string, unknown>) {
  const path = Array.isArray(payload.allergenIds) ? "/api/profile/allergies" : "/api/profile/preferences";
  const res = await fetch(path, {
    method: "PUT",
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

async function getCurrentActorId(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return null;
    const session = await response.json() as { user?: { id?: string } };
    return session.user?.id ?? null;
  } catch {
    throw new SyncActionError("سرور در دسترس نیست", "transient");
  }
}

async function executeAdminMutation(action: QueuedAction, currentActorId: string | null): Promise<void> {
  const mutation = action.payload as OfflineAdminMutation;
  if (!currentActorId) {
    throw new SyncActionError("برای همگام‌سازی دوباره با حساب ثبت‌کننده وارد شوید", "transient");
  }
  if (!action.actorId || action.actorId !== currentActorId) {
    throw new SyncActionError("این تغییر باید با همان حساب کاربری ثبت‌کننده همگام شود", "conflict");
  }
  if (!isAllowedOfflineAdminMutation(mutation)) {
    throw new SyncActionError("این تغییر دیگر در فهرست عملیات آفلاین مجاز نیست", "conflict");
  }
  try {
    const response = await fetch(mutation.path, {
      method: mutation.method,
      headers: {
        "Content-Type": "application/json",
        "X-Farman-Mutation-Id": action.id,
      },
      body: JSON.stringify(mutation.body),
    });
    const json = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      const transient = [408, 425, 429, 502, 503, 504].includes(response.status);
      throw new SyncActionError(json.error ?? "اعمال تغییر انجام نشد", transient ? "transient" : "conflict");
    }
  } catch (error) {
    if (error instanceof SyncActionError) throw error;
    throw new SyncActionError("ارتباط با سرور قطع شد", "transient");
  }
}

async function executeAction(action: QueuedAction, currentActorId: string | null): Promise<void> {
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
    case "ADMIN_MUTATION":
      await executeAdminMutation(action, currentActorId);
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
    const pendingActions = actions.filter((a) =>
      a.state !== "conflict" && (a.type === "ADMIN_MUTATION" || a.retryCount < 5),
    );
    const currentActorId = pendingActions.some((action) => action.type === "ADMIN_MUTATION")
      ? await getCurrentActorId()
      : null;

    for (const action of pendingActions) {
      try {
        await executeAction(action, currentActorId);
        await removeAction(action.id);
        callbacks.onActionSynced?.(action);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const kind = err instanceof SyncActionError ? err.kind : "transient";
        const updatedAction: QueuedAction = {
          ...action,
          retryCount: kind === "transient" ? action.retryCount + 1 : action.retryCount,
          state: kind === "conflict" ? "conflict" : "pending",
          lastError: error.message,
        };
        await updateAction(updatedAction);
        callbacks.onActionFailed?.(action, error);
        if (kind === "transient") break;
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
