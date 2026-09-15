"use client";
import { useEffect, useState } from "react";
import { useOffline } from "@/lib/offline/OfflineContext";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, lastSyncStatus, forceSync } = useOffline();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline || isSyncing || pendingCount > 0 || lastSyncStatus === "synced") {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isSyncing, pendingCount, lastSyncStatus]);

  if (!visible) return null;

  if (!isOnline) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 animate-slide-down"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>آفلاین هستید — تغییرات ذخیره شده و هنگام اتصال مجدد همگام‌سازی می‌شوند</span>
        </span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-olive-200 bg-olive-50 px-4 py-2 text-center text-sm text-olive-800 animate-slide-down"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span>در حال همگام‌سازی {pendingCount > 0 ? `(${pendingCount} مورد)` : ""}...</span>
        </span>
      </div>
    );
  }

  if (lastSyncStatus === "synced") {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-olive-200 bg-olive-50 px-4 py-2 text-center text-sm text-olive-800 animate-slide-down"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 text-olive-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>همگام‌سازی کامل شد</span>
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 animate-slide-down"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>{pendingCount} تغییر در صف انتظار همگام‌سازی</span>
          <button
            onClick={forceSync}
            className="ml-3 text-xs underline hover:text-amber-900"
            disabled={isSyncing}
          >
            همگام‌سازی الان
          </button>
        </span>
      </div>
    );
  }

  return null;
}