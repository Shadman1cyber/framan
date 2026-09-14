"use client";

/* Approval + output panels of the workspace (R01/R05/R06). */

import type { Artifact, Run } from "./workspace-types";
import { ARTIFACT_FA, ORDER_STATUS_FA, RUN_STATE_FA, TOOL_FA, faTime, safeJson, Markdown } from "./workspace-ui";

export function ApprovalCard({ run, onApprove, onReject }: { run: Run; onApprove: () => void; onReject: () => void }) {
  const input = safeJson(run.input);
  const before = safeJson(run.previous);
  const tool = run.tool;
  let target = "";
  let beforeText = "";
  let afterText = "";
  if (tool === "change_order_status") {
    target = `سفارش ${String(input.orderId ?? "").slice(0, 8)}…`;
    beforeText = ORDER_STATUS_FA[String(before.status)] ?? String(before.status ?? "—");
    afterText = ORDER_STATUS_FA[String(input.status)] ?? String(input.status);
  } else if (tool === "update_price") {
    target = input.coffeeLineId ? `خط قهوه محصول ${String(input.productId ?? "").slice(0, 8)}…` : `محصول ${String(input.productId ?? "").slice(0, 8)}…`;
    beforeText = `${before.price ?? "—"} تومان`;
    afterText = `${String(input.price ?? "—")} تومان`;
  } else if (tool === "adjust_inventory") {
    target = `ماده اولیه ${String(input.ingredientId ?? "").slice(0, 8)}…`;
    beforeText = `${before.quantity ?? "—"} ${before.unit ?? ""}`;
    afterText = `${Number(before.quantity ?? 0) + Number(input.delta ?? 0)} ${before.unit ?? ""}`;
  } else {
    target = "فعال بودن دستیار";
    beforeText = before.enabled ? "روشن" : "خاموش";
    afterText = input.enabled ? "روشن" : "خاموش";
  }
  return (
    <div role="dialog" aria-label="کارت تأیید تغییر کسب‌وکار" className="mx-3 mb-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
      <p className="mb-1 text-sm font-bold text-espresso">تأیید تغییر کسب‌وکار لازم است</p>
      <table className="mb-2 w-full text-xs">
        <tbody>
          <tr><td className="w-24 py-0.5 text-muted">عملیات</td><td className="py-0.5">{TOOL_FA[tool] ?? tool}</td></tr>
          <tr><td className="py-0.5 text-muted">هدف</td><td className="py-0.5">{target}</td></tr>
          <tr><td className="py-0.5 text-muted">مقدار قبل</td><td className="py-0.5">{beforeText}</td></tr>
          <tr><td className="py-0.5 text-muted">مقدار بعد</td><td className="py-0.5">{afterText}</td></tr>
          {typeof input.reason === "string" && <tr><td className="py-0.5 text-muted">دلیل</td><td className="py-0.5">{input.reason}</td></tr>}
          <tr><td className="py-0.5 text-muted">مهلت تأیید</td><td className="py-0.5">{run.expiresAt ? faTime(run.expiresAt) : "—"}</td></tr>
        </tbody>
      </table>
      <div className="flex gap-2">
        <button type="button" className="btn-primary text-xs" onClick={onApprove}>تأیید و اجرا</button>
        <button type="button" className="btn-secondary text-xs" onClick={onReject}>رد</button>
      </div>
    </div>
  );
}

export function RunOutput({ run, artifacts }: { run: Run; artifacts: Artifact[] }) {
  const result = run.result ? (JSON.parse(run.result) as { steps?: { tool: string; result: unknown }[]; final?: unknown }) : null;
  return (
    <div className="space-y-2">
      <p className="text-xs">
        <strong>{TOOL_FA[run.tool] ?? run.tool}</strong> — {RUN_STATE_FA[run.state] ?? run.state}
        {run.attemptCount ? ` · تلاش‌ها: ${run.attemptCount}` : ""}
        {run.lastError ? ` · خطا: ${run.lastError}` : ""}
      </p>
      {run.state === "waiting_approval" && <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-800">با کارت تأیید در گفتگو، این تغییر را تأیید یا رد کنید. مهلت: {run.expiresAt ? faTime(run.expiresAt) : "—"}</p>}
      {result && Array.isArray(result.steps) && <p className="text-[11px] text-muted">برنامه {result.steps.length} مرحله‌ای اجرا و هر گام بررسی شد.</p>}
      {run.steps && run.steps.length > 0 && (
        <ul className="space-y-1">
          {run.steps.map(s => (
            <li key={s.idx} className="rounded border border-coffee/10 p-1.5 text-[11px]">
              <span className="font-semibold">{TOOL_FA[s.tool] ?? s.tool}</span> · {RUN_STATE_FA[s.state] ?? s.state}
              {s.error && <span className="text-danger"> · {s.error}</span>}
              {s.result != null && (
                <details className="mt-0.5">
                  <summary className="cursor-pointer text-muted">نتیجه گام</summary>
                  <pre dir="ltr" className="mt-0.5 max-h-32 overflow-auto rounded bg-beige p-1 text-[10px]">{JSON.stringify(s.result, null, 1)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {run.result && (
        <details>
          <summary className="cursor-pointer text-[11px] text-muted">رسید و منبع نتیجه</summary>
          <pre dir="ltr" className="mt-1 max-h-48 overflow-auto rounded bg-beige p-1 text-[10px]">{JSON.stringify(result, null, 1)}</pre>
        </details>
      )}
      {run.children && run.children.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] text-muted">زیرکارها ({run.children.length})</summary>
          <ul dir="ltr" className="mt-1 space-y-1 text-[10px]">
            {run.children.map(c => <li key={c.id} className="rounded border p-1">{c.tool} · {c.state}{c.lastError ? ` · ${c.lastError}` : ""}</li>)}
          </ul>
        </details>
      )}
      <ArtifactList artifacts={artifacts.filter(a => a.runId === run.id)} />
    </div>
  );
}

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (!artifacts.length) return <p className="text-[11px] text-muted">فایل یا گزارشی ثبت نشده است.</p>;
  return (
    <ul className="space-y-2">
      {artifacts.map(a => (
        <li key={a.id} className="rounded border border-coffee/10 p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span>{ARTIFACT_FA[a.kind] ?? a.kind}: {a.filename}</span>
            <a className="underline" href={`/api/admin/agent/artifacts/${a.id}`} aria-label={`دانلود ${a.filename}`}>دانلود</a>
          </div>
          {a.meta?.preview?.rows && (
            <div className="mt-1 overflow-auto">
              <table className="w-full text-right text-[10px]">
                <tbody>
                  {a.meta.preview.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>{row.slice(0, 4).map((c, ci) => <td key={ci} className="border-b border-coffee/5 px-1 py-0.5">{String(c)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated SVG artifact, not optimizable by next/image */}
          {a.mimeType === "image/svg+xml" && <img className="mt-1 w-full rounded border border-coffee/10" src={`/api/admin/agent/artifacts/${a.id}`} alt={`نمودار ${a.filename}`} />}
          {a.meta?.preview?.note && <p className="mt-1 text-[10px] text-muted">{a.meta.preview.note}</p>}
          <p className="mt-1 text-[10px] text-muted">{faTime(a.createdAt)} · {a.sizeBytes} بایت</p>
        </li>
      ))}
    </ul>
  );
}

export function AnswerBubble({ text }: { text: string }) {
  return <Markdown text={text} />;
}