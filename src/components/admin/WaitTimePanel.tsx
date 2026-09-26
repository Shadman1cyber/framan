"use client";
import { useCallback, useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
export type WaitData = {
  count: number; avgActualMin: number | null;
  avgPredictedMin: number | null; avgWastedMin: number | null;
  bottleneckCount: number; bottleneckRate: number | null;
  stageAvgMin: { waitToStart: number | null; kitchen: number | null; handover: number | null };
  dataIncomplete: boolean;
  worst: { orderId: string; actualMin: number | null; predictedMin: number | null; wastedMin: number | null; bottleneck: boolean; total: number }[];
};
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
export function WaitTimePanel({ from, to, onError }: { from: string; to: string; onError?: (m: string) => void }) {
  const [data, setData] = useState<WaitData | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/admin/operations/wait-time?${qs.toString()}`);
      if (res.ok) setData(await res.json());
      else if (onError) onError("خطا در بارگذاری زمان انتظار");
    } finally { setLoading(false); }
  }, [from, to, onError]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <p className="py-8 text-center text-sm text-dashboard-muted">در حال بارگذاری…</p>;
  if (!data) return null;
  const stages = [
    { label: "انتظار تا شروع", v: data.stageAvgMin.waitToStart },
    { label: "آشپزخانه (پخت)", v: data.stageAvgMin.kitchen },
    { label: "تحویل", v: data.stageAvgMin.handover },
  ];
  const nums = stages.map((s) => s.v).filter((x): x is number => x != null);
  const maxV = nums.length ? Math.max(...nums) : null;
  const cards = [
    { label: "میانگین واقعی پخت", value: data.avgActualMin != null ? `${formatNumber(data.avgActualMin)} دقیقه` : "—" },
    { label: "میانگین پیش‌بینی", value: data.avgPredictedMin != null ? `${formatNumber(data.avgPredictedMin)} دقیقه` : "—" },
    { label: "میانگین اتلاف", value: data.avgWastedMin != null ? `${formatNumber(data.avgWastedMin)} دقیقه` : "—" },
    { label: "گلوگاه‌ها", value: `${formatNumber(data.bottleneckCount)} (${data.bottleneckRate != null ? formatNumber(data.bottleneckRate) + "٪" : "—"})` },
  ];
  return (
    <div className="space-y-4">
      {data.dataIncomplete && (
        <p className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed text-dashboard-foreground">
          ⚠️ برای برخی سفارش‌های قدیمی، مهر زمانی مرحله‌ای ثبت نشده (قابلیت تازه فعال شد). میانگین‌ها از شروع/پایان سفارش محاسبه شد؛ از این پس هر تغییر وضعیت با مهر زمانی ذخیره می‌شود.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-3 text-center md:p-4">
            <div className="text-[11px] text-dashboard-muted">{c.label}</div>
            <div className="mt-1 text-sm font-bold tabular-nums text-dashboard-foreground md:text-lg">{c.value}</div>
          </div>
        ))}
      </div>
      <section className="rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <h3 className="mb-2 text-sm font-bold text-dashboard-foreground">میانگین زمانی مراحل (دقیقه)</h3>
        <ul className="grid gap-2 text-sm md:grid-cols-3">
          {stages.map((s) => {
            const slowest = s.v != null && maxV != null && s.v === maxV;
            return (
              <li key={s.label} className={`rounded-2xl border p-3 text-center ${slowest ? "border-accent-red/40 bg-accent-red/5" : "border-dashboard-line"}`}>
                <div className="text-[11px] text-dashboard-muted">{s.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-dashboard-foreground">{s.v != null ? formatNumber(s.v) : "—"}</div>
                {slowest && <div className="mt-1 text-[11px] font-semibold text-accent-red">🚩 گلوگاه احتمالی</div>}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-dashboard-muted">گلوگاه: سفارشی که زمان واقعی آن بیش از ۳۰٪ + ۳ دقیقه از پیش‌بینی بیشتر شده باشد. تحلیل «هوشمند» بر اساس همین قاعدهٔ شفاف و بدون داده‌سازی است.</p>
      </section>
      <section className="rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4">
        <h3 className="mb-2 text-sm font-bold text-dashboard-foreground">بدترین اتلاف‌ها ({formatNumber(data.count)} سفارش تکمیل‌شده)</h3>
        {data.worst.length === 0 ? <p className="text-xs text-dashboard-muted">داده‌ای نیست.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-dashboard-line text-dashboard-muted"><th className="py-1.5 text-right">سفارش</th><th className="py-1.5 text-right">واقعی</th><th className="py-1.5 text-right">پیش‌بینی</th><th className="py-1.5 text-right">اتلاف</th><th className="py-1.5 text-right">وضعیت</th></tr></thead>
              <tbody>
                {data.worst.map((w) => (
                  <tr key={w.orderId} className="border-b border-dashboard-line/60 last:border-0">
                    <td className="py-1.5 font-mono text-dashboard-foreground">#{w.orderId.slice(-6).toUpperCase()}</td>
                    <td className="py-1.5 tabular-nums text-dashboard-muted">{w.actualMin != null ? `${formatNumber(w.actualMin)}′` : "—"}</td>
                    <td className="py-1.5 tabular-nums text-dashboard-muted">{w.predictedMin != null ? `${formatNumber(w.predictedMin)}′` : "—"}</td>
                    <td className="py-1.5 tabular-nums font-bold text-accent-red">{w.wastedMin != null ? `${formatNumber(w.wastedMin)}′` : "—"}</td>
                    <td className="py-1.5 text-dashboard-foreground">{w.bottleneck ? "🚩 گلوگاه" : "عادی"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <button onClick={() => downloadCSV("wait-time.csv", ["سفارش", "واقعی", "پیش‌بینی", "اتلاف", "گلوگاه"], data.worst.map((w) => [w.orderId, w.actualMin, w.predictedMin, w.wastedMin, w.bottleneck ? "بله" : "خیر"]))} className="module-button-ghost inline-flex min-h-9 items-center rounded-full border border-dashboard-line bg-dashboard-surface px-4 text-[11px] font-semibold text-dashboard-foreground transition-all hover:brightness-110">⬇️ خروجی CSV اتلاف‌ها</button>
    </div>
  );
}
