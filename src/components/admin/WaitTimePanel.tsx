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
  if (loading) return <p className="py-8 text-center text-sm text-muted">در حال بارگذاری…</p>;
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
        <p className="rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
          ⚠️ برای برخی سفارش‌های قدیمی، مهر زمانی مرحله‌ای ثبت نشده (قابلیت تازه فعال شد). میانگین‌ها از شروع/پایان سفارش محاسبه شد؛ از این پس هر تغییر وضعیت با مهر زمانی ذخیره می‌شود.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-3 text-center md:p-4">
            <div className="text-[11px] text-muted">{c.label}</div>
            <div className="mt-1 text-sm font-bold tabular-nums md:text-lg">{c.value}</div>
          </div>
        ))}
      </div>
      <section className="card p-4">
        <h3 className="mb-2 text-sm font-bold">میانگین زمانی مراحل (دقیقه)</h3>
        <ul className="grid gap-2 text-sm md:grid-cols-3">
          {stages.map((s) => {
            const slowest = s.v != null && maxV != null && s.v === maxV;
            return (
              <li key={s.label} className={`rounded-2xl border p-3 text-center ${slowest ? "border-danger/40 bg-danger/5" : "border-coffee/10"}`}>
                <div className="text-[11px] text-muted">{s.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{s.v != null ? formatNumber(s.v) : "—"}</div>
                {slowest && <div className="mt-1 text-[11px] font-semibold text-danger">🚩 گلوگاه احتمالی</div>}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted">گلوگاه: سفارشی که زمان واقعی آن بیش از ۳۰٪ + ۳ دقیقه از پیش‌بینی بیشتر شده باشد. تحلیل «هوشمند» بر اساس همین قاعدهٔ شفاف و بدون داده‌سازی است.</p>
      </section>
      <section className="card p-4">
        <h3 className="mb-2 text-sm font-bold">بدترین اتلاف‌ها ({formatNumber(data.count)} سفارش تکمیل‌شده)</h3>
        {data.worst.length === 0 ? <p className="text-xs text-muted">داده‌ای نیست.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-muted"><th className="py-1.5 text-right">سفارش</th><th className="py-1.5 text-right">واقعی</th><th className="py-1.5 text-right">پیش‌بینی</th><th className="py-1.5 text-right">اتلاف</th><th className="py-1.5 text-right">وضعیت</th></tr></thead>
              <tbody>
                {data.worst.map((w) => (
                  <tr key={w.orderId} className="border-b border-coffee/5 last:border-0">
                    <td className="py-1.5 font-mono">#{w.orderId.slice(-6).toUpperCase()}</td>
                    <td className="py-1.5 tabular-nums">{w.actualMin != null ? `${formatNumber(w.actualMin)}′` : "—"}</td>
                    <td className="py-1.5 tabular-nums">{w.predictedMin != null ? `${formatNumber(w.predictedMin)}′` : "—"}</td>
                    <td className="py-1.5 tabular-nums font-bold text-danger">{w.wastedMin != null ? `${formatNumber(w.wastedMin)}′` : "—"}</td>
                    <td className="py-1.5">{w.bottleneck ? "🚩 گلوگاه" : "عادی"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <button onClick={() => downloadCSV("wait-time.csv", ["سفارش", "واقعی", "پیش‌بینی", "اتلاف", "گلوگاه"], data.worst.map((w) => [w.orderId, w.actualMin, w.predictedMin, w.wastedMin, w.bottleneck ? "بله" : "خیر"]))} className="btn-secondary text-xs">⬇️ خروجی CSV اتلاف‌ها</button>
    </div>
  );
}
