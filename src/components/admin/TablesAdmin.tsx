"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Row = {
  id: string;
  number: string;
  label: string | null;
  isActive: boolean;
  isOccupied: boolean;
  occupiedAt: string | null;
  branchName: string;
  orderCount: number;
  qrCount: number;
  nextReservation: { customerName: string; reservedAt: string } | null;
};

export function TablesAdmin({ initial }: { initial: Row[] }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    if (!number.trim()) return;
    const res = await fetch("/api/admin/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: number.trim(), label: label || null }),
    });
    if (res.ok) {
      setNumber("");
      setLabel("");
      router.refresh();
      show("میز ایجاد شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/tables/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((t) => (t.id === id ? { ...t, isActive: !isActive } : t)));
      show("به‌روز شد", "success");
    } else show("خطا", "error");
  }

  async function setOccupied(id: string, isOccupied: boolean) {
    setBusyId(id);
    const res = await fetch(`/api/admin/tables/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isOccupied }),
    });
    setBusyId(null);
    if (res.ok) {
      setItems((xs) =>
        xs.map((t) =>
          t.id === id
            ? { ...t, isOccupied, occupiedAt: isOccupied ? new Date().toISOString() : null }
            : t,
        ),
      );
      show(isOccupied ? "میز اشغال شد" : "میز آزاد شد", "success");
    } else show("خطا", "error");
  }

  async function del(id: string) {
    if (!confirm("حذف میز؟")) return;
    const res = await fetch(`/api/admin/tables/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((t) => t.id !== id));
      show("حذف شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  const occupiedCount = items.filter((t) => t.isOccupied).length;

  return (
    <div className="space-y-6">
      <div className="card p-4 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-olive" aria-hidden="true" /> آزاد
        </span>
        <span className="ms-4 inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" /> اشغال
        </span>
        <span className="ms-4">
          — در حال حاضر {occupiedCount} از {items.length} میز اشغال است. با اسکن کد QR میز، اشغال بودن
          به‌صورت خودکار ثبت می‌شود.
        </span>
      </div>

      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                title={t.isOccupied ? "اشغال" : "آزاد"}
                className={`inline-block h-3 w-3 shrink-0 rounded-full ${
                  t.isOccupied ? "bg-danger" : "bg-olive"
                } ${t.isOccupied ? "animate-pulse" : ""}`}
              />
              <span className="text-2xl" aria-hidden="true">🪑</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{t.label ?? `میز ${t.number}`}</span>
<span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    t.isOccupied ? "bg-danger/10 text-danger dark:bg-danger/20" : "bg-olive-50 text-olive-600 dark:bg-olive/20 dark:text-olive-300"
                  }`}
                >
                    {t.isOccupied ? "اشغال" : "آزاد"}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {t.branchName} · {t.orderCount} سفارش · {t.qrCount} QR
                  {t.occupiedAt && ` · از ${new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(new Date(t.occupiedAt))}`}
                </div>
                {t.nextReservation && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning dark:bg-warning/20">
                    📅 رزرو بعدی: {t.nextReservation.customerName} — ساعت{" "}
                    {new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(
                      new Date(t.nextReservation.reservedAt),
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setOccupied(t.id, !t.isOccupied)}
                disabled={busyId === t.id}
                className={
                  t.isOccupied
                    ? "rounded-xl border border-olive/30 bg-olive-50 px-3 py-1.5 text-xs font-medium text-olive-700 transition-colors hover:bg-olive-100 disabled:opacity-50 dark:border-olive/40 dark:bg-olive/20 dark:text-olive-300 dark:hover:bg-olive/30"
                    : "rounded-xl border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                }
              >
                {t.isOccupied ? "آزادسازی میز" : "اشغال دستی میز"}
              </button>
              <button onClick={() => toggleActive(t.id, t.isActive)} className="btn-ghost text-xs">
                {t.isActive ? "غیرفعال" : "فعال"}
              </button>
              <button onClick={() => del(t.id)} className="btn-ghost text-xs text-danger">حذف</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن میز</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="شماره میز (مثال: 9)" value={number} onChange={(e) => setNumber(e.target.value)} />
          <input className="input" placeholder="برچسب (مثال: میز کنار پنجره)" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}
