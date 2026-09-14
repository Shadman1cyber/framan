"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Price } from "@/components/ui/Price";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS_FA,
  ORDER_ACTION_LABELS_FA,
  ORDER_TYPE_LABELS_FA,
  orderStatusLabel,
  type OrderStatus,
  type OrderType,
} from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";

type Row = {
  id: string;
  status: OrderStatus;
  statusLabel: string;
  orderType: OrderType;
  total: number;
  estPrepMin: number | null;
  estPrepMax: number | null;
  createdAt: string;
  customerName: string;
  itemCount: number;
  tableLabel: string | null;
  tableNumber: string | null;
  allowedNext: OrderStatus[];
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه" },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS_FA[s] })),
];

export function OrdersAdmin({ initial, currentStatus }: { initial: Row[]; currentStatus?: string }) {
  const [items, setItems] = useState<Row[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { show } = useToast();

  async function refresh() {
    const res = await fetch(`/api/admin/orders${currentStatus ? `?status=${currentStatus}` : ""}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = await res.json();
    if (Array.isArray(json.orders)) setItems(json.orders as Row[]);
  }

  useEffect(() => {
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus]);

  async function setStatus(id: string, status: OrderStatus) {
    setBusyId(id);
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (res.ok) {
      setItems((xs) =>
        xs.map((x) =>
          x.id === id
            ? {
                ...x,
                status,
                statusLabel: orderStatusLabel(status, x.orderType),
                allowedNext: nextFor(status, x.orderType),
              }
            : x,
        ),
      );
      show("وضعیت سفارش به‌روزرسانی شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  function nextFor(status: OrderStatus, orderType: OrderType): OrderStatus[] {
    const map: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["PREPARING", "CANCELLED"],
      // Table orders complete directly from PREPARING (no serve/pickup step).
      PREPARING: orderType === "TABLE" ? ["COMPLETED", "CANCELLED"] : ["READY", "CANCELLED"],
      READY: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    return map[status] ?? [];
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" onClick={refresh} className="btn-secondary whitespace-nowrap">
          ♻ تازه‌سازی
        </button>
        <span className="text-xs text-muted">به‌روزرسانی خودکار هر ۸ ثانیه</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s.value}
            href={`/admin/orders${s.value ? `?status=${s.value}` : ""}`}
            className={`chip ${currentStatus === s.value ? "chip-active" : ""}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">سفارشی با این وضعیت نیست.</div>
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <div key={o.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {o.orderType === "TABLE" && o.tableNumber ? (
                    <Link href={`/order/${o.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-danger" />
                      سفارش میز {o.tableNumber}
                    </Link>
                  ) : (
                    <Link href={`/order/${o.id}`} className="font-semibold hover:underline">
                      #{o.id.slice(-6).toUpperCase()}
                    </Link>
                  )}
                  <span className={`chip ${o.orderType === "TABLE" ? "" : "chip-active"}`}>
                    {ORDER_TYPE_LABELS_FA[o.orderType]}
                  </span>
                  {o.tableLabel && o.orderType !== "TABLE" && <span className="chip">{o.tableLabel}</span>}
                  <span className="text-sm text-muted">{o.customerName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Price amount={o.total} size="sm" />
                  <span className="text-xs text-muted">
                    {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(o.createdAt),
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{o.itemCount} آیتم</span>
                {o.estPrepMin != null && o.estPrepMax != null && (
                  <span>
                    · برآورد آماده‌سازی: {o.estPrepMin}–{o.estPrepMax} دقیقه
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    o.status === "CANCELLED"
                      ? "bg-danger/10 text-danger"
                      : o.status === "COMPLETED"
                        ? "bg-beige text-espresso/70"
                        : "bg-olive-50 text-olive-600"
                  }`}
                >
                  {o.statusLabel}
                </span>
              </div>

              {/* Button-based workflow: only valid next steps are shown.
                  Table orders never receive a "آماده تحویل" action (Rule 3/4). */}
              {o.allowedNext.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-coffee/10 pt-3">
                  {o.allowedNext.map((next) => {
                    const isCancel = next === "CANCELLED";
                    const label =
                      next === "CANCELLED"
                        ? ORDER_ACTION_LABELS_FA.CANCELLED
                        : next === "CONFIRMED"
                          ? ORDER_ACTION_LABELS_FA.CONFIRMED
                          : next === "PREPARING"
                            ? ORDER_ACTION_LABELS_FA.PREPARING
                            : next === "READY"
                              ? ORDER_ACTION_LABELS_FA.READY
                              : ORDER_ACTION_LABELS_FA.COMPLETED;
                    return (
                      <button
                        key={next}
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => setStatus(o.id, next)}
                        className={
                          isCancel
                            ? "rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                            : "rounded-xl bg-olive px-4 py-2 text-xs font-medium text-cream transition-colors hover:bg-olive-600 disabled:opacity-50"
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
