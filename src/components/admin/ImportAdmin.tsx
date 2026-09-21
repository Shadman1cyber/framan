"use client";
import { formatJalaliDateTime } from "@/lib/jalali";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

type PreviewRow = {
  row: number;
  data: Record<string, string>;
  errors: Array<{ row: number; field?: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
};
type Preview = {
  kind: string;
  headers: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: PreviewRow[];
};
type Report = { kind: string; created: number; skipped: number; errors: Array<{ row: number; message: string }> };
type Job = { id: string; kind: string; status: string; createdAt: string; report: string };

const KINDS = [
  { value: "PRODUCTS", label: "محصولات" },
  { value: "INGREDIENTS", label: "مواد اولیه / انبار" },
  { value: "ORDERS", label: "سفارش‌ها" },
  { value: "EXPENSES", label: "هزینه‌ها" },
];

export function ImportAdmin({ initialJobs }: { initialJobs: Job[] }) {
  const [kind, setKind] = useState("PRODUCTS");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      show("حجم فایل بیش از ۲ مگابایت است", "error");
      return;
    }
    setFilename(file.name);
    setPreview(null);
    setReport(null);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function runPreview() {
    if (!content.trim()) {
      show("ابتدا فایل CSV را انتخاب کنید", "error");
      return;
    }
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      setPreview(j.preview);
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content, confirmed: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      setReport(j.report);
      setPreview(null);
      show(`درون‌ریزی انجام شد: ${j.report.created} ردیف`, "success");
      const jobsRes = await fetch("/api/admin/import");
      const jj = await jobsRes.json();
      setJobs(jj.jobs ?? []);
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">مرحله ۱ — انتخاب فایل</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label">نوع داده</span>
            <select className="input" value={kind} onChange={(e) => { setKind(e.target.value); setPreview(null); }}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">فایل CSV (حداکثر ۲ مگابایت)</span>
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="input py-2" />
          </label>
        </div>
        {filename && (
          <p className="mt-2 text-xs text-muted">فایل انتخاب‌شده: {filename}</p>
        )}
        <button onClick={runPreview} disabled={busy} className="btn-primary mt-4">
          {busy ? "در حال پردازش..." : "بررسی و پیش‌نمایش"}
        </button>
      </div>

      {preview && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">مرحله ۲ — پیش‌نمایش و تایید</h2>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="chip">کل ردیف‌ها: {preview.totalRows}</span>
            <span className="chip chip-active">معتبر: {preview.validRows}</span>
            {preview.errorRows > 0 && (
              <span className="chip border-danger/30 text-danger">دارای خطا: {preview.errorRows}</span>
            )}
          </div>
          <div className="mb-3 max-h-72 overflow-auto rounded-xl border border-coffee/10">
            <table className="w-full min-w-[600px] text-xs">
              <thead className="sticky top-0 bg-beige">
                <tr>
                  <th className="p-2 text-right">ردیف</th>
                  <th className="p-2 text-right">داده</th>
                  <th className="p-2 text-right">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className="border-t border-coffee/10">
                    <td className="p-2">{r.row}</td>
                    <td className="p-2">
                      {Object.entries(r.data)
                        .filter(([, v]) => v)
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </td>
                    <td className="p-2">
                      {r.errors.length > 0 ? (
                        <span className="text-danger">{r.errors.map((e) => e.message).join("، ")}</span>
                      ) : r.warnings.length > 0 ? (
                        <span className="text-warning">{r.warnings.map((w) => w.message).join("، ")}</span>
                      ) : (
                        <span className="text-olive-600">آماده درج</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-3 text-xs text-muted">
            ردیف‌های دارای خطا در درون‌ریزی نهایی نادیده گرفته می‌شوند؛ ردیف‌های تکراری به‌روزرسانی خواهند شد.
          </p>
          <button onClick={commit} disabled={busy || preview.validRows === 0} className="btn-primary">
            تایید و درون‌ریزی {preview.validRows} ردیف
          </button>
        </div>
      )}

      {report && (
        <div className="card p-5">
          <h2 className="mb-2 text-sm font-semibold">گزارش درون‌ریزی</h2>
          <p className="text-sm text-espresso">
            ایجاد/به‌روزرسانی: <span className="font-bold text-olive-600">{report.created}</span> ·
            نادیده‌گرفته: <span className="font-bold text-danger">{report.skipped}</span>
          </p>
          {report.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-danger">
              {report.errors.slice(0, 10).map((e, i) => (
                <li key={i}>ردیف {e.row}: {e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">تاریخچه درون‌ریزی</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted">تاکنون درون‌ریزی انجام نشده است.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between border-b border-coffee/10 pb-2 last:border-0">
                <span>{KINDS.find((k) => k.value === j.kind)?.label ?? j.kind}</span>
                <span className="text-xs text-muted">
                  {j.status === "COMPLETED" ? "کامل" : "جزئی"} ·{" "}
                  {formatJalaliDateTime(j.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
