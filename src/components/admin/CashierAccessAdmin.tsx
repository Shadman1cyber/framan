"use client";

import { useState } from "react";
import { CASHIER_TABS, type CashierTabId } from "@/lib/cashier-access";
import { useToast } from "@/components/ui/Toast";

export function CashierAccessAdmin({ initial }: { initial: CashierTabId[] }) {
  const [enabled, setEnabled] = useState<CashierTabId[]>(initial);
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  function toggle(id: CashierTabId) {
    setEnabled((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function save() {
    setBusy(true);
    const res = await fetch("/api/admin/cashier-access", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabs: enabled }),
    });
    setBusy(false);
    if (res.ok) show("دسترسی‌های صندوق‌دار ذخیره شد", "success");
    else show("ذخیره دسترسی‌ها انجام نشد", "error");
  }

  return (
    <div className="card p-4">
      <p className="mb-4 text-sm text-muted">
        تب‌های فعال برای همه کاربران دارای نقش صندوق‌دار نمایش داده می‌شوند و API همان بخش‌ها نیز
        با همین تنظیم محافظت می‌شود.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {CASHIER_TABS.map((tab) => (
          <label key={tab.id} className="flex cursor-pointer items-center justify-between rounded-xl border border-coffee/10 p-3">
            <span className="font-medium">{tab.label}</span>
            <input
              type="checkbox"
              checked={enabled.includes(tab.id)}
              onChange={() => toggle(tab.id)}
              className="h-5 w-5 accent-olive"
            />
          </label>
        ))}
      </div>
      <button type="button" onClick={save} disabled={busy} className="btn-primary mt-4">
        {busy ? "در حال ذخیره..." : "ذخیره دسترسی‌ها"}
      </button>
    </div>
  );
}
