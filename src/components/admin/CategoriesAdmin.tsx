"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Cat = { id: string; slug: string; nameFa: string; icon: string | null; isActive: boolean; order: number; productCount: number };

export function CategoriesAdmin({ initial }: { initial: Cat[] }) {
  const [items, setItems] = useState(initial);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    if (!slug || !name) return;
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, nameFa: name, icon: icon || null, order: items.length + 1, isActive: true }),
    });
    if (res.ok) {
      setSlug("");
      setName("");
      setIcon("");
      router.refresh();
      show("دسته ایجاد شد", "success");
    } else show("خطا", "error");
  }

  async function toggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((c) => (c.id === id ? { ...c, isActive: !isActive } : c)));
      show("به‌روز شد", "success");
    }
  }

  async function del(id: string) {
    if (!confirm("حذف دسته؟")) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((c) => c.id !== id));
      show("حذف شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id} className="card flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <span aria-hidden="true">{c.icon ?? "·"}</span>
              <div>
                <div className="font-semibold">{c.nameFa}</div>
                <div className="text-xs text-muted">{c.slug} · {c.productCount} محصول</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggle(c.id, c.isActive)} className="btn-ghost text-xs">
                {c.isActive ? "غیرفعال" : "فعال"}
              </button>
              <button onClick={() => del(c.id)} className="btn-ghost text-xs text-danger">حذف</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن دسته</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" placeholder="نام فارسی" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="slug (مثال: coffee)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input className="input" placeholder="ایموجی" value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}