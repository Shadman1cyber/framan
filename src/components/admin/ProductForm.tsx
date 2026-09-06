"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Cat = { id: string; nameFa: string };
type Ing = { id: string; nameFa: string };
type Alg = { id: string; nameFa: string; key: string };

type Existing = {
  id: string;
  slug: string;
  nameFa: string;
  nameEn: string;
  description: string;
  price: number;
  image: string;
  categoryId: string;
  isAvailable: boolean;
  isFeatured: boolean;
  order: number;
  allergenStatus: "CONTAINS" | "MAY_CONTAIN" | "UNKNOWN";
  ingredientIds: string[];
  allergenIds: string[];
};

export function ProductForm({
  product,
  categories,
  ingredients,
  allergens,
}: {
  product?: Existing;
  categories: Cat[];
  ingredients: Ing[];
  allergens: Alg[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [form, setForm] = useState({
    slug: product?.slug ?? "",
    nameFa: product?.nameFa ?? "",
    nameEn: product?.nameEn ?? "",
    description: product?.description ?? "",
    price: product?.price ?? 0,
    image: product?.image ?? "",
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    isAvailable: product?.isAvailable ?? true,
    isFeatured: product?.isFeatured ?? false,
    order: product?.order ?? 0,
    allergenStatus: product?.allergenStatus ?? "UNKNOWN",
  });
  const [ingIds, setIngIds] = useState<Set<string>>(new Set(product?.ingredientIds ?? []));
  const [algIds, setAlgIds] = useState<Set<string>>(new Set(product?.allergenIds ?? []));
  const [saving, setSaving] = useState(false);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, ingredientIds: Array.from(ingIds), allergenIds: Array.from(algIds) };
    const url = product ? `/api/admin/products/${product.id}` : "/api/admin/products";
    const method = product ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      show(product ? "ویرایش شد" : "ایجاد شد", "success");
      router.push("/admin/products");
    } else {
      const j = await res.json().catch(() => ({ error: "خطا" }));
      show(j.error ?? "خطا", "error");
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="نام فارسی">
          <input className="input" required value={form.nameFa} onChange={(e) => setForm({ ...form, nameFa: e.target.value })} />
        </Field>
        <Field label="نام انگلیسی (اختیاری)">
          <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        </Field>
        <Field label="Slug">
          <input className="input" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </Field>
        <Field label="دسته">
          <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nameFa}</option>
            ))}
          </select>
        </Field>
        <Field label="قیمت (تومان)">
          <input type="number" min={0} className="input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        </Field>
        <Field label="ترتیب نمایش">
          <input type="number" className="input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
        </Field>
        <Field label="تصویر (URL)">
          <input className="input" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        </Field>
        <Field label="وضعیت آلرژن">
          <select className="input" value={form.allergenStatus} onChange={(e) => setForm({ ...form, allergenStatus: e.target.value as Existing["allergenStatus"] })}>
            <option value="UNKNOWN">نامشخص</option>
            <option value="CONTAINS">حاوی</option>
            <option value="MAY_CONTAIN">احتمالاً حاوی</option>
          </select>
        </Field>
      </div>
      <Field label="توضیحات">
        <textarea className="input" rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <CheckField label="موجود" checked={form.isAvailable} onChange={(v) => setForm({ ...form, isAvailable: v })} />
        <CheckField label="پیشنهاد ویژه" checked={form.isFeatured} onChange={(v) => setForm({ ...form, isFeatured: v })} />
      </div>
      <Field label="مواد اولیه">
        <div className="flex flex-wrap gap-2">
          {ingredients.map((i) => (
            <button
              type="button"
              key={i.id}
              onClick={() => toggle(ingIds, setIngIds, i.id)}
              aria-pressed={ingIds.has(i.id)}
              className={`chip ${ingIds.has(i.id) ? "chip-active" : ""}`}
            >
              {i.nameFa}
            </button>
          ))}
        </div>
      </Field>
      <Field label="آلرژن‌ها">
        <div className="flex flex-wrap gap-2">
          {allergens.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => toggle(algIds, setAlgIds, a.id)}
              aria-pressed={algIds.has(a.id)}
              className={`chip ${algIds.has(a.id) ? "chip-active" : ""}`}
            >
              {a.nameFa}
            </button>
          ))}
        </div>
      </Field>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "در حال ذخیره..." : product ? "ذخیره تغییرات" : "ایجاد محصول"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-coffee/15 bg-cream-50 px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}