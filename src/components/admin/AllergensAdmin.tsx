"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Item = { id: string; key: string; nameFa: string; nameEn: string; icon: string | null; productCount: number; userCount: number };

export function AllergensAdmin({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    if (!name || !key) return;
    const res = await fetch("/api/admin/allergens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nameFa: name, key: key.toUpperCase(), nameEn: key.toUpperCase() }),
    });
    if (res.ok) {
      setName("");
      setKey("");
      router.refresh();
      show("آلرژن اضافه شد", "success");
    } else show("خطا", "error");
  }

  async function del(id: string) {
    if (!confirm("حذف؟")) return;
    const res = await fetch(`/api/admin/allergens/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((i) => i.id !== id));
      show("حذف شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="card flex items-center justify-between p-3">
            <div>
              <div className="font-semibold">{i.nameFa} <span className="text-xs text-muted">({i.nameEn})</span></div>
              <div className="text-xs text-muted">
                {i.productCount} محصول · {i.userCount} کاربر
              </div>
            </div>
            <button onClick={() => del(i.id)} className="btn-ghost text-xs text-danger">حذف</button>
          </li>
        ))}
      </ul>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن آلرژن</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="نام فارسی (مثلاً شیر)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="کلید (مثلاً MILK)" value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}