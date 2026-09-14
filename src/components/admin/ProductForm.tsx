"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";
import { UNITS, UNIT_LABELS_FA, ALLERGEN_STATUSES, ALLERGEN_STATUS_LABELS_FA } from "@/lib/constants";

type Cat = { id: string; nameFa: string };
type Ing = { id: string; nameFa: string; unit: string };
type Alg = { id: string; nameFa: string; icon: string | null };
type Line = { id: string; nameFa: string };
type LineOption = { coffeeLineId: string; price: number; isActive: boolean };
type ImageItem = { url: string; isPrimary: boolean };

type Existing = {
  id: string;
  nameFa: string;
  nameEn: string;
  description: string;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepBaseMin: number;
  allergenStatus: "CONTAINS" | "FREE";
  ingredientIds: string[];
  ingredientQuantities: Array<{ ingredientId: string; quantity: number; unit: string }>;
  allergenIds: string[];
  images: ImageItem[];
  coffeeLines: LineOption[];
};

export function ProductForm({
  product,
  categories,
  ingredients,
  allergens,
  coffeeLines,
}: {
  product?: Existing;
  categories: Cat[];
  ingredients: Ing[];
  allergens: Alg[];
  coffeeLines: Line[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    nameFa: product?.nameFa ?? "",
    nameEn: product?.nameEn ?? "",
    description: product?.description ?? "",
    price: product?.price ?? 0,
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    isAvailable: product?.isAvailable ?? true,
    isFeatured: product?.isFeatured ?? false,
    prepBaseMin: product?.prepBaseMin ?? 3,
    allergenStatus: product?.allergenStatus ?? ("FREE" as "CONTAINS" | "FREE"),
  });
  const [ingIds, setIngIds] = useState<Set<string>>(new Set(product?.ingredientIds ?? []));
  const [quantities, setQuantities] = useState<Record<string, { quantity: number; unit: string }>>(
    Object.fromEntries(
      (product?.ingredientQuantities ?? []).map((q) => [q.ingredientId, { quantity: q.quantity, unit: q.unit }]),
    ),
  );
  const [algIds, setAlgIds] = useState<Set<string>>(new Set(product?.allergenIds ?? []));
  const [images, setImages] = useState<ImageItem[]>(product?.images ?? []);
  const [lineOptions, setLineOptions] = useState<Record<string, { price: number; isActive: boolean }>>(
    Object.fromEntries(
      (product?.coffeeLines ?? []).map((cl) => [cl.coffeeLineId, { price: cl.price, isActive: cl.isActive }]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function toggleId(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در بارگذاری");
      const uploaded: ImageItem[] = (json.files as Array<{ url: string }>).map((f) => ({
        url: f.url,
        isPrimary: images.length === 0,
      }));
      setImages((prev) => [...prev, ...uploaded].slice(0, 8));
      show("تصاویر بارگذاری شد", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "خطا در بارگذاری تصویر", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setPrimary(url: string) {
    setImages((prev) => prev.map((im) => ({ ...im, isPrimary: im.url === url })));
  }

  function removeImage(url: string) {
    setImages((prev) => {
      const next = prev.filter((im) => im.url !== url);
      if (next.length && !next.some((im) => im.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (algIds.size > 0 && form.allergenStatus !== "CONTAINS") {
      // Keep the two-state model consistent: rows imply CONTAINS.
      form.allergenStatus = "CONTAINS";
    }
    setSaving(true);
    const payload = {
      ...form,
      allergenStatus: algIds.size > 0 ? "CONTAINS" : form.allergenStatus,
      images,
      ingredientIds: Array.from(ingIds),
      ingredientQuantities: Array.from(ingIds).map((id) => ({
        ingredientId: id,
        quantity: quantities[id]?.quantity ?? 0,
        unit: quantities[id]?.unit ?? ingredients.find((i) => i.id === id)?.unit ?? "GRAM",
      })),
      allergenIds: Array.from(algIds),
      coffeeLines: Object.entries(lineOptions)
        .filter(([, v]) => v.isActive)
        .map(([coffeeLineId, v]) => ({ coffeeLineId, price: v.price, isActive: true })),
    };
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
        <Field label="دسته">
          <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nameFa}</option>
            ))}
          </select>
        </Field>
        <Field label="قیمت پایه (تومان)">
          <input type="number" min={0} className="input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        </Field>
        <Field label="زمان آماده‌سازی پایه (دقیقه)">
          <input
            type="number"
            min={1}
            max={120}
            className="input"
            value={form.prepBaseMin}
            onChange={(e) => setForm({ ...form, prepBaseMin: Number(e.target.value) })}
          />
        </Field>
        <Field label="وضعیت آلرژن">
          <select
            className="input"
            value={form.allergenStatus}
            onChange={(e) => setForm({ ...form, allergenStatus: e.target.value as "CONTAINS" | "FREE" })}
          >
            {ALLERGEN_STATUSES.map((s) => (
              <option key={s} value={s}>{ALLERGEN_STATUS_LABELS_FA[s]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="توضیحات">
        <textarea className="input" rows={3} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>

      {/* Image upload (Rule 12/13) */}
      <Field label="تصاویر محصول (حداکثر ۸ تصویر)">
        <div className="rounded-2xl border border-dashed border-coffee/25 bg-cream p-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-secondary"
          >
            {uploading ? "در حال بارگذاری..." : "⬆ انتخاب تصویر از دستگاه"}
          </button>
          {images.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((im) => (
                <li key={im.url} className="group relative overflow-hidden rounded-xl border border-coffee/15 bg-beige">
                  <div className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt="" className="h-full w-full object-cover" />
                  </div>
                  {im.isPrimary ? (
                    <span className="absolute bottom-1 right-1 rounded-full bg-olive px-2 py-0.5 text-[10px] text-cream">
                      اصلی
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPrimary(im.url)}
                      className="absolute bottom-1 right-1 rounded-full bg-espresso/70 px-2 py-0.5 text-[10px] text-cream"
                    >
                      تصویر اصلی
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(im.url)}
                    aria-label="حذف تصویر"
                    className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-danger/90 text-xs text-cream"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      <div className="flex flex-wrap gap-3">
        <CheckField label="موجود" checked={form.isAvailable} onChange={(v) => setForm({ ...form, isAvailable: v })} />
        <CheckField label="پیشنهاد ویژه" checked={form.isFeatured} onChange={(v) => setForm({ ...form, isFeatured: v })} />
      </div>

      <Field label="مواد اولیه و مقدار مصرف (داخلی — برای انبار و محاسبه هزینه)">
        <div className="space-y-2">
          {ingredients.map((i) => {
            const active = ingIds.has(i.id);
            return (
              <div key={i.id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${active ? "border-olive/40 bg-olive-50" : "border-coffee/10 bg-cream-50"}`}>
                <button
                  type="button"
                  onClick={() => toggleId(ingIds, setIngIds, i.id)}
                  aria-pressed={active}
                  className={`chip ${active ? "chip-active" : ""}`}
                >
                  {i.nameFa}
                </button>
                {active && (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      className="input max-w-28 py-1.5"
                      placeholder="مقدار"
                      value={quantities[i.id]?.quantity ?? ""}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [i.id]: {
                            quantity: Number(e.target.value),
                            unit: q[i.id]?.unit ?? i.unit,
                          },
                        }))
                      }
                    />
                    <select
                      className="input max-w-36 py-1.5"
                      value={quantities[i.id]?.unit ?? i.unit}
                      onChange={(e) =>
                        setQuantities((q) => ({
                          ...q,
                          [i.id]: { quantity: q[i.id]?.quantity ?? 0, unit: e.target.value },
                        }))
                      }
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{UNIT_LABELS_FA[u]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="آلرژن‌ها">
        <div className="flex flex-wrap gap-2">
          {allergens.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => toggleId(algIds, setAlgIds, a.id)}
              aria-pressed={algIds.has(a.id)}
              className={`chip ${algIds.has(a.id) ? "chip-active" : ""}`}
            >
              {a.icon && <span aria-hidden="true">{a.icon}</span>}
              {a.nameFa}
            </button>
          ))}
        </div>
      </Field>

      {/* Coffee lines */}
      <Field label="خطوط قهوه (برای محصولات قهوه)">
        <div className="space-y-2">
          {coffeeLines.length === 0 && (
            <p className="text-xs text-muted">هنوز خط قهوه‌ای تعریف نشده است.</p>
          )}
          {coffeeLines.map((l) => {
            const opt = lineOptions[l.id];
            const active = opt?.isActive ?? false;
            return (
              <div key={l.id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${active ? "border-olive/40 bg-olive-50" : "border-coffee/10 bg-cream-50"}`}>
                <button
                  type="button"
                  onClick={() =>
                    setLineOptions((prev) => ({
                      ...prev,
                      [l.id]: { price: prev[l.id]?.price ?? form.price, isActive: !active },
                    }))
                  }
                  aria-pressed={active}
                  className={`chip ${active ? "chip-active" : ""}`}
                >
                  {l.nameFa}
                </button>
                {active && (
                  <input
                    type="number"
                    min={0}
                    className="input max-w-36 py-1.5"
                    placeholder="قیمت نهایی (تومان)"
                    value={opt?.price ?? ""}
                    onChange={(e) =>
                      setLineOptions((prev) => ({
                        ...prev,
                        [l.id]: { price: Number(e.target.value), isActive: true },
                      }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          برای هر خط، قیمت نهایی محصول را وارد کنید. اگر خطی فعال نباشد، قیمت پایه استفاده می‌شود.
        </p>
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
