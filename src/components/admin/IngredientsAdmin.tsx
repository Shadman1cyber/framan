"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Item = { id: string; nameFa: string; isAllergen: boolean; productCount: number; allergenIds: string[] };
type Alg = { id: string; nameFa: string };

export function IngredientsAdmin({ initial, allergens }: { initial: Item[]; allergens: Alg[] }) {
  const [items, setItems] = useState(initial);
  const [name, setName] = useState("");
  const [allergen, setAllergen] = useState(false);
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    if (!name) return;
    const res = await fetch("/api/admin/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nameFa: name, isAllergen: allergen }),
    });
    if (res.ok) {
      setName("");
      setAllergen(false);
      router.refresh();
      show("ماده اولیه اضافه شد", "success");
    } else show("خطا", "error");
  }

  async function del(id: string) {
    if (!confirm("حذف؟")) return;
    const res = await fetch(`/api/admin/ingredients/${id}`, { method: "DELETE" });
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
              <div className="font-semibold">{i.nameFa}</div>
              <div className="text-xs text-muted">
                {i.productCount} محصول
                {i.isAllergen && <span className="ms-2 rounded-full bg-danger/10 px-2 text-danger">آلرژن</span>}
              </div>
            </div>
            <button onClick={() => del(i.id)} className="btn-ghost text-xs text-danger">حذف</button>
          </li>
        ))}
      </ul>
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن ماده اولیه</h2>
        <div className="flex gap-3">
          <input className="input flex-1" placeholder="نام فارسی" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allergen} onChange={(e) => setAllergen(e.target.checked)} />
            <span>حاوی آلرژن</span>
          </label>
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}