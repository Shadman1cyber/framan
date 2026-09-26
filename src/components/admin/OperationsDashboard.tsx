"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { formatNumber, formatToman } from "@/lib/format";
import { JalaliDateInput, JalaliDateTimeInput, JalaliMonthInput } from "@/components/ui/JalaliInputs";
import { formatJalaliDate, formatJalaliDateTime, formatJalaliTime, todayGregorianInput } from "@/lib/jalali";
import { STAFF_ROLES, STAFF_ROLE_LABELS_FA, type StaffRole } from "@/lib/constants";

/* ── types ─────────────────────────────────────────────────────────── */

export type ProductOpt = { id: string; nameFa: string; price: number };
export type StaffOpt = { id: string; name: string; role: string; task: string | null; shiftStart: string | null; shiftEnd: string | null; isActive: boolean };

type Goal = {
  id: string; title: string; metric: string; targetValue: number;
  productId: string | null; productName: string | null;
  from: string; to: string; isActive: boolean;
  current: number | null; pct: number | null;
  status: "REACHED" | "APPROACHING" | "ON_TRACK" | "MISSED" | "UNKNOWN";
  warning: string | null; profitUnavailable: boolean;
};

type MatrixRow = {
  productId: string; product: string; category: string;
  quantity: number; revenue: number; cost: number | null; profit: number | null;
  quadrant: "KEEP" | "REVIEW_TRAINING" | "CHANGE_RECIPE" | "REMOVE_FIX" | "UNKNOWN";
  actionFa: string; profitUnknown: boolean;
};

type MatrixData = {
  from: string; to: string; profitAvailable: boolean;
  medians: { quantity: number; profit: number };
  rows: MatrixRow[]; counts: Record<string, number>;
};

type SalesData = {
  from: string; to: string;
  totalSales: number; totalProfit: number | null; profitAvailable: boolean; invoiceCount: number;
  daily: { date: string; total: number; count: number; items: number }[];
  byProduct: { productId: string; product: string; quantity: number; total: number }[];
  bestSelling: { product: string; quantity: number; total: number } | null;
  mostLiked: { product: string; avg: number; votes: number } | null;
  busiestHours: { hour: number; orders: number; revenue: number }[];
  busiestWeekdays: { weekday: number; weekdayFa: string; orders: number; revenue: number }[];
  noOrderGaps: { date: string; longestGapMin: number | null; gapsCount: number }[];
  maxGap: { date: string; longestGapMin: number } | null;
};

type DayDetail = { date: string; total: number; count: number; items: { product: string; quantity: number; total: number }[] };

type Attendance = { id: string; staffId: string; date: string; checkIn: string | null; checkOut: string | null; lateMin: number; overtimeMin: number; staff?: { name: string } };
type Leave = { id: string; staffId: string; type: string; from: string; to: string; status: string; reason: string | null; staff?: { name: string } };
type Suggestion = { days: number; hours: { hour: number; avgOrders: number; avgRevenue: number; suggested: number; peak: boolean }[]; note: string };

const GOAL_METRIC_FA: Record<string, string> = {
  TOTAL_SALES: "مبلغ کل فروش (تومان)",
  TOTAL_PROFIT: "سود کل (تومان)",
  ITEM_COUNT: "تعداد فروش محصول",
};

const QUADRANT_FA: Record<string, { title: string; action: string; hint: string; tint: string }> = {
  KEEP: { title: "سود بالا + فروش بالا", action: "حفظ", hint: "موجودی و کیفیت را حفظ کنید.", tint: "border-olive/40 bg-olive/5" },
  REVIEW_TRAINING: { title: "سود بالا + فروش پایین", action: "بررسی + آموزش", hint: "پرومو و آموزش فروش.", tint: "border-warning/40 bg-warning/5" },
  CHANGE_RECIPE: { title: "سود پایین + فروش بالا", action: "تغییر دستور", hint: "رسپی یا قیمت را بازبینی کنید.", tint: "border-coffee/40 bg-coffee/5" },
  REMOVE_FIX: { title: "سود پایین + فروش پایین", action: "حذفی / اصلاح", hint: "اصلاح یا حذف از منو.", tint: "border-danger/40 bg-danger/5" },
  UNKNOWN: { title: "داده ناقص", action: "تکمیل داده", hint: "رسپی یا هزینهٔ مواد ثبت نشده.", tint: "border-coffee/20 bg-beige-soft" },
};

/* ── helpers ───────────────────────────────────────────────────────── */

function downloadCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function Donut({ pct, size = 84 }: { pct: number | null; size?: number }) {
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const r = 34; const c = 2 * Math.PI * r;
  // Colours are CSS variables with the legacy values as fallback, so hosts that
  // define them (the financial report) can theme the ring without forking this
  // shared component. /admin/operations renders exactly as before.
  const color = pct == null ? "var(--donut-none, #B5A796)" : v >= 100 ? "var(--donut-high, #556B2F)" : v >= 80 ? "var(--donut-mid, #C68A2E)" : "var(--donut-low, #6F4E37)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={pct == null ? "پیشرفت نامشخص" : `پیشرفت ${pct} درصد`}>
      <svg viewBox="0 0 84 84" width={size} height={size}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--donut-track, #EFE3CB)" strokeWidth="10" />
        <circle
          cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 42 42)"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {pct == null ? "—" : `${formatNumber(pct)}٪`}
      </span>
    </div>
  );
}

function DateRangeFilter({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        از
        <JalaliDateInput value={from} onChange={(g) => onChange(g, to)} ariaLabel="از تاریخ" />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        تا
        <JalaliDateInput value={to} onChange={(g) => onChange(from, g)} ariaLabel="تا تاریخ" />
      </label>
    </div>
  );
}

/* ── main ──────────────────────────────────────────────────────────── */

export function OperationsDashboard() {
  return (
    <div className="card space-y-2 p-4 text-sm leading-relaxed">
      <p className="font-semibold">محتوای این داشبورد به بخش‌های تخصصی‌تر منتقل شد:</p>
      <ul className="list-inside list-disc space-y-1">
        <li>⏱️ تحلیل زمان انتظار و گلوگاه‌ها → <Link href="/admin/sales-flow" className="font-semibold text-olive underline">جریان فروش</Link></li>
        <li>👥 برنامه‌ریزی نیروها، حضور و غیاب → <Link href="/admin/staff" className="font-semibold text-olive underline">پرسنل</Link></li>
        <li>🎯 اهداف، تحلیل فروش و ماتریس سود → <Link href="/admin/financial" className="font-semibold text-olive underline">مالی</Link></li>
      </ul>
    </div>
  );
}

/* ── A. GOALS ──────────────────────────────────────────────────────── */

export function GoalsPanel({ products, show }: { products: ProductOpt[]; show: (m: string, k?: "success" | "error" | "info") => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("TOTAL_SALES");
  const [target, setTarget] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState(() => todayGregorianInput());
  const [to, setTo] = useState(() => { const g = todayGregorianInput(); const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g); if (!m) return g; const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + 30 * 86400000); const p2 = (n: number) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operations/goals");
      if (res.ok) setGoals((await res.json()).goals ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!title.trim() || !target) { show("عنوان و مقدار هدف الزامی است", "error"); return; }
    const res = await fetch("/api/admin/operations/goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), metric, targetValue: Number(target), productId: productId || null, from, to }),
    });
    if (res.ok) { setTitle(""); setTarget(""); setProductId(""); show("هدف ثبت شد", "success"); load(); }
    else show((await res.json()).error ?? "خطا", "error");
  }

  async function remove(id: string) {
    if (!confirm("حذف هدف؟")) return;
    const res = await fetch(`/api/admin/operations/goals/${id}`, { method: "DELETE" });
    if (res.ok) { show("حذف شد", "success"); load(); }
  }

  const warnings = goals.filter((g) => g.warning);

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="space-y-2" role="alert">
          {warnings.map((w) => (
            <div key={w.id} className={`rounded-2xl border p-3 text-sm ${w.status === "REACHED" ? "border-olive/40 bg-olive/10" : w.status === "MISSED" ? "border-danger/30 bg-danger/5" : "border-warning/40 bg-warning/10"}`}>
              <span className="font-semibold">{w.status === "REACHED" ? "✅ " : w.status === "MISSED" ? "⛔ " : "⚠️ "}</span>{w.warning}
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">🎯 هدف جدید</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <input className="input" placeholder="عنوان هدف (مثلاً فروش تابستان)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {Object.entries(GOAL_METRIC_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input tabular-nums" type="number" min="1" placeholder={metric === "ITEM_COUNT" ? "تعداد هدف (عدد)" : "مبلغ هدف (تومان)"} value={target} onChange={(e) => setTarget(e.target.value)} />
          {metric === "ITEM_COUNT" && (
            <select className="input md:col-span-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">انتخاب محصول…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nameFa}</option>)}
            </select>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <JalaliDateInput value={from} onChange={setFrom} className="input" ariaLabel="از تاریخ" />
            <JalaliDateInput value={to} onChange={setTo} className="input" ariaLabel="تا تاریخ" />
          </div>
        </div>
        <button onClick={create} className="btn-primary mt-3 text-sm">ثبت هدف</button>
      </div>

      {loading ? <p className="py-8 text-center text-sm text-muted">در حال بارگذاری…</p> : goals.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">هنوز هدفی ثبت نشده است.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => (
            <div key={g.id} className="card flex items-center gap-4 p-4">
              <Donut pct={g.pct} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-bold">{g.title}</h3>
                  <button onClick={() => remove(g.id)} className="shrink-0 text-xs text-danger hover:underline">حذف</button>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {GOAL_METRIC_FA[g.metric] ?? g.metric}{g.productName ? ` · ${g.productName}` : ""} · {formatJalaliDate(g.from)} تا {formatJalaliDate(g.to)}
                </p>
                <p className="mt-1 text-sm tabular-nums">
                  {g.current == null ? "نامشخص (دادهٔ سود ناقص)" : <><span className="font-bold">{g.metric === "ITEM_COUNT" ? formatNumber(g.current) : formatToman(g.current)}</span><span className="text-muted"> از </span><span>{g.metric === "ITEM_COUNT" ? formatNumber(g.targetValue) : formatToman(g.targetValue)}</span></>}
                </p>
                {g.warning && <p className="mt-1 text-[11px] leading-relaxed text-warning">{g.warning}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => downloadCSV("goals.csv", ["عنوان", "متریک", "فعلی", "هدف", "درصد", "وضعیت"], goals.map((g) => [g.title, g.metric, g.current, g.targetValue, g.pct, g.status]))}
        className="btn-secondary text-xs"
      >
        ⬇️ خروجی CSV اهداف
      </button>
    </div>
  );
}

/* ── B. MATRIX ─────────────────────────────────────────────────────── */

export function MatrixPanel({ from, to, show }: { from: string; to: string; show: (m: string, k?: "success" | "error" | "info") => void }) {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/operations/matrix?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
      else show("خطا در بارگذاری ماتریس", "error");
    } finally { setLoading(false); }
  }, [from, to, show]);
  useEffect(() => { load(); }, [load]);

  const byQuadrant = useMemo(() => {
    const m: Record<string, MatrixRow[]> = { KEEP: [], REVIEW_TRAINING: [], CHANGE_RECIPE: [], REMOVE_FIX: [], UNKNOWN: [] };
    for (const r of data?.rows ?? []) m[r.quadrant]?.push(r);
    return m;
  }, [data]);

  if (loading) return <p className="py-8 text-center text-sm text-muted">در حال بارگذاری…</p>;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {!data.profitAvailable && (
        <p className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
          ⚠️ دادهٔ سود کامل نیست (رسپی یا هزینهٔ مواد برخی محصولات ثبت نشده). محصولات بدون سود در ستون «داده ناقص» قرار گرفتند و سود فرضی ساخته نشد.
        </p>
      )}
      <p className="text-[11px] text-muted">میانهٔ فروش: {formatNumber(data.medians.quantity)} عدد · میانهٔ سود: {formatToman(data.medians.profit)}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {(["KEEP", "REVIEW_TRAINING", "CHANGE_RECIPE", "REMOVE_FIX"] as const).map((q) => (
          <section key={q} className={`card border-2 p-4 ${QUADRANT_FA[q].tint}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{QUADRANT_FA[q].title}</h3>
              <span className="chip">{formatNumber(byQuadrant[q].length)} محصول · {QUADRANT_FA[q].action}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">{QUADRANT_FA[q].hint}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {byQuadrant[q].slice(0, 8).map((r) => (
                <li key={r.productId} className="flex items-center justify-between gap-2 rounded-xl bg-cream px-2.5 py-1.5 dark:bg-dark-bg">
                  <span className="truncate">{r.product} <span className="text-[11px] text-muted">· {r.category}</span></span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatNumber(r.quantity)} فروش · {formatToman(r.profit ?? 0)} سود</span>
                </li>
              ))}
              {byQuadrant[q].length === 0 && <li className="text-xs text-muted">محصولی در این ربع نیست.</li>}
              {byQuadrant[q].length > 8 && <li className="text-[11px] text-muted">+ {formatNumber(byQuadrant[q].length - 8)} مورد دیگر</li>}
            </ul>
          </section>
        ))}
      </div>
      {byQuadrant.UNKNOWN.length > 0 && (
        <section className="card border border-dashed p-4">
          <h3 className="text-sm font-bold">داده ناقص ({formatNumber(byQuadrant.UNKNOWN.length)})</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {byQuadrant.UNKNOWN.map((r) => <span key={r.productId} className="chip">{r.product} · {formatNumber(r.quantity)} فروش</span>)}
          </div>
        </section>
      )}
      <button
        onClick={() => downloadCSV("product-matrix.csv", ["محصول", "دسته", "تعداد", "درآمد", "سود", "ربع", "اقدام"], (data?.rows ?? []).map((r) => [r.product, r.category, r.quantity, r.revenue, r.profit, r.quadrant, r.actionFa]))}
        className="btn-secondary text-xs"
      >
        ⬇️ خروجی CSV ماتریس
      </button>
    </div>
  );
}

/* ── C. SALES ──────────────────────────────────────────────────────── */

export function SalesPanel({ from, to, show }: { from: string; to: string; show: (m: string, k?: "success" | "error" | "info") => void }) {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/operations/sales?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
      else show("خطا در بارگذاری فروش", "error");
    } finally { setLoading(false); }
  }, [from, to, show]);
  useEffect(() => { load(); }, [load]);

  async function openDay(d: string) {
    setDay(d);
    const res = await fetch(`/api/admin/operations/sales?day=${d}`);
    if (res.ok) setDetail(await res.json());
  }

  const maxDaily = Math.max(1, ...(data?.daily.map((d) => d.total) ?? [1]));
  const maxHour = Math.max(1, ...(data?.busiestHours.map((h) => h.orders) ?? [1]));

  if (loading) return <p className="py-8 text-center text-sm text-muted">در حال بارگذاری…</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {[
          { label: "فروش کل", value: formatToman(data.totalSales) },
          { label: "سود کل (مواد)", value: data.profitAvailable && data.totalProfit != null ? formatToman(data.totalProfit) : "نامشخص" },
          { label: "تعداد فاکتور", value: formatNumber(data.invoiceCount) },
        ].map((c) => (
          <div key={c.label} className="card p-3 text-center md:p-4">
            <div className="text-[11px] text-muted">{c.label}</div>
            <div className="mt-1 text-sm font-bold tabular-nums md:text-lg">{c.value}</div>
          </div>
        ))}
      </div>

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">فروش روزانه (برای جزئیات روی ستون بزنید)</h3>
          <span className="text-[11px] text-muted">{formatNumber(data.daily.length)} روز</span>
        </div>
        {data.daily.length === 0 ? <p className="py-6 text-center text-xs text-muted">فروشی در این بازه نیست.</p> : (
          <div className="flex h-40 items-end gap-1 overflow-x-auto" dir="ltr">
            {data.daily.map((d) => (
              <button
                key={d.date} onClick={() => openDay(d.date)}
                className={`group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1 rounded-t ${day === d.date ? "opacity-100" : ""}`}
                title={`${formatJalaliDate(d.date)}: ${formatToman(d.total)} · ${formatNumber(d.count)} فاکتور`}
              >
                <span className="text-[10px] tabular-nums text-muted opacity-0 group-hover:opacity-100">{formatNumber(d.count)}</span>
                <span className={`w-full rounded-t transition-colors ${day === d.date ? "bg-warning" : "bg-olive/70 group-hover:bg-olive"}`} style={{ height: `${Math.max(4, (d.total / maxDaily) * 120)}px` }} />
                <span className="text-[9px] text-muted">{formatJalaliDate(d.date).slice(5)}</span>
              </button>
            ))}
          </div>
        )}
        {detail && (
          <div className="mt-3 rounded-2xl border border-coffee/15 p-3 text-sm dark:border-dark-border">
            <div className="flex items-center justify-between">
              <strong>جزئیات {formatJalaliDate(detail.date)}</strong>
              <button onClick={() => { setDay(null); setDetail(null); }} className="text-xs text-muted hover:underline">بستن</button>
            </div>
            <p className="mt-1 text-xs text-muted">{formatToman(detail.total)} · {formatNumber(detail.count)} فاکتور</p>
            <ul className="mt-2 space-y-1">
              {detail.items.map((i, idx) => (
                <li key={idx} className="flex justify-between text-xs"><span>{i.product}</span><span className="tabular-nums text-muted">{formatNumber(i.quantity)} عدد · {formatToman(i.total)}</span></li>
              ))}
              {detail.items.length === 0 && <li className="text-xs text-muted">آیتمی ثبت نشده.</li>}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold">پرفروش‌ترین و محبوب‌ترین</h3>
          <p className="text-sm">🏆 پرفروش‌ترین: <strong>{data.bestSelling ? `${data.bestSelling.product} (${formatNumber(data.bestSelling.quantity)} عدد)` : "—"}</strong></p>
          <p className="mt-1 text-sm">❤️ محبوب‌ترین (امتیاز): <strong>{data.mostLiked ? `${data.mostLiked.product} (★ ${data.mostLiked.avg} از ${formatNumber(data.mostLiked.votes)} رأی)` : "—"}</strong></p>
          <h4 className="mb-1 mt-4 text-xs font-semibold text-muted">تفکیک آیتمی بازه</h4>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {data.byProduct.slice(0, 20).map((p) => (
              <li key={p.productId} className="flex justify-between gap-2"><span className="truncate">{p.product}</span><span className="shrink-0 tabular-nums text-muted">{formatNumber(p.quantity)} · {formatToman(p.total)}</span></li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold">شلوغ‌ترین ساعت‌ها</h3>
          <div className="flex h-28 items-end gap-0.5" dir="ltr">
            {data.busiestHours.map((h) => (
              <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end" title={`ساعت ${h.hour}: ${formatNumber(h.orders)} سفارش`}>
                <div className={`w-full rounded-t ${h.orders === maxHour && h.orders > 0 ? "bg-warning" : "bg-coffee/50"}`} style={{ height: `${Math.max(2, (h.orders / maxHour) * 90)}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted" dir="ltr"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
          <h4 className="mb-1 mt-3 text-xs font-semibold text-muted">شلوغ‌ترین روزهای هفته</h4>
          <ul className="space-y-1 text-xs">
            {[...data.busiestWeekdays].sort((a, b) => b.orders - a.orders).map((w) => (
              <li key={w.weekday} className="flex justify-between"><span>{w.weekdayFa}</span><span className="tabular-nums text-muted">{formatNumber(w.orders)} سفارش · {formatToman(w.revenue)}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">طولانی‌ترین فاصلهٔ بدون سفارش هر روز</h3>
          {data.maxGap && <span className="chip border-warning/40 text-warning">رکورد: {formatJalaliDate(data.maxGap.date)} · {formatNumber(data.maxGap.longestGapMin)} دقیقه</span>}
        </div>
        {data.noOrderGaps.length === 0 ? <p className="mt-2 text-xs text-muted">داده‌ای نیست (کمتر از ۲ سفارش در روز).</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-muted"><th className="py-1.5 text-right">تاریخ</th><th className="py-1.5 text-right">طولانی‌ترین وقفه</th><th className="py-1.5 text-right">تعداد سفارش</th></tr></thead>
              <tbody>
                {data.noOrderGaps.map((g) => (
                  <tr key={g.date} className="border-b border-coffee/5 last:border-0">
                    <td className="py-1.5">{formatJalaliDate(g.date)}</td>
                    <td className="py-1.5 tabular-nums">{g.longestGapMin == null ? "—" : `${formatNumber(g.longestGapMin)} دقیقه`}</td>
                    <td className="py-1.5 tabular-nums">{formatNumber(g.gapsCount + 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <button
        onClick={() => downloadCSV("sales-demand.csv", ["تاریخ", "فروش", "فاکتور", "آیتم"], data.daily.map((d) => [d.date, d.total, d.count, d.items]))}
        className="btn-secondary text-xs"
      >
        ⬇️ خروجی CSV فروش روزانه
      </button>
    </div>
  );
}

/* ── D. STAFF ──────────────────────────────────────────────────────── */

export function StaffPanel({ from, to, initialStaff, show, refresh }: {
  from: string; to: string; initialStaff: StaffOpt[];
  show: (m: string, k?: "success" | "error" | "info") => void; refresh: () => void;
}) {
  const [staff, setStaff] = useState<StaffOpt[]>(initialStaff);
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("CHEF");
  const [task, setTask] = useState("");
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("18:00");
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [deadlineH, setDeadlineH] = useState(48);
  const [newDeadline, setNewDeadline] = useState("48");
  const [leaveForm, setLeaveForm] = useState({ staffId: "", from: "", to: "", reason: "" });
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reports, setReports] = useState<Record<string, { presentDays: number; totalLateMin: number; totalOvertimeMin: number; leaves: { approved: number; pending: number } }>>({});
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const loadAll = useCallback(async () => {
    const [sRes, aRes, lRes, sgRes] = await Promise.all([
      fetch("/api/admin/staff").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/operations/staff/attendance").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/operations/staff/leaves").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/admin/operations/staff/suggestion?from=${from}&to=${to}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (sRes?.staff) setStaff(sRes.staff);
    if (aRes?.attendance) setAttendance(aRes.attendance);
    if (lRes?.leaves) { setLeaves(lRes.leaves); if (lRes.deadlineH != null) { setDeadlineH(lRes.deadlineH); setNewDeadline(String(lRes.deadlineH)); } }
    if (sgRes) setSuggestion(sgRes);
  }, [from, to]);
  useEffect(() => { loadAll(); }, [loadAll]);

  async function createStaff() {
    if (!name.trim()) { show("نام الزامی است", "error"); return; }
    const res = await fetch("/api/admin/staff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), role, task: task.trim() || null, shiftStart: shiftStart || null, shiftEnd: shiftEnd || null }),
    });
    if (res.ok) { setName(""); setTask(""); show("پرسنل اضافه شد", "success"); loadAll(); refresh(); }
    else show((await res.json()).error ?? "خطا", "error");
  }

  async function toggleActive(s: StaffOpt) {
    await fetch(`/api/admin/staff/${s.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !s.isActive }) });
    loadAll();
  }

  async function removeStaff(id: string) {
    if (!confirm("حذف پرسنل؟")) return;
    await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    loadAll(); refresh();
  }

  async function check(action: "checkin" | "checkout", staffId: string) {
    const res = await fetch("/api/admin/operations/staff/attendance", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, action }),
    });
    if (res.ok) { const j = await res.json(); show(`ثبت شد · تأخیر ${formatNumber(j.lateMin)} دقیقه · اضافه‌کار ${formatNumber(j.overtimeMin)} دقیقه`, "success"); loadAll(); }
    else show((await res.json()).error ?? "خطا", "error");
  }

  async function createInstantLeave() {
    if (!leaveForm.staffId || !leaveForm.from || !leaveForm.to) { show("پرسنل و بازهٔ مرخصی الزامی است", "error"); return; }
    const res = await fetch("/api/admin/operations/staff/leaves", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...leaveForm, type: "INSTANT" }),
    });
    if (res.ok) { show("مرخصی فوری ثبت شد", "success"); setLeaveForm({ staffId: "", from: "", to: "", reason: "" }); loadAll(); }
    else show((await res.json()).error ?? "خطا", "error");
  }

  async function decideLeave(id: string, status: "APPROVED" | "REJECTED") {
    await fetch(`/api/admin/operations/staff/leaves/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadAll();
  }

  async function saveDeadline() {
    const res = await fetch("/api/admin/operations/staff/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deadlineH: Number(newDeadline) }) });
    if (res.ok) { setDeadlineH(Number(newDeadline)); show("مهلت درخواست ذخیره شد", "success"); }
  }

  async function loadReports() {
    const out: typeof reports = {};
    for (const s of staff) {
      const res = await fetch(`/api/admin/operations/staff/report?staffId=${s.id}&month=${reportMonth}`);
      if (res.ok) out[s.id] = await res.json();
    }
    setReports(out);
    show("گزارش ماهانه به‌روز شد", "success");
  }

  const maxSg = Math.max(1, ...(suggestion?.hours.map((h) => h.suggested) ?? [1]));

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h3 className="mb-2 text-sm font-bold">👥 پرسنل (نام، نقش/وظیفه، ساعات کاری)</h3>
        <ul className="space-y-1.5">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2.5 text-sm dark:border-dark-border">
              <div>
                <div className="font-semibold">{s.name} <span className="text-[11px] font-normal text-muted">{STAFF_ROLE_LABELS_FA[s.role as StaffRole] ?? s.role}{s.task ? ` · ${s.task}` : ""}</span></div>
                <div className="text-[11px] tabular-nums text-muted">شیفت: {s.shiftStart ?? "—"} تا {s.shiftEnd ?? "—"} · {s.isActive ? "فعال" : "غیرفعال"}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => check("checkin", s.id)} className="btn-ghost text-xs">ورود</button>
                <button onClick={() => check("checkout", s.id)} className="btn-ghost text-xs">خروج</button>
                <button onClick={() => toggleActive(s)} className="btn-ghost text-xs">{s.isActive ? "غیرفعال" : "فعال"}</button>
                <button onClick={() => removeStaff(s.id)} className="btn-ghost text-xs text-danger">حذف</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <input className="input" placeholder="نام" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABELS_FA[r]}</option>)}
          </select>
          <input className="input" placeholder="وظیفه (مثلاً بار سرد)" value={task} onChange={(e) => setTask(e.target.value)} />
          <input className="input tabular-nums" type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} aria-label="شروع شیفت" />
          <input className="input tabular-nums" type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} aria-label="پایان شیفت" />
        </div>
        <button onClick={createStaff} className="btn-primary mt-2 text-sm">افزودن پرسنل</button>
      </section>

      <section className="card p-4">
        <h3 className="mb-2 text-sm font-bold">🕘 تردد اخیر (تأخیر / اضافه‌کار خودکار)</h3>
        {attendance.length === 0 ? <p className="text-xs text-muted">ترددی ثبت نشده.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-muted"><th className="py-1.5 text-right">پرسنل</th><th className="py-1.5 text-right">تاریخ</th><th className="py-1.5 text-right">ورود</th><th className="py-1.5 text-right">خروج</th><th className="py-1.5 text-right">تأخیر</th><th className="py-1.5 text-right">اضافه‌کار</th></tr></thead>
              <tbody>
                {attendance.slice(0, 15).map((a) => (
                  <tr key={a.id} className="border-b border-coffee/5 last:border-0">
                    <td className="py-1.5">{a.staff?.name ?? a.staffId.slice(0, 6)}</td>
                    <td className="py-1.5 tabular-nums">{formatJalaliDate(a.date)}</td>
                    <td className="py-1.5 tabular-nums">{a.checkIn ? formatJalaliTime(a.checkIn) : "—"}</td>
                    <td className="py-1.5 tabular-nums">{a.checkOut ? formatJalaliTime(a.checkOut) : "—"}</td>
                    <td className="py-1.5 tabular-nums text-warning">{formatNumber(a.lateMin)}′</td>
                    <td className="py-1.5 tabular-nums text-olive-600">{formatNumber(a.overtimeMin)}′</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="leave-requests" className="card scroll-mt-24 space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">🏖️ مرخصی‌ها</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">مهلت درخواست صندوق‌دار: {formatNumber(deadlineH)} ساعت</span>
            <input className="input !w-20 !py-1 text-xs tabular-nums" type="number" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
            <button onClick={saveDeadline} className="btn-ghost text-xs">ذخیره</button>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold">📨 درخواست‌های ثبت‌شده از پنل صندوق‌دار ({formatNumber(leaves.filter((l) => l.type !== "INSTANT" && l.status === "PENDING").length)} در انتظار)</h4>
          <ul className="space-y-1.5 text-xs">
            {leaves.filter((l) => l.type !== "INSTANT").slice(0, 15).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2 dark:border-dark-border">
                <span>{l.staff?.name ?? ""} · {formatJalaliDateTime(l.from)} تا {formatJalaliDateTime(l.to)}{l.reason ? ` · ${l.reason}` : ""} · <strong>{l.status === "PENDING" ? "در انتظار" : l.status === "APPROVED" ? "تأیید شد" : "رد شد"}</strong></span>
                {l.status === "PENDING" && (
                  <span className="flex gap-1.5">
                    <button onClick={() => decideLeave(l.id, "APPROVED")} className="btn-ghost text-xs">تأیید</button>
                    <button onClick={() => decideLeave(l.id, "REJECTED")} className="btn-ghost text-xs text-danger">رد</button>
                  </span>
                )}
              </li>
            ))}
            {leaves.filter((l) => l.type !== "INSTANT").length === 0 && <li className="text-muted">درخواستی از پنل صندوق‌دار ثبت نشده.</li>}
          </ul>
        </div>

        <div className="space-y-2 border-t border-coffee/10 pt-3 dark:border-dark-border">
          <h4 className="text-xs font-bold">⚡ ثبت مرخصی فوری توسط مدیر</h4>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <select className="input min-w-0" value={leaveForm.staffId} onChange={(e) => setLeaveForm({ ...leaveForm, staffId: e.target.value })}>
              <option value="">پرسنل…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input min-w-0" placeholder="دلیل (اختیاری)" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              <span>از تاریخ و ساعت</span>
              <JalaliDateTimeInput value={leaveForm.from} onChange={(v) => setLeaveForm({ ...leaveForm, from: v })} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              <span>تا تاریخ و ساعت</span>
              <JalaliDateTimeInput value={leaveForm.to} onChange={(v) => setLeaveForm({ ...leaveForm, to: v })} />
            </label>
          </div>
          <button onClick={createInstantLeave} className="btn-primary text-xs">⚡ ثبت مرخصی فوری</button>
          <ul className="space-y-1.5 text-xs">
            {leaves.filter((l) => l.type === "INSTANT").slice(0, 10).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-coffee/10 p-2 dark:border-dark-border">
                <span>{l.staff?.name ?? ""} · {formatJalaliDateTime(l.from)} تا {formatJalaliDateTime(l.to)}{l.reason ? ` · ${l.reason}` : ""} · <strong>تأیید شد</strong></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">📋 گزارش پایان ماه پرسنل</h3>
          <div className="flex items-center gap-2 text-xs">
            <JalaliMonthInput value={reportMonth} onChange={setReportMonth} />
            <button onClick={loadReports} className="btn-secondary text-xs">محاسبه</button>
            <button onClick={() => downloadCSV(`staff-report-${reportMonth}.csv`, ["پرسنل", "روز حاضر", "تأخیر (دقیقه)", "اضافه‌کار (دقیقه)", "مرخصی تأییدشده", "در انتظار"], staff.map((s) => [s.name, reports[s.id]?.presentDays ?? "", reports[s.id]?.totalLateMin ?? "", reports[s.id]?.totalOvertimeMin ?? "", reports[s.id]?.leaves.approved ?? "", reports[s.id]?.leaves.pending ?? ""]))} className="btn-ghost text-xs">⬇️ CSV</button>
          </div>
        </div>
        <ul className="mt-2 space-y-1 text-xs">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-beige-soft px-2.5 py-1.5 dark:bg-dark-surfaceHover">
              <span className="font-semibold">{s.name}{s.task ? <span className="font-normal text-muted"> · {s.task}</span> : ""}</span>
              <span className="tabular-nums text-muted">
                {reports[s.id] ? `حاضر: ${formatNumber(reports[s.id].presentDays)} روز · تأخیر: ${formatNumber(reports[s.id].totalLateMin)}′ · اضافه‌کار: ${formatNumber(reports[s.id].totalOvertimeMin)}′ · مرخصی: ${formatNumber(reports[s.id].leaves.approved)}` : "— دکمهٔ محاسبه —"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h3 className="mb-1 text-sm font-bold">🤖 پیشنهاد حداقل نیروی هر ساعت (از فروش گذشته)</h3>
        {suggestion ? (
          <>
            <div className="flex h-28 items-end gap-0.5" dir="ltr">
              {suggestion.hours.map((h) => (
                <div key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end" title={`ساعت ${h.hour}: میانگین ${h.avgOrders} سفارش → ${h.suggested} نفر`}>
                  <span className="text-[9px] tabular-nums text-muted">{h.suggested > 0 ? formatNumber(h.suggested) : ""}</span>
                  <div className={`w-full rounded-t ${h.peak ? "bg-warning" : "bg-olive/60"}`} style={{ height: `${Math.max(2, (h.suggested / maxSg) * 80)}px` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-muted" dir="ltr"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{suggestion.note} (میانگین روی {formatNumber(suggestion.days)} روز دارای فروش)</p>
            <button onClick={() => downloadCSV("staff-suggestion.csv", ["ساعت", "میانگین سفارش", "میانگین درآمد", "پیشنهاد نفر"], suggestion.hours.map((h) => [h.hour, h.avgOrders, h.avgRevenue, h.suggested]))} className="btn-ghost mt-2 text-xs">⬇️ CSV پیشنهاد</button>
          </>
        ) : <p className="text-xs text-muted">در حال محاسبه…</p>}
      </section>
    </div>
  );
}

/* ── E. WAIT (moved to Sales-Flow page — see WaitTimePanel.tsx) ────── */
