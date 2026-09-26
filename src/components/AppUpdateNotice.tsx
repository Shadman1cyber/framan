"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Non-disruptive update-in-place: with skipWaiting=false a new service worker
 * waits until the user opts in. Banner → postMessage(SKIP_WAITING) →
 * controllerchange → single reload.
 */
export function AppUpdateNotice() {
  const [waiting, setWaiting] = useState(false);
  const updateApproved = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (!updateApproved.current) return;
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | undefined;
    let onUpdateFound: (() => void) | undefined;
    let cancelled = false;

    const watchInstalling = (r?: ServiceWorkerRegistration) => {
      if (!r) return;
      if (reg && onUpdateFound) reg.removeEventListener("updatefound", onUpdateFound);
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(true);
      onUpdateFound = () => {
        const sw = r.installing;
        if (!sw) return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(true);
        });
      };
      r.addEventListener("updatefound", onUpdateFound);
    };

    navigator.serviceWorker.getRegistration().then((r) => {
      if (!cancelled) watchInstalling(r);
    });
    navigator.serviceWorker.ready.then((r) => {
      if (!cancelled) watchInstalling(r);
    }).catch(() => {});

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (reg && onUpdateFound) reg.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-2xl border border-olive/30 bg-cream-50 px-4 py-3 text-sm text-espresso shadow-elevated animate-fade-in sm:left-auto sm:w-96 dark:border-olive/40 dark:bg-dark-surface dark:text-dark-text dark:shadow-dark-elevated"
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0">نسخه جدیدی آماده است. برای اعمال، صفحه را تازه‌سازی کنید.</span>
      <button
        type="button"
        onClick={() => {
          void navigator.serviceWorker.getRegistration().then((r) => {
            if (r?.waiting) {
              updateApproved.current = true;
              r.waiting.postMessage({ type: "SKIP_WAITING" });
            }
          });
        }}
        className="btn-primary shrink-0 !px-3 !py-1.5 text-xs"
      >
        به‌روزرسانی
      </button>
    </div>
  );
}
