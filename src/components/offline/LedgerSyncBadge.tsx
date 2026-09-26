"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { retryAllFailedLedger, useLedgerSync } from "@/lib/offline/ledger-sync";

// Ledger sync requires finance.view (OWNER). Cashiers/customers get 403
// forever — don't show a stuck error badge for accounts that can't sync.
function canSyncLedger(role?: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function LedgerSyncBadge() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!canSyncLedger(role)) return null;
  return <LedgerSyncBadgeInner />;
}

function LedgerSyncBadgeInner() {
  const pathname = usePathname();
  const { state, pending, failed, syncNow } = useLedgerSync();

  if (pathname === "/admin") return null;
  if (state === "idle" || state === "synced") return null;
  if (state === "offline" && pending === 0 && failed === 0) return null;

  const style =
    state === "syncing"
      ? "border-olive-200 bg-olive-50 text-olive-800 dark:border-olive-900 dark:bg-olive-900/30 dark:text-olive-300"
      : state === "auth-required"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300"
        : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6" role="status" aria-live="polite">
      <div className={`pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-xs shadow-elevated backdrop-blur ${style}`}>
        {state === "syncing" && (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {state === "offline" && <span aria-hidden="true">📴</span>}
        {state === "error" && <span aria-hidden="true">⚠️</span>}
        <span>
          {state === "offline" && `آفلاین — ${pending + failed} تراکنش ذخیره شد؛ در انتظار اتصال`}
          {state === "syncing" && "در حال همگام‌سازی تراکنش‌ها..."}
          {state === "error" &&
            (failed > 0
              ? `${failed} تراکنش همگام نشد — در صف باقی ماند`
              : "خطا در همگام‌سازی")}
          {state === "auth-required" && "نشست منقضی شده است؛ برای همگام‌سازی دوباره وارد شوید"}
        </span>
        {(state === "error" || (state === "offline" && pending > 0)) && (
          <button
            type="button"
            onClick={() => {
              if (failed > 0) void retryAllFailedLedger();
              else syncNow();
            }}
            className="underline"
          >
            تلاش مجدد
          </button>
        )}
        {state === "auth-required" && (
          <Link href="/admin/login" className="underline">
            ورود
          </Link>
        )}
      </div>
    </div>
  );
}
