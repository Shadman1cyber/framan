"use client";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Row = {
  id: string;
  rating: number;
  review: string | null;
  userName: string;
  userEmail: string;
  productName: string;
  createdAt: string;
};

export function RatingsAdmin({ initial }: { initial: Row[] }) {
  const [items, setItems] = useState(initial);
  const { show } = useToast();

  async function del(id: string) {
    if (!confirm("حذف امتیاز؟")) return;
    const res = await fetch(`/api/admin/ratings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((r) => r.id !== id));
      show("حذف شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">هنوز امتیازی ثبت نشده است.</p>;
  }

  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-coffee/10">
        {items.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.productName}</span>
                <span className="text-xs text-muted">({r.rating}/۵)</span>
              </div>
              <div className="mt-1 text-sm">{r.review ?? <span className="text-muted">بدون نظر</span>}</div>
              <div className="mt-1 text-xs text-muted">
                {r.userName} · {r.userEmail || "-"} ·{" "}
                {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" }).format(new Date(r.createdAt))}
              </div>
            </div>
            <button onClick={() => del(r.id)} className="btn-ghost shrink-0 text-xs text-danger">حذف</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
