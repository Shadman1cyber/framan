"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Row = {
  id: string;
  number: string;
  label: string | null;
  isActive: boolean;
  branchName: string;
  orderCount: number;
  qrCount: number;
};

export function TablesAdmin({ initial }: { initial: Row[] }) {
  const [items, setItems] = useState(initial);
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

  async function toggle(id: string, isActive: boolean) {
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

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="card flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">🪑</span>
              <div>
                <div className="font-semibold">{t.label ?? `میز ${t.number}`}</div>
                <div className="text-xs text-muted">
                  {t.branchName} · {t.orderCount} سفارش · {t.qrCount} QR
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(t.id, t.isActive)} className="btn-ghost text-xs">
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