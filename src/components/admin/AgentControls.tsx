"use client";
import { formatJalaliDateTime } from "@/lib/jalali";
import { useCallback, useEffect, useRef, useState } from "react";

type Child = { id: string; tool: string; state: string; result: { enabled?: boolean; total?: number } | null; lastError: string | null };
type Run = {
  id: string; state: string; tool: string; input: string; inputHash: string; previous: string | null; expiresAt: string | null;
  traceId: string; result: string | null; lastError?: string | null; attemptCount?: number; parentRunId?: string | null;
  children?: Child[]; events?: { id: string; name: string; state: string }[];
};
type Status = { enabled: boolean; writes: boolean; shadow: boolean; canaryActive: boolean; approvalQueue: number; running: number };
type Lesson = { id: string; topic: string; statement: string; status: string };
const labels: Record<string, string> = { queued: "آماده اجرا", waiting_approval: "منتظر تأیید", paused: "متوقف", running: "در حال اجرا", succeeded: "انجام شد", failed: "ناموفق", cancelled: "لغو شد" };
export function AgentControls() {
  const [question, setQuestion] = useState(""); const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<Run | null>(null); const [answer, setAnswer] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null); const [lessons, setLessons] = useState<Lesson[]>([]);
  const [note, setNote] = useState(""); const [showAll, setShowAll] = useState(false);
  const pending = useRef<{ signature: string; key: string }>();
  async function request(path: string, data?: object) {
    const res = await fetch(`/api/admin/agent/${path}`, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : undefined);
    const json = await res.json(); if (!res.ok) throw new Error(json.error ?? "خطای ارتباط"); return json;
  }
  const refresh = useCallback(async () => {
    const [runsRes, statusRes, lessonsRes] = await Promise.all([fetch("/api/admin/agent/runs"), fetch("/api/admin/agent/status"), fetch("/api/admin/agent/lessons")]);
    const rj = await runsRes.json(); if (!runsRes.ok) throw new Error(rj.error ?? "خطا");
    setRuns(rj.runs);
    if (statusRes.ok) setStatus((await statusRes.json()).status);
    if (lessonsRes.ok) setLessons(((await lessonsRes.json()).lessons as Lesson[]).slice(0, 5));
  }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(""); try { await work(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "خطا"); } finally { setBusy(false); }
  }
  function create(payload: object) {
    void perform(async () => {
      const signature = JSON.stringify(payload);
      if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
      const j = await request("runs", { ...payload, key: pending.current.key });
      setActive(j.run); setAnswer(j.answer); pending.current = undefined;
    });
  }
  function control(action: string, extra?: object) {
    if (!active) return;
    void perform(async () => { const j = await request(`runs/${active.id}`, { action, ...(action === "approve" ? { inputHash: active.inputHash } : {}), ...extra }); setActive(j.run); setAnswer(j.answer); });
  }
  const queue = runs.filter(r => r.state === "waiting_approval");
  const visible = showAll ? runs : runs.filter(r => ["waiting_approval", "queued", "paused", "running", "failed"].includes(r.state));
  return <section className="card mb-6 space-y-4 p-5" aria-label="اجرای عملیات دستیار" dir="rtl">
    <h2 className="text-lg font-semibold">اجرای عملیات دستیار</h2>
    {status && <p className={`rounded p-2 text-xs ${status.enabled ? (status.writes ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800") : "bg-red-50 text-red-800"}`} role="status">
      کلید سراسری: {status.enabled ? "فعال" : "خاموش (kill switch)"} · نوشتن: {status.writes ? "باز" : "بسته"}{status.shadow ? " · حالت سایه: اجرا بدون اثر" : ""}{status.canaryActive ? " · انتشار محدود (canary)" : ""} · صف تأیید: {status.approvalQueue} · در حال اجرا: {status.running}
    </p>}
    <p className="text-sm text-muted">درخواست را بنویسید یا عملیات مشخص انتخاب کنید. تغییر تنظیمات پس از بررسی و تأیید شما اجرا می‌شود.</p>
    <form onSubmit={e => { e.preventDefault(); create({ question }); }} className="flex gap-2">
      <input aria-label="درخواست اجرایی" className="input flex-1" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder="مثلاً وضعیت فعال بودن دستیار را بررسی کن" />
      <button className="btn-primary" disabled={busy || question.trim().length < 2}>بررسی درخواست</button>
    </form>
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={busy} onClick={() => create({ proposal: { tool: "get_ai_status", input: {} } })}>خواندن وضعیت</button>
      <button className="btn-secondary" disabled={busy} onClick={() => create({ proposal: { tool: "search_catalog", input: { query: "قهوه" } } })}>جست‌وجوی کاتالوگ</button>
      <button className="btn-secondary" disabled={busy} onClick={() => create({ proposal: { tool: "list_lessons", input: {} } })}>درس‌های فعال</button>
      {[true, false].map(enabled => <button className="btn-secondary" disabled={busy || status?.shadow} key={String(enabled)} onClick={() => create({ proposal: { tool: "set_ai_enabled", input: { enabled } } })}>{enabled ? "درخواست فعال‌سازی دستیار" : "درخواست غیرفعال‌سازی دستیار"}</button>)}
      <button className="btn-secondary" disabled={busy} onClick={() => void perform(refresh)}>به‌روزرسانی</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error} — در خطای ارتباط، درخواست را دوباره ارسال کنید؛ شناسه تکرار حفظ می‌شود.</p>}
    {queue.length > 0 && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
      <p className="font-semibold">صف تأیید ({queue.length})</p>
      {queue.map(r => <p key={r.id}>{r.tool} — مقدار جدید: {safeParse(r.input).enabled ? "فعال" : "غیرفعال"}</p>)}
    </div>}
    {lessons.length > 0 && <div className="rounded border p-2 text-xs">
      <p className="font-semibold">درس‌های فعال</p>
      <ul className="list-disc pe-4">{lessons.map(l => <li key={l.id}>{l.statement}</li>)}</ul>
    </div>}
    <div className="flex flex-wrap gap-2">{visible.map(run => <button key={run.id} className={`rounded border p-2 text-xs ${run.state === "waiting_approval" ? "border-amber-400" : ""}`} disabled={busy} onClick={() => void perform(async () => { const j = await request(`runs/${run.id}`); setActive(j.run); setAnswer(""); })}>{run.tool} · {labels[run.state] ?? run.state}{run.parentRunId ? " · زیرکار" : ""}</button>)}
      {runs.length > 0 && <button className="rounded border p-2 text-xs underline" onClick={() => setShowAll(v => !v)}>{showAll ? "نمایش فعال‌ها" : "نمایش همه"}</button>}
    </div>
    {active && <div className="space-y-3 rounded border p-3">
      <p>وضعیت: {labels[active.state] ?? active.state}{active.attemptCount ? ` · تلاش‌ها: ${active.attemptCount}` : ""}{active.lastError ? ` · آخرین خطا: ${active.lastError}` : ""}</p>
      <p className="break-all text-xs" dir="ltr">Run: {active.id}<br />Trace: {active.traceId}</p>
      {active.state === "waiting_approval" && <div className="space-y-2">
        <p>عملیات: تغییر فعال بودن دستیار؛ مقدار جدید: {safeParse(active.input).enabled ? "فعال" : "غیرفعال"}؛ مقدار قبل: {safeParse(active.previous).enabled ? "فعال" : "غیرفعال"}</p>
        <p className="text-xs">مهلت تأیید: {active.expiresAt ? formatJalaliDateTime(active.expiresAt) : "—"}. برای برگشت، درخواست معکوس تازه ثبت کنید.</p>
        <button className="btn-primary" disabled={busy} onClick={() => control("approve")}>همین تغییر را تأیید می‌کنم</button>
        <button className="btn-secondary" disabled={busy} onClick={() => control("reject")}>رد درخواست</button>
      </div>}
      {active.state === "queued" && <><button className="btn-primary" disabled={busy} onClick={() => control("execute")}>اجرای عملیات</button><button className="btn-secondary" disabled={busy} onClick={() => control("pause")}>توقف</button></>}
      {active.state === "paused" && <button className="btn-primary" disabled={busy} onClick={() => control("resume")}>ادامه</button>}
      {["queued", "paused", "waiting_approval"].includes(active.state) && <button className="btn-secondary" disabled={busy} onClick={() => control("cancel")}>لغو</button>}
      {["succeeded", "failed", "cancelled"].includes(active.state) && <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" disabled={busy || note.trim().length < 2} onClick={() => void perform(async () => { await request(`runs/${active.id}`, { action: "correct", note }); setNote(""); })}>ثبت اصلاح</button>
        <input aria-label="متن اصلاح" className="input flex-1 text-xs" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="اصلاح شما برای بهبود پاسخ‌های بعدی (اختیاری)" />
      </div>}
      {answer && <p role="status" className="text-sm">{answer}</p>}
      {active.result && <details><summary>رسید و منبع نتیجه</summary><pre dir="ltr" className="overflow-auto text-xs">{JSON.stringify(JSON.parse(active.result), null, 2)}</pre></details>}
      {active.children && active.children.length > 0 && <details><summary>زیرکارها ({active.children.length})</summary>
        <ul className="space-y-1 text-xs" dir="ltr">{active.children.map(c => <li key={c.id} className="rounded border p-1">{c.tool} · {labels[c.state] ?? c.state}{c.lastError ? ` · ${c.lastError}` : ""}{c.result?.total != null ? ` · total=${c.result.total}` : ""}{c.result?.enabled != null ? ` · enabled=${c.result.enabled}` : ""}</li>)}</ul>
      </details>}
      {active.events && <ul className="text-xs" dir="ltr">{active.events.map(e => <li key={e.id}>{e.name} · {e.state}</li>)}</ul>}
    </div>}
  </section>;
}
const safeParse = (raw: string | null | undefined): Record<string, unknown> => { try { return raw ? JSON.parse(raw) : {}; } catch { return {}; } };
