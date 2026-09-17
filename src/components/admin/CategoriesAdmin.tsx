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
    if (!name.trim()) return;
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The tag is optional — the server auto-generates it from the name when empty.
      body: JSON.stringify({ slug: slug.trim() || null, nameFa: name, icon: icon || null, order: items.length + 1, isActive: true }),
    });
    if (res.ok) {
      setSlug("");
      setName("");
      setIcon("");
      router.refresh();
      show("دسته ایجاد شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
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
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span dir="ltr" className="rounded-full border border-olive/25 bg-olive-50 px-2 py-0.5 text-[10px] font-medium text-olive-600 dark:border-olive/40 dark:bg-olive/20 dark:text-olive-300">
                    #{c.slug}
                  </span>
                  <span>{c.productCount} محصول</span>
                </div>
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
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-olive-600">
              #
            </span>
            <input
              dir="ltr"
              className="input pr-8 text-left"
              placeholder="tag (optional — e.g. coffee)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <input className="input" placeholder="ایموجی" value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
        <p className="mt-2 text-xs text-muted">
          تگ در آدرس صفحه‌ی دسته استفاده می‌شود؛ اگر خالی بماند، به‌صورت خودکار از نام ساخته می‌شود.
        </p>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}