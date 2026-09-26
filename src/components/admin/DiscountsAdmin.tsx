"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Price } from "@/components/ui/Price";
import { formatNumber } from "@/lib/format";

export type DiscountRow = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  startsAt: string;
  endsAt: string;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
  archivedAt: string | null;
  usedCount: number;
  redemptionCount: number;
};

type FormState = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  startsAt: string;
  endsAt: string;
  minOrderAmount: number;
  maxDiscount: number | "";
  usageLimit: number | "";
  perUserLimit: number | "";
};

function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function emptyForm(): FormState {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  return {
    code: "",
    type: "PERCENT",
    value: 10,
    startsAt: toDateTimeLocal(now.toISOString()),
    endsAt: toDateTimeLocal(in30.toISOString()),
    minOrderAmount: 0,
    maxDiscount: "",
    usageLimit: "",
    perUserLimit: "",
  };
}

export function DiscountsAdmin({ initial }: { initial: DiscountRow[] }) {
  const { show } = useToast();
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);

  function payload(f: FormState) {
    return {
      code: f.code.trim(),
      type: f.type,
      value: Number(f.value) || 0,
      startsAt: new Date(f.startsAt).toISOString(),
      endsAt: new Date(f.endsAt).toISOString(),
      minOrderAmount: Number(f.minOrderAmount) || 0,
      maxDiscount: f.maxDiscount === "" ? null : Number(f.maxDiscount),
      usageLimit: f.usageLimit === "" ? null : Number(f.usageLimit),
      perUserLimit: f.perUserLimit === "" ? null : Number(f.perUserLimit),
    };
  }

  async function refresh() {
    try {
      const res = await fetch("/api/admin/discounts", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const list: DiscountRow[] = (json.codes ?? json.discounts ?? json).map(
          (d: Record<string, unknown>) => ({
            ...d,
            startsAt: String(d.startsAt),
            endsAt: String(d.endsAt),
            archivedAt: d.archivedAt ? String(d.archivedAt) : null,
            redemptionCount:
              typeof d.redemptionCount === "number"
                ? d.redemptionCount
                : typeof d._count === "object" && d._count
                  ? Number((d._count as { redemptions?: number }).redemptions ?? 0)
                  : 0,
          }),
        );
        setRows(list);
      }
    } catch {
      /* keep current list */
    }
  }

  async function create() {
    if (!form.code.trim()) {
      show("کد الزامی است", "error");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(form)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در ساخت کد");
      show("کد تخفیف ساخته شد", "success");
      setForm(emptyForm());
      await refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا در ساخت کد", "error");
    } finally {
      setCreating(false);
    }
  }

  async function save(id: string) {
    if (!editForm) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(editForm)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا در ذخیره");
      show("ذخیره شد", "success");
      setEditingId(null);
      setEditForm(null);
      await refresh();
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا در ذخیره", "error");
    } finally {
      setSavingId(null);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    const res = await fetch(`/api/admin/discounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) await refresh();
    else show((await res.json()).error ?? "خطا", "error");
  }

  async function archive(id: string) {
    if (!confirm("بایگانی کد تخفیف؟ (حذف نرم — قابل بازگردانی نیست از UI)")) return;
    const res = await fetch(`/api/admin/discounts/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      show("کد بایگانی شد", "success");
      await refresh();
    } else {
      show((await res.json()).error ?? "خطا", "error");
    }
  }

  const numberField = (label: string, value: number | "", onChange: (v: number | "") => void) => (
    <label className="block text-xs text-muted">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="input mt-1 w-full"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">کد جدید</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            کد
            <input
              className="input mt-1 w-full uppercase"
              placeholder="EID1404"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="block text-xs text-muted">
            نوع
            <select
              className="input mt-1 w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as FormState["type"] })}
            >
              <option value="PERCENT">درصدی</option>
              <option value="FIXED">مبلغی (تومان)</option>
            </select>
          </label>
          <label className="block text-xs text-muted">
            مقدار {form.type === "PERCENT" ? "(٪)" : "(تومان)"}
            <input
              type="number"
              min={0}
              className="input mt-1 w-full"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
            />
          </label>
          {numberField("حداقل مبلغ سفارش", form.minOrderAmount, (v) =>
            setForm({ ...form, minOrderAmount: v === "" ? 0 : v }),
          )}
          <label className="block text-xs text-muted">
            از
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label className="block text-xs text-muted">
            تا
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </label>
          {numberField("سقف تخفیف (تومان)", form.maxDiscount, (v) => setForm({ ...form, maxDiscount: v }))}
          {numberField("سقف کل استفاده", form.usageLimit, (v) => setForm({ ...form, usageLimit: v }))}
          {numberField("سقف هر کاربر", form.perUserLimit, (v) => setForm({ ...form, perUserLimit: v }))}
        </div>
        <button type="button" onClick={create} disabled={creating} className="btn-primary">
          {creating ? "در حال ساخت..." : "ساخت کد"}
        </button>
      </div>

      <ul className="space-y-3">
        {rows.map((d) => {
          const expired = new Date(d.endsAt) < new Date();
          const archived = d.archivedAt != null;
          const editing = editingId === d.id;
          return (
            <li key={d.id} className="card p-4">
              {!editing ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold tracking-wide">{d.code}</span>
                      <span className="chip !text-[11px]">
                        {d.type === "PERCENT" ? `${formatNumber(d.value)}٪` : ""}
                        {d.type === "FIXED" ? <Price amount={d.value} size="sm" /> : null}
                      </span>
                      <span
                        className={`chip !text-[11px] ${
                          archived
                            ? "bg-beige text-muted"
                            : d.isActive && !expired
                              ? "border-olive/40 text-olive-600 dark:text-olive-300"
                              : "border-warning/40 text-warning"
                        }`}
                      >
                        {archived ? "بایگانی" : expired ? "منقضی" : d.isActive ? "فعال" : "غیرفعال"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {formatNumber(d.usedCount)} استفاده
                      {d.usageLimit != null ? ` از ${formatNumber(d.usageLimit)}` : ""}
                      {" · "}
                      {d.redemptionCount != null ? `${formatNumber(d.redemptionCount)} سفارش وفادارشده · ` : ""}
                      از {new Date(d.startsAt).toLocaleDateString("fa-IR")} تا{" "}
                      {new Date(d.endsAt).toLocaleDateString("fa-IR")}
                      {d.minOrderAmount > 0 ? ` · حداقل ${formatNumber(d.minOrderAmount)}` : ""}
                      {d.maxDiscount != null ? ` · سقف ${formatNumber(d.maxDiscount)}` : ""}
                      {d.perUserLimit != null ? ` · هر نفر ${formatNumber(d.perUserLimit)}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                      onClick={() => {
                        setEditingId(d.id);
                        setEditForm({
                          code: d.code,
                          type: d.type,
                          value: d.value,
                          startsAt: toDateTimeLocal(d.startsAt),
                          endsAt: toDateTimeLocal(d.endsAt),
                          minOrderAmount: d.minOrderAmount,
                          maxDiscount: d.maxDiscount ?? "",
                          usageLimit: d.usageLimit ?? "",
                          perUserLimit: d.perUserLimit ?? "",
                        });
                      }}
                    >
                      ویرایش
                    </button>
                    {!archived && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary !px-3 !py-1.5 text-xs"
                          onClick={() => toggle(d.id, d.isActive)}
                        >
                          {d.isActive ? "غیرفعال" : "فعال"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary !px-3 !py-1.5 text-xs text-danger"
                          onClick={() => archive(d.id)}
                        >
                          بایگانی
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                editForm && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-muted">
                        نوع
                        <select
                          className="input mt-1 w-full"
                          value={editForm.type}
                          onChange={(e) =>
                            setEditForm({ ...editForm, type: e.target.value as FormState["type"] })
                          }
                        >
                          <option value="PERCENT">درصدی</option>
                          <option value="FIXED">مبلغی (تومان)</option>
                        </select>
                      </label>
                      <label className="block text-xs text-muted">
                        مقدار
                        <input
                          type="number"
                          min={0}
                          className="input mt-1 w-full"
                          value={editForm.value}
                          onChange={(e) => setEditForm({ ...editForm, value: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        از
                        <input
                          type="datetime-local"
                          className="input mt-1 w-full"
                          value={editForm.startsAt}
                          onChange={(e) => setEditForm({ ...editForm, startsAt: e.target.value })}
                        />
                      </label>
                      <label className="block text-xs text-muted">
                        تا
                        <input
                          type="datetime-local"
                          className="input mt-1 w-full"
                          value={editForm.endsAt}
                          onChange={(e) => setEditForm({ ...editForm, endsAt: e.target.value })}
                        />
                      </label>
                      {numberField("حداقل مبلغ سفارش", editForm.minOrderAmount, (v) =>
                        setEditForm({ ...editForm, minOrderAmount: v === "" ? 0 : v }),
                      )}
                      {numberField("سقف تخفیف", editForm.maxDiscount, (v) =>
                        setEditForm({ ...editForm, maxDiscount: v }),
                      )}
                      {numberField("سقف کل استفاده", editForm.usageLimit, (v) =>
                        setEditForm({ ...editForm, usageLimit: v }),
                      )}
                      {numberField("سقف هر کاربر", editForm.perUserLimit, (v) =>
                        setEditForm({ ...editForm, perUserLimit: v }),
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary !px-3 !py-1.5 text-xs"
                        disabled={savingId === d.id}
                        onClick={() => save(d.id)}
                      >
                        {savingId === d.id ? "ذخیره..." : "ذخیره"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary !px-3 !py-1.5 text-xs"
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                      >
                        انصراف
                      </button>
                    </div>
                  </div>
                )
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="card p-6 text-center text-sm text-muted">هنوز کدی ثبت نشده است.</li>
        )}
      </ul>
    </div>
  );
}
