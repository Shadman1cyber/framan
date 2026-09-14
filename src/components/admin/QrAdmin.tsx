"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export type QrRow = {
  id: string;
  code: string;
  label: string | null;
  branchName: string;
  tableLabel: string | null;
  isActive: boolean;
  expiresAt: string | null;
  url: string;
  dataUrl: string | null;
};

export function QrAdmin({ initial }: { initial: QrRow[] }) {
  const [items, setItems] = useState(initial);
  const [label, setLabel] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    const res = await fetch("/api/admin/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || null, tableNumber: tableLabel || null }),
    });
    if (res.ok) {
      setLabel("");
      setTableLabel("");
      router.refresh();
      show("QR ایجاد شد (کد تصادفی امن تولید شد)", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  async function toggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/qr/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((q) => (q.id === id ? { ...q, isActive: !isActive } : q)));
      show("به‌روز شد", "success");
    } else show("خطا", "error");
  }

  async function del(id: string) {
    if (!confirm("حذف QR؟")) return;
    const res = await fetch(`/api/admin/qr/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((q) => q.id !== id));
      show("حذف شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((q) => (
          <div key={q.id} className="card flex flex-col items-center gap-2 p-4 text-center">
            {q.dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={q.url} target="_blank" rel="noreferrer" className="rounded-lg border border-coffee/10 p-2 bg-cream-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={q.dataUrl} alt={`QR کد ${q.label ?? q.code}`} width={160} height={160} className="h-40 w-40" />
              </a>
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-coffee/10 text-xs text-muted">تصویر در دسترس نیست</div>
            )}
            <div className="font-semibold">{q.label ?? q.code}</div>
            <div className="text-xs text-muted">{q.tableLabel ? `میز: ${q.tableLabel}` : "منوی اصلی"} · {q.branchName}</div>
            <div className="text-xs text-muted break-all" dir="ltr">{q.url}</div>
            <div className="mt-1 flex items-center gap-2">
              <button onClick={() => toggle(q.id, q.isActive)} className="btn-ghost text-xs">
                {q.isActive ? "غیرفعال" : "فعال"}
              </button>
              <button onClick={() => del(q.id)} className="btn-ghost text-xs text-danger">حذف</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">ایجاد QR</h2>
        <p className="mb-3 text-xs text-muted">
          کد QR به‌صورت خودکار و به شکل نامحدودن‌پذیر (توکن تصادفی) تولید می‌شود تا مهمانان نتوانند
          با حدس زدن آدرس، منوی میز دیگر را باز کنند.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="برچسب (مثال: میز ۹)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input" placeholder="اتصال به میز (شماره میز، اختیاری)" value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد QR</button>
      </div>
    </div>
  );
}