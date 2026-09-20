"use client";
import { useEffect, useRef, useState } from "react";
import { useOffline } from "@/lib/offline/OfflineContext";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, conflictCount, lastSyncStatus, forceSync } = useOffline();
  const [visible, setVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const prevSyncing = useRef(isSyncing);

  useEffect(() => {
    if (!isOnline || isSyncing || pendingCount > 0) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isSyncing, pendingCount, conflictCount]);

  // Show the "sync complete" toast on the syncing → done transition.
  useEffect(() => {
    if (prevSyncing.current && !isSyncing && lastSyncStatus === "synced" && isOnline) {
      setToastVisible(true);
    }
    prevSyncing.current = isSyncing;
    if (isSyncing || !isOnline || conflictCount > 0) {
      setToastVisible(false);
    }
  }, [isSyncing, lastSyncStatus, isOnline, conflictCount]);

  // Auto-dismiss the toast after 5 seconds.
  useEffect(() => {
    if (!toastVisible) return;
    const timer = setTimeout(() => setToastVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [toastVisible]);

  const toast = toastVisible ? (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-4 right-4 z-50 flex items-center gap-2.5 rounded-2xl border border-olive/30 bg-cream-50 px-3.5 py-3 text-sm text-espresso shadow-elevated animate-fade-in sm:left-auto sm:w-80 dark:border-olive/40 dark:bg-dark-surface dark:text-dark-text dark:shadow-dark-elevated"
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-olive/15 text-olive-600 dark:bg-olive/20 dark:text-olive-300">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 font-medium">همگام‌سازی کامل شد</span>
      <button
        type="button"
        onClick={() => setToastVisible(false)}
        aria-label="بستن اعلان"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-beige hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive/40 dark:hover:bg-dark-surfaceHover dark:hover:text-dark-text"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  ) : null;

  if (!visible) return toast;

  if (!isOnline) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 animate-slide-down dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
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
        className="fixed top-0 left-0 right-0 z-50 border-b border-olive-200 bg-olive-50 px-4 py-2 text-center text-sm text-olive-800 animate-slide-down dark:border-olive-900 dark:bg-olive-900/30 dark:text-olive-300"
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

  if (conflictCount > 0) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 border-b border-danger/30 bg-red-50 px-4 py-2 text-center text-sm text-danger animate-slide-down dark:bg-danger/10"
        role="alert"
        aria-live="assertive"
      >
        {conflictCount.toLocaleString("fa-IR")} تغییر آفلاین به‌دلیل تعارض یا تغییر حساب اعمال نشد؛ اطلاعات سرور را بررسی کنید.
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <>
        <div
          className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 animate-slide-down dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
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
              className="ml-3 text-xs underline hover:text-amber-900 dark:hover:text-amber-300"
              disabled={isSyncing}
            >
              همگام‌سازی الان
            </button>
          </span>
        </div>
        {toast}
      </>
    );
  }

  return toast;
}
