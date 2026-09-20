"use client";
import { formatJalaliDateTime } from "@/lib/jalali";
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
import { useOffline } from "@/lib/offline/OfflineContext";

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

type ProductOption = { id: string; nameFa: string; price: number };
type TableOption = { id: string; number: string; label: string | null };

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "همه" },
  ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS_FA[s] })),
];

export function OrdersAdmin({
  initial,
  currentStatus,
  products,
  tables,
}: {
  initial: Row[];
  currentStatus?: string;
  products: ProductOption[];
  tables: TableOption[];
}) {
  const [items, setItems] = useState<Row[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [creating, setCreating] = useState(false);
  const [manual, setManual] = useState({
    tableId: "",
    customerName: "",
    notes: "",
    lines: [{ productId: products[0]?.id ?? "", quantity: 1 }],
  });
  const { show } = useToast();
  const { mutateAdmin } = useOffline();

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
    try {
      const result = await mutateAdmin({
        path: `/api/admin/orders/${id}/status`,
        method: "PUT",
        body: { status },
      });
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
      show(result.queued ? "تغییر وضعیت آفلاین ذخیره شد" : "وضعیت سفارش به‌روزرسانی شد", "success");
    } catch (error) {
      show(error instanceof Error ? error.message : "خطا", "error");
    } finally {
      setBusyId(null);
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

  async function createManual(e: React.FormEvent) {
    e.preventDefault();
    const lines = manual.lines.filter((line) => line.productId && line.quantity > 0);
    if (!lines.length) {
      show("حداقل یک محصول انتخاب کنید", "error");
      return;
    }
    setCreating(true);
    try {
      const result = await mutateAdmin<{ id: string }>({
        path: "/api/admin/orders",
        method: "POST",
        body: {
          items: lines,
          tableId: manual.tableId || null,
          customerName: manual.customerName,
          notes: manual.notes,
        },
      });
      show(result.queued ? "سفارش آفلاین ذخیره شد و بعد از اتصال ثبت می‌شود" : "سفارش دستی ثبت شد", "success");
      setManual({ tableId: "", customerName: "", notes: "", lines: [{ productId: products[0]?.id ?? "", quantity: 1 }] });
      setShowManual(false);
      if (!result.queued) await refresh();
    } catch (error) {
      show(error instanceof Error ? error.message : "ثبت سفارش انجام نشد", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowManual((value) => !value)} className="btn-primary whitespace-nowrap">
            + سفارش دستی
          </button>
          <button type="button" onClick={refresh} className="btn-secondary whitespace-nowrap">♻ تازه‌سازی</button>
        </div>
        <span className="text-xs text-muted">به‌روزرسانی خودکار هر ۸ ثانیه</span>
      </div>
      {showManual && (
        <form onSubmit={createManual} className="card mb-4 space-y-3 p-4">
          <div>
            <h2 className="font-semibold">ثبت سفارش دریافت‌شده توسط ویتر</h2>
            <p className="mt-1 text-xs text-muted">بدون انتخاب میز، سفارش به‌صورت بیرون‌بر ثبت می‌شود.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="label">میز (اختیاری)</span>
              <select className="input" value={manual.tableId} onChange={(e) => setManual({ ...manual, tableId: e.target.value })}>
                <option value="">بیرون‌بر / بدون میز</option>
                {tables.map((table) => <option key={table.id} value={table.id}>{table.label ?? `میز ${table.number}`}</option>)}
              </select>
            </label>
            <label>
              <span className="label">نام مشتری (اختیاری)</span>
              <input className="input" value={manual.customerName} onChange={(e) => setManual({ ...manual, customerName: e.target.value })} />
            </label>
          </div>
          <div className="space-y-2">
            {manual.lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_90px_auto]">
                <select className="input col-span-2 sm:col-span-1" value={line.productId} onChange={(e) => setManual({ ...manual, lines: manual.lines.map((item, i) => i === index ? { ...item, productId: e.target.value } : item) })}>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.nameFa} — {product.price.toLocaleString("fa-IR")} تومان</option>)}
                </select>
                <input type="number" min={1} max={99} className="input" value={line.quantity} onChange={(e) => setManual({ ...manual, lines: manual.lines.map((item, i) => i === index ? { ...item, quantity: Number(e.target.value) } : item) })} aria-label="تعداد" />
                <button type="button" className="btn-ghost text-danger" onClick={() => setManual({ ...manual, lines: manual.lines.filter((_, i) => i !== index) })}>حذف</button>
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setManual({ ...manual, lines: [...manual.lines, { productId: products[0]?.id ?? "", quantity: 1 }] })}>+ محصول دیگر</button>
          </div>
          <label className="block">
            <span className="label">توضیحات</span>
            <textarea className="input min-h-20" value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} />
          </label>
          <button type="submit" disabled={creating || products.length === 0} className="btn-primary">{creating ? "در حال ثبت..." : "ثبت سفارش"}</button>
        </form>
      )}
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
                    {formatJalaliDateTime(o.createdAt)}
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
                        ? "bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary"
                        : "bg-olive-50 text-olive-600 dark:bg-olive/20 dark:text-olive-300"
                  }`}
                >
                  {o.statusLabel}
                </span>
              </div>

              {/* Button-based workflow: only valid next steps are shown.
                  Table orders never receive a "آماده تحویل" action (Rule 3/4). */}
              {o.allowedNext.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-coffee/10 dark:border-dark-border pt-3">
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
