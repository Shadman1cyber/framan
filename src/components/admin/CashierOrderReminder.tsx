"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const FIVE_MINUTES = 5 * 60 * 1000;

export function CashierOrderReminder({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setOpen(true), FIVE_MINUTES);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (!enabled || !open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-espresso/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cashier-reminder-title">
      <div className="card w-full max-w-sm p-5 shadow-elevated">
        <div className="text-3xl" aria-hidden="true">⏰</div>
        <h2 id="cashier-reminder-title" className="mt-2 text-lg font-bold text-espresso">یادآوری وضعیت سفارش‌ها</h2>
        <p className="mt-2 text-sm text-muted">لطفاً وضعیت سفارش‌های جاری را بررسی و آخرین وضعیت را ثبت کنید.</p>
        <div className="mt-5 flex gap-2">
          <Link href="/admin/orders" onClick={() => setOpen(false)} className="btn-primary flex-1 text-center">مشاهده سفارش‌ها</Link>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary">بعداً</button>
        </div>
      </div>
    </div>
  );
}
