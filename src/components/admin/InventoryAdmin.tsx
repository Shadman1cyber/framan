"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UNITS, UNIT_LABELS_FA, type Unit } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

export type InventoryItem = {
  id: string;
  nameFa: string;
  unit: string;
  stockQuantity: number;
  availableQuantity: number;
  minQuantity: number | null;
  costPerUnit: number | null;
  supplier: string | null;
  category: string | null;
  purchaseUnit: string | null;
  purchaseFactor: number;
  isAllergen: boolean;
  isActive: boolean;
  productCount: number;
};

export function InventoryAdmin({ initial }: { initial: InventoryItem[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    nameFa: "",
    unit: "GRAM" as Unit,
    category: "",
    purchaseUnit: "",
    purchaseFactor: "1",
    minQuantity: "",
    costPerUnit: "",
    supplier: "",
  });
  useEffect(() => setItems(initial), [initial]);
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
        category: form.category || null,
        purchaseUnit: form.purchaseUnit || null,
        purchaseFactor: Number(form.purchaseFactor),
        minQuantity: form.minQuantity ? Number(form.minQuantity) : null,
        costPerUnit: form.costPerUnit ? Number(form.costPerUnit) : null,
        supplier: form.supplier || null,
      }),
    });
    if (res.ok) {
      setForm({ nameFa: "", unit: "GRAM", category: "", purchaseUnit: "", purchaseFactor: "1", minQuantity: "", costPerUnit: "", supplier: "" });
      router.refresh();
      show("ماده اولیه اضافه شد", "success");
    } else {
      const j = await res.json().catch(() => ({}));
      show(j.error ?? "خطا", "error");
    }
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

  async function saveMetadata() {
    if (!editing) return;
    const res = await fetch(`/api/admin/ingredients/${editing.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: editing.category || null, purchaseUnit: editing.purchaseUnit || null,
        purchaseFactor: Number(editing.purchaseFactor), minQuantity: editing.minQuantity,
        supplier: editing.supplier || null,
      }),
    });
    if (res.ok) { setEditing(null); router.refresh(); show("مشخصات ذخیره شد", "success"); }
    else { const body = await res.json().catch(() => ({})); show(body.error || "خطا", "error"); }
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
          const isLow = i.availableQuantity <= 0 || (i.minQuantity != null && i.availableQuantity <= i.minQuantity);
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
                {i.category ? ` · ${i.category}` : ""}
                {i.minQuantity != null ? ` · حداقل: ${formatNumber(i.minQuantity)}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm">قابل مصرف: {formatNumber(i.availableQuantity)} / کل: {formatNumber(i.stockQuantity)}</span>
                <button onClick={() => setEditing({ ...i })} className="btn-ghost px-2 py-1 text-xs">ویرایش</button>
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
        <table className="min-w-[880px] w-full text-sm">
          <thead className="bg-beige text-espresso/70 dark:bg-dark-surfaceHover dark:text-dark-textSecondary">
            <tr>
              <th className="p-3 text-right">ماده اولیه</th>
              <th className="p-3 text-right">واحد</th>
              <th className="p-3 text-right">قابل مصرف / کل</th>
              <th className="p-3 text-right">حداقل</th>
              <th className="p-3 text-right">قیمت واحد</th>
              <th className="p-3 text-right">تامین‌کننده</th>
              <th className="p-3 text-right">وضعیت</th>
              <th className="p-3 text-right">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const isLow = i.availableQuantity <= 0 || (i.minQuantity != null && i.availableQuantity <= i.minQuantity);
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
                    {i.category && <div className="text-[11px] text-muted">{i.category}</div>}
                  </td>
                  <td className="p-3 text-muted">{UNIT_LABELS_FA[i.unit as Unit] ?? i.unit}</td>
                  <td className="p-3">
                    {formatNumber(i.availableQuantity)} / {formatNumber(i.stockQuantity)}
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
                      <button onClick={() => setEditing({ ...i })} className="btn-ghost px-2 py-1 text-xs">ویرایش</button>
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

      {editing && <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">ویرایش {editing.nameFa}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" aria-label="دسته‌بندی" placeholder="دسته‌بندی" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          <input className="input" aria-label="واحد خرید" placeholder="واحد خرید" value={editing.purchaseUnit ?? ""} onChange={(e) => setEditing({ ...editing, purchaseUnit: e.target.value })} />
          <input className="input" type="number" min="0.001" step="any" aria-label="ضریب تبدیل واحد خرید" value={editing.purchaseFactor} onChange={(e) => setEditing({ ...editing, purchaseFactor: Number(e.target.value) })} />
          <input className="input" type="number" min="0" step="any" aria-label="حداقل موجودی" value={editing.minQuantity ?? ""} onChange={(e) => setEditing({ ...editing, minQuantity: e.target.value === "" ? null : Number(e.target.value) })} />
          <input className="input" aria-label="تأمین‌کننده" placeholder="تأمین‌کننده" value={editing.supplier ?? ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} />
        </div>
        <div className="mt-3 flex gap-2"><button className="btn-primary" onClick={saveMetadata}>ذخیره</button><button className="btn-secondary" onClick={() => setEditing(null)}>انصراف</button></div>
      </div>}

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">افزودن ماده اولیه</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" placeholder="نام (مثلاً شیر تازه)" value={form.nameFa} onChange={(e) => setForm({ ...form, nameFa: e.target.value })} />
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{UNIT_LABELS_FA[u]}</option>
            ))}
          </select>
          <input className="input" placeholder="دسته‌بندی (اختیاری)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input className="input" placeholder="واحد خرید (مثلاً بسته، کیسه)" value={form.purchaseUnit} onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })} />
          <input className="input" type="number" min={0.001} step="any" placeholder="مقدار هر واحد خرید در واحد مصرف" value={form.purchaseFactor} onChange={(e) => setForm({ ...form, purchaseFactor: e.target.value })} />
          <input className="input" type="number" min={0} placeholder="حداقل موجودی (اختیاری)" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
          <input className="input" type="number" min={0} placeholder="قیمت هر واحد (اختیاری)" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          <input className="input" placeholder="تامین‌کننده (اختیاری)" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </div>
        <button onClick={create} className="btn-primary mt-3">ایجاد</button>
      </div>
    </div>
  );
}
