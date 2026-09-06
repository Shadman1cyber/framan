"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Price } from "@/components/ui/Price";
import { ORDER_STATUS_LABELS_FA, type OrderStatus, ORDER_STATUSES } from "@/lib/constants";

type Row = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string;
  itemCount: number;
  tableLabel: string | null;
};

export function OrdersAdmin({ initial, currentStatus }: { initial: Row[]; currentStatus?: string }) {
  const [items, setItems] = useState(initial);

  async function refresh() {
    const res = await fetch(`/api/admin/orders${currentStatus ? `?status=${currentStatus}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json.orders)) setItems(json.orders as Row[]);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      refresh();
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);

  async function setStatus(id: string, status: OrderStatus) {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status } : x)));
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "خطا");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={refresh}
          className="btn-secondary whitespace-nowrap"
        >
          ♻ تازه‌سازی
        </button>
        <span className="text-xs text-muted">به‌روزرسانی خودکار هر ۵ ثانیه</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/orders" className={`chip ${!currentStatus ? "chip-active" : ""}`}>همه</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/admin/orders?status=${s}`} className={`chip ${currentStatus === s ? "chip-active" : ""}`}>
            {ORDER_STATUS_LABELS_FA[s]}
          </Link>
        ))}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-beige text-espresso/70">
            <tr>
              <th className="p-3 text-right">شماره</th>
              <th className="p-3 text-right">مشتری</th>
              <th className="p-3 text-right">میز</th>
              <th className="p-3 text-right">اقلام</th>
              <th className="p-3 text-right">مبلغ</th>
              <th className="p-3 text-right">وضعیت</th>
              <th className="p-3 text-right">زمان</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} className="border-t border-coffee/10">
                <td className="p-3">
                  <Link href={`/order/${o.id}`} className="font-medium hover:underline">#{o.id.slice(-6).toUpperCase()}</Link>
                </td>
                <td className="p-3">{o.customerName}</td>
                <td className="p-3 text-muted">{o.tableLabel ?? "-"}</td>
                <td className="p-3 text-muted">{o.itemCount}</td>
                <td className="p-3"><Price amount={o.total} size="sm" /></td>
                <td className="p-3">
                  <select
                    value={o.status}
                    onChange={(e) => setStatus(o.id, e.target.value as OrderStatus)}
                    className="rounded-lg border border-coffee/15 bg-cream-50 px-2 py-1 text-xs"
                  >
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>{ORDER_STATUS_LABELS_FA[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3 text-xs text-muted">
                  {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(o.createdAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}