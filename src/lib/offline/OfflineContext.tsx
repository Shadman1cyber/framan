"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getQueueStats, OFFLINE_QUEUE_CHANGED_EVENT } from "./queue";
import { setSyncCallbacks, syncQueue, isSyncing, triggerSyncIfOnline } from "./sync";
import {
  executeOrQueueAdminMutation,
  type OfflineAdminMutation,
  type OfflineMutationResult,
} from "./admin-mutation";

type OfflineContextValue = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  /** Most recent conflict error, surfaced in the offline banner. */
  lastConflictError: string | null;
  lastSyncStatus: "idle" | "synced" | "error";
  forceSync: () => void;
  mutateAdmin: <T extends Record<string, unknown> = Record<string, unknown>>(
    mutation: OfflineAdminMutation,
  ) => Promise<OfflineMutationResult<T>>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

// Check if running in Capacitor
function isCapacitor(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

// Cache the Network module to avoid repeated dynamic imports
let networkModulePromise: Promise<{ Network: { getStatus: () => Promise<{ connected: boolean }>; addListener: (event: string, callback: (status: { connected: boolean }) => void) => Promise<{ remove: () => void }> } } | null> | null = null;

function getNetworkModule() {
  if (!networkModulePromise) {
    networkModulePromise = import("@capacitor/network")
      .then((mod) => mod as { Network: { getStatus: () => Promise<{ connected: boolean }>; addListener: (event: string, callback: (status: { connected: boolean }) => void) => Promise<{ remove: () => void }> } })
      .catch(() => null);
  }
  return networkModulePromise;
}

// Get network status - uses Capacitor Network plugin if available, falls back to navigator.onLine
async function getNetworkStatus(): Promise<boolean> {
  if (isCapacitor()) {
    const mod = await getNetworkModule();
    if (mod) {
      try {
        const status = await mod.Network.getStatus();
        return status.connected;
      } catch {
        // Fall back to browser API
      }
    }
  }
  return navigator.onLine;
}

// Listen for network changes - uses Capacitor Network plugin if available
function addNetworkListener(callback: (online: boolean) => void): () => void {
  if (isCapacitor()) {
    let listener: { remove: () => void } | null = null;
    getNetworkModule().then((mod) => {
      if (mod) {
        mod.Network.addListener("networkStatusChange", (status) => {
          callback(status.connected);
        }).then((l) => { listener = l; }).catch(() => {});
      }
    });
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

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastConflictError, setLastConflictError] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<"idle" | "synced" | "error">("idle");

  const refreshStats = useCallback(() => {
    getQueueStats()
      .then((stats) => {
        setPendingCount(stats.total);
        setConflictCount(stats.conflicts);
        setLastConflictError(stats.lastConflictError);
      })
      .catch(() => {
        setPendingCount(0);
        setConflictCount(0);
        setLastConflictError(null);
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initial check
    getNetworkStatus().then(setIsOnline);
    refreshStats();

    // Set up network listener
    const cleanup = addNetworkListener((online) => {
      setIsOnline(online);
      if (online) {
        triggerSyncIfOnline();
      }
    });

    // Also listen for focus/visibility changes as fallback
    const handleFocus = () => {
      getNetworkStatus().then((online) => {
        if (online) triggerSyncIfOnline();
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        getNetworkStatus().then((online) => {
          if (online) triggerSyncIfOnline();
        });
      }
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshStats);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cleanup();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshStats);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshStats]);

  useEffect(() => {
    setSyncCallbacks({
      onStatusChange: (status) => {
        setSyncing(status === "syncing");
        if (status === "synced" || status === "error") {
          setLastSyncStatus(status);
        }
      },
      onActionSynced: refreshStats,
      onActionFailed: refreshStats,
      onAllSynced: refreshStats,
    });
  }, [refreshStats]);

  const forceSync = useCallback(() => {
    if (isOnline && !isSyncing()) {
      void syncQueue();
    }
  }, [isOnline]);

  const mutateAdmin = useCallback(async <T extends Record<string, unknown> = Record<string, unknown>>(
    mutation: OfflineAdminMutation,
  ) => {
    const actorId = (session?.user as { id?: string } | undefined)?.id ?? "";
    const result = await executeOrQueueAdminMutation<T>({ actorId, online: isOnline, mutation });
    refreshStats();
    return result;
  }, [isOnline, refreshStats, session?.user]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing: syncing,
        pendingCount,
        conflictCount,
        lastConflictError,
        lastSyncStatus,
        forceSync,
        mutateAdmin,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside OfflineProvider");
  return ctx;
}
