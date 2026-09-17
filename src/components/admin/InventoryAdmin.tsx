"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UNITS, UNIT_LABELS_FA, type Unit } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

export type InventoryItem = {
  id: string;
  nameFa: string;
  unit: string;
  stockQuantity: number;
  minQuantity: number | null;
  costPerUnit: number | null;
  supplier: string | null;
  isAllergen: boolean;
  isActive: boolean;
  productCount: number;
};

export function InventoryAdmin({ initial }: { initial: InventoryItem[] }) {
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState({
    nameFa: "",
    unit: "GRAM" as Unit,
    stockQuantity: 0,
    minQuantity: "",
    costPerUnit: "",
    supplier: "",
  });
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const router = useRouter();
  const { show } = useToast();

  async function create() {
    if (!form.nameFa.trim()) return;
    const res = await fetch("/api/admin/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameFa: form.nameFa.trim(),
        unit: form.unit,
        stockQuantity: form.stockQuantity,
        minQuantity: form.minQuantity ? Number(form.minQuantity) : null,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : null,
        supplier: form.supplier || null,
      }),
    });
    if (res.ok) {
      setForm({ nameFa: "", unit: "GRAM", stockQuantity: 0, minQuantity: "", costPerUnit: "", supplier: "" });
      router.refresh();
      show("ماده اولیه اضافه شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
  }

  async function saveStock(id: string) {
    const value = stockEdits[id];
    if (value == null || value === "") return;
    const res = await fetch(`/api/admin/ingredients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockQuantity: Number(value) }),
    });
    if (res.ok) {
      setItems((xs) =>
        xs.map((x) => (x.id === id ? { ...x, stockQuantity: Number(value) } : x)),
      );
      setStockEdits((s) => {
        const n = { ...s };
        delete n[id];
        return n;
      });
      show("موجودی به‌روزرسانی شد", "success");
    } else show("خطا", "error");
  }

  async function toggleActive(item: InventoryItem) {
    const res = await fetch(`/api/admin/ingredients/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (res.ok) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, isActive: !x.isActive } : x)));
    }
  }

  async function del(id: string) {
    if (!confirm("حذف ماده اولیه؟")) return;
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
      {/* Mobile: card list */}
      <ul className="space-y-2 md:hidden">
        {items.map((i) => {
          const isLow = i.minQuantity != null && i.stockQuantity <= i.minQuantity;
          return (
            <li key={i.id} className="card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-espresso dark:text-dark-text">{i.nameFa}</span>
                {i.isAllergen && (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger dark:bg-danger/20">
                    آلرژن
                  </span>
                )}
                <span
                  className={`ms-auto rounded-full px-2 py-0.5 text-xs ${
                    isLow ? "bg-warning/10 text-warning dark:bg-warning/20" : "bg-olive-50 text-olive-600 dark:bg-olive/20 dark:text-olive-300"
                  }`}
                >
                  {isLow ? "کم‌موجود" : "مناسب"}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {i.productCount} محصول · واحد: {UNIT_LABELS_FA[i.unit as Unit] ?? i.unit}
                {i.minQuantity != null ? ` · حداقل: ${formatNumber(i.minQuantity)}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  className="input w-28 py-1.5"
                  aria-label={`موجودی ${i.nameFa}`}
                  value={stockEdits[i.id] ?? String(i.stockQuantity)}
                  onChange={(e) => setStockEdits((s) => ({ ...s, [i.id]: e.target.value }))}
                />
                <button
                  onClick={() => saveStock(i.id)}
                  disabled={stockEdits[i.id] == null}
                  className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  ذخیره
                </button>
                <button onClick={() => toggleActive(i)} className="btn-ghost px-2 py-1 text-xs">
                  {i.isActive ? "غیرفعال" : "فعال"}
                </button>
                <button onClick={() => del(i.id)} className="btn-ghost px-2 py-1 text-xs text-danger">
                  حذف
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary">
            <tr>
              <th className="p-3 text-right">ماده اولیه</th>
              <th className="p-3 text-right">واحد</th>
              <th className="p-3 text-right">موجودی</th>
              <th className="p-3 text-right">حداقل</th>
              <th className="p-3 text-right">قیمت واحد</th>
              <th className="p-3 text-right">تامین‌کننده</th>
              <th className="p-3 text-right">وضعیت</th>
              <th className="p-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const isLow = i.minQuantity != null && i.stockQuantity <= i.minQuantity;
              return (
                <tr key={i.id} className="border-t border-coffee/10 dark:border-dark-border">
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap font-medium text-espresso dark:text-dark-text">{i.nameFa}</span>
                      {i.isAllergen && (
                        <span className="whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger dark:bg-danger/20">
                          آلرژن
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{i.productCount} محصول</div>
                  </td>
                  <td className="p-3 text-muted">{UNIT_LABELS_FA[i.unit as Unit] ?? i.unit}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="input w-24 py-1"
                        value={stockEdits[i.id] ?? String(i.stockQuantity)}
                        onChange={(e) => setStockEdits((s) => ({ ...s, [i.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => saveStock(i.id)}
                        disabled={stockEdits[i.id] == null}
                        className="btn-ghost px-2 py-1 text-xs text-olive-600 dark:text-olive-300 disabled:opacity-40"
                      >
                        ذخیره
                      </button>
                    </div>
                  </td>
                  <td className="p-3 text-muted">
                    {i.minQuantity != null ? formatNumber(i.minQuantity) : "—"}
                  </td>
                  <td className="p-3 text-muted">
                    {i.costPerUnit != null ? formatNumber(i.costPerUnit) : "—"}
                  </td>
                  <td className="p-3 text-muted">{i.supplier ?? "—"}</td>
                  <td className="p-3">
                    {isLow ? (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning dark:bg-warning/20">کم‌موجود</span>
                    ) : (
                      <span className="rounded-full bg-olive-50 px-2 py-0.5 text-xs text-olive-600 dark:bg-olive/20 dark:text-olive-300">مناسب</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => toggleActive(i)} className="btn-ghost px-2 py-1 text-xs">
                        {i.isActive ? "غیرفعال" : "فعال"}
                      </button>
                      <button onClick={() => del(i.id)} className="btn-ghost px-2 py-1 text-xs text-danger">حذف</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن ماده اولیه</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" placeholder="نام (مثلاً شیر تازه)" value={form.nameFa} onChange={(e) => setForm({ ...form, nameFa: e.target.value })} />
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{UNIT_LABELS_FA[u]}</option>
            ))}
          </select>
          <input className="input" type="number" min={0} placeholder="موجودی فعلی" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) })} />
          <input className="input" type="number" min={0} placeholder="حداقل موجودی (اختیاری)" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
          <input className="input" type="number" min={0} placeholder="قیمت هر واحد (اختیاری)" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          <input className="input" placeholder="تامین‌کننده (اختیاری)" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}
