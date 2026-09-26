"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LEAVE_HEADER_REFRESH_MS } from "@/lib/admin-timing";

export function LeaveRequestHeader({
  role,
  initialPendingCount,
}: {
  role: "OWNER" | "CASHIER";
  initialPendingCount: number;
}) {
  const [pendingCount, setPendingCount] = useState(initialPendingCount);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/leave-requests", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json() as { pendingCount?: number };
    setPendingCount(data.pendingCount ?? 0);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, LEAVE_HEADER_REFRESH_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  // Cashier leave flow now lives in the dedicated "مرخصی‌ها" tab (/admin/leaves).
  if (role !== "OWNER") return null;
  if (pendingCount === 0) return null;
  return (
    <Link
      href="/admin/staff#leave-requests"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm shadow-sm transition hover:bg-warning/15"
      role="status"
    >
      <span className="flex items-center gap-2 font-semibold text-espresso dark:text-dark-text">
        <span aria-hidden="true">🔔</span>
        {pendingCount.toLocaleString("fa-IR")} درخواست مرخصی در انتظار بررسی است
      </span>
      <span className="shrink-0 text-xs font-semibold text-olive-700 dark:text-olive-300">بررسی درخواست‌ها ←</span>
    </Link>
  );
}
