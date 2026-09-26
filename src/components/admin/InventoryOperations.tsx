"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";
import type { InventoryItem } from "@/components/admin/InventoryAdmin";

type Event = { id: string; ingredientName: string; kind: string; delta: number; before: number; after: number; reason: string; createdAt: string };
type Batch = { id: string; ingredientName: string; remainingQuantity: number; unit: string; expiresAt: string | null; supplier: string | null };
const labels: Record<string, string> = { PURCHASE: "ورود خرید", WASTE: "ضایعات", CORRECTION: "اصلاح شمارش", RESERVE: "رزرو سفارش", RELEASE: "لغو سفارش" };

export function InventoryOperations({ ingredients, events, batches }: { ingredients: InventoryItem[]; events: Event[]; batches: Batch[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [kind, setKind] = useState<"PURCHASE" | "WASTE" | "CORRECTION">("PURCHASE");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!ingredients.some((i) => i.id === ingredientId)) setIngredientId(ingredients[0]?.id ?? ""); }, [ingredients, ingredientId]);
  const selected = ingredients.find((i) => i.id === ingredientId);
  const expiring = batches.filter((b) => b.expiresAt && b.remainingQuantity > 0 && new Date(b.expiresAt).getTime() <= Date.now() + 7 * 86400000);

  async function submit() {
    if (!selected || busy) return;
    const entered = Number(quantity);
    const delta = kind === "CORRECTION" ? entered - selected.stockQuantity : entered;
    if (!Number.isFinite(entered) || entered < 0 || delta === 0 || (kind !== "CORRECTION" && entered === 0)) {
      show("مقدار معتبر و غیرصفر وارد کنید", "error"); return;
    }
    if (reason.trim().length < 3) { show("دلیل عملیات را وارد کنید", "error"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/inventory/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientId, kind, quantity: delta, reason: reason.trim(), operationKey: crypto.randomUUID(),
          expiresAt: kind === "PURCHASE" && expiry ? new Date(`${expiry}T23:59:59+03:30`).toISOString() : null,
          supplier: kind === "PURCHASE" ? supplier || null : null,
          costPerPurchaseUnit: kind === "PURCHASE" && cost !== "" ? Number(cost) : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "ثبت انجام نشد");
      setQuantity(""); setReason(""); setExpiry(""); setCost("");
      show("گردش انبار ثبت شد", "success");
      router.refresh();
    } catch (error) { show((error as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">ثبت گردش انبار</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <select className="input" aria-label="نوع عملیات" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setQuantity(""); }}>
          <option value="PURCHASE">ورود خرید</option><option value="WASTE">ثبت ضایعات</option><option value="CORRECTION">اصلاح شمارش</option>
        </select>
        <select className="input" aria-label="ماده اولیه" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
          {ingredients.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.nameFa}</option>)}
        </select>
        <input className="input" type="number" min="0" step="any" placeholder={kind === "CORRECTION" ? "موجودی شمارش‌شده" : "مقدار"} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        {kind === "PURCHASE" && <>
          <input className="input" type="date" aria-label="تاریخ انقضا" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <input className="input" placeholder="تأمین‌کننده" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <input className="input" type="number" min="0" step="any" placeholder="قیمت هر واحد خرید (تومان)" value={cost} onChange={(e) => setCost(e.target.value)} />
        </>}
        <input className="input md:col-span-3" placeholder="دلیل یا شماره فاکتور (الزامی)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {selected && <p className="mt-2 text-xs text-muted">موجودی کل: {formatNumber(selected.stockQuantity)} {selected.unit} · قابل مصرف: {formatNumber(selected.availableQuantity)} {selected.unit} · هر {selected.purchaseUnit || selected.unit} خرید = {formatNumber(selected.purchaseFactor)} {selected.unit}</p>}
      <button className="btn-primary mt-3" onClick={submit} disabled={busy || !selected}>{busy ? "در حال ثبت…" : "ثبت عملیات"}</button>
    </section>
    {expiring.length > 0 && <section className="card border border-warning/40 p-4">
      <h2 className="mb-2 font-semibold">بچ‌های منقضی یا نزدیک انقضا</h2>
      <ul className="space-y-1 text-sm">{expiring.map((b) => <li key={b.id}>{b.ingredientName}: {formatNumber(b.remainingQuantity)} {b.unit} · {new Date(b.expiresAt!).toLocaleDateString("fa-IR")}</li>)}</ul>
    </section>}
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">آخرین گردش‌ها</h2>
      <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2 whitespace-nowrap">زمان</th><th className="p-2 whitespace-nowrap">ماده</th><th className="p-2 whitespace-nowrap">نوع</th><th className="p-2 whitespace-nowrap">تغییر</th><th className="p-2 whitespace-nowrap">مانده</th><th className="p-2 whitespace-nowrap">دلیل</th></tr></thead>
        <tbody>{events.map((e) => <tr key={e.id} className="border-b border-coffee/10"><td className="p-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString("fa-IR")}</td><td className="p-2">{e.ingredientName}</td><td className="p-2">{labels[e.kind] ?? e.kind}</td><td className="p-2" dir="ltr">{e.delta > 0 ? "+" : ""}{formatNumber(e.delta)}</td><td className="p-2">{formatNumber(e.after)}</td><td className="p-2">{e.reason}</td></tr>)}</tbody>
      </table></div>
      {!events.length && <p className="text-sm text-muted">هنوز گردش جدیدی ثبت نشده است. موجودی‌های قدیمی به‌عنوان ماندهٔ اولیه حفظ شده‌اند.</p>}
    </section>
  </div>;
}
