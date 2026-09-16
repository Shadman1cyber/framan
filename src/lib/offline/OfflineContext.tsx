"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getActionCount } from "./queue";
import { setSyncCallbacks, syncQueue, isSyncing, triggerSyncIfOnline } from "./sync";
import type { QueuedAction } from "./queue";

type OfflineContextValue = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncStatus: "idle" | "synced" | "error";
  forceSync: () => void;
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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncStatus, setLastSyncStatus] = useState<"idle" | "synced" | "error">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initial check
    getNetworkStatus().then(setIsOnline);
    getActionCount().then(setPendingCount).catch(() => setPendingCount(0));

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
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cleanup();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setSyncCallbacks({
      onStatusChange: (status) => {
        if (status === "synced" || status === "error") {
          setLastSyncStatus(status);
        }
      },
      onActionSynced: () => {
        getActionCount().then(setPendingCount).catch(() => setPendingCount(0));
      },
      onActionFailed: () => {
        getActionCount().then(setPendingCount).catch(() => setPendingCount(0));
      },
      onAllSynced: () => {
        getActionCount().then(setPendingCount).catch(() => setPendingCount(0));
      },
    });
  }, []);

  const forceSync = useCallback(() => {
    if (isOnline && !isSyncing()) {
      syncQueue();
    }
  }, [isOnline]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing: isSyncing(),
        pendingCount,
        lastSyncStatus,
        forceSync,
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