"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Artifact, ChatMessage, Lesson, Run, Session, Skill, Status } from "./workspace-types";
import { AnswerBubble, ApprovalCard, ArtifactList, RunOutput } from "./workspace-panels";
import { TOOL_FA, RUN_STATE_FA, faError, faTime } from "./workspace-ui";
import { JalaliDateInput } from "@/components/ui/JalaliInputs";
import { todayGregorianInput } from "@/lib/jalali";

type Props = {
  aiSettings: { enabled: boolean; provider: string; model: string; hasApiKey: boolean };
  featureFlags: { agentEnabled: boolean; telemetryConfigured: boolean; openobserveUrl: string };
};

export function Workspace({ aiSettings, featureFlags }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [legacySessions, setLegacySessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [settings, setSettings] = useState(aiSettings);
  const [reportDay, setReportDay] = useState(() => todayGregorianInput());
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [legacyView, setLegacyView] = useState<ChatMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`/api/admin/agent/${path}`, { headers: { "Content-Type": "application/json" }, ...init });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = String(j.error ?? `خطا (${res.status})`);
      const err = new Error(faError(raw)) as Error & { code?: string };
      err.code = raw;
      throw err;
    }
    return j as Record<string, unknown>;
  }, []);

  const loadSession = useCallback(async (id: string | null) => {
    if (!id) { setMessages([]); setRuns([]); setArtifacts([]); setActiveRun(null); return; }
    const [chat, runList, artList] = await Promise.all([
      api(`sessions/${id}?take=60`),
      api(`runs?sessionId=${id}`),
      api(`artifacts?sessionId=${id}`),
    ]);
    setMessages((chat.messages ?? []) as ChatMessage[]);
    setRuns((runList.runs ?? []) as Run[]);
    setArtifacts((artList.artifacts ?? []) as Artifact[]);
  }, [api]);

  const refreshSessions = useCallback(async () => {
    const mine = await api("sessions").catch(() => ({ sessions: [] }));
    setSessions((mine.sessions ?? []) as Session[]);
    const archive = await fetch("/api/admin/ai/chats/legacy").then(r => (r.ok ? r.json() : { sessions: [] })).catch(() => ({ sessions: [] }));
    setLegacySessions((archive.sessions ?? []) as Session[]);
  }, [api]);

  const refreshAll = useCallback(async () => {
    const [st, sk, ls] = await Promise.all([
      fetch("/api/admin/agent/status").then(r => (r.ok ? r.json() : null)).catch(() => null),
      api("skills").catch(() => ({ skills: [] })),
      api("lessons?drafts=1").catch(() => ({ lessons: [] })),
    ]);
    setStatus(st?.status ?? null);
    setSkills((sk.skills ?? []) as Skill[]);
    setLessons((ls.lessons ?? []) as Lesson[]);
  }, [api]);

  const openSession = useCallback(async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setLegacyView(null);
    setActiveRun(null);
    try { await loadSession(id); } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }, [loadSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSessions();
        await refreshAll();
        const first = ((await api("sessions").catch(() => ({ sessions: [] }))).sessions as Session[] | undefined)?.[0];
        if (!cancelled && first) await openSession(first.id);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "خطا"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [api, refreshSessions, refreshAll, openSession]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, pending]);

  /* SSE with durable cursor + auto-reconnect (R03). Events are scoped to the
   * caller server-side; a run from another conversation never leaks here. */
  useEffect(() => {
    if (!featureFlags.agentEnabled) return;
    let es: EventSource | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (stopped) return;
      const q = cursorRef.current ? `?cursor=${encodeURIComponent(cursorRef.current)}` : "";
      es = new EventSource(`/api/admin/agent/events${q}`);
      es.addEventListener("events", ev => {
        const data = JSON.parse((ev as MessageEvent).data) as { events: { id: string; runId: string; name: string }[]; cursor: string };
        if (data.cursor) cursorRef.current = data.cursor;
        if (data.events?.length) {
          void loadSession(activeIdRef.current).catch(() => undefined);
          void refreshAll().catch(() => undefined);
          void refreshSessions().catch(() => undefined);
        }
      });
      es.addEventListener("close", () => { es?.close(); timer = setTimeout(connect, 1200); });
      es.onerror = () => { es?.close(); timer = setTimeout(connect, 2000); };
    };
    connect();
    return () => { stopped = true; if (timer) clearTimeout(timer); es?.close(); };
  }, [featureFlags.agentEnabled, loadSession, refreshAll, refreshSessions]);

  /* ── actions ─────────────────────────────────────────────────────────── */
  async function createSession() {
    const j = await api("sessions", { method: "POST", body: JSON.stringify({}) });
    await refreshSessions();
    await openSession((j.session as { id: string }).id);
  }
  async function renameSession(id: string) {
    await api(`sessions/${id}`, { method: "PATCH", body: JSON.stringify({ title: editTitle }) });
    setEditing(null);
    await refreshSessions();
  }
  async function archiveSession(id: string) {
    await api(`sessions/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    if (id === activeId) await loadSession(null);
    await refreshSessions();
  }
  async function send() {
    const q = input.trim();
    if (!q || pending) return;
    const key = crypto.randomUUID();
    setPending(true);
    setError("");
    setInput("");
    setMessages(m => [...m, { id: `tmp-${key}`, role: "user", content: q, createdAt: new Date().toISOString() }]);
    try {
      const j = await api("runs", { method: "POST", body: JSON.stringify({
        key, question: q,
        ...(activeId ? { sessionId: activeId } : {}),
        ...(attachments.length ? { attachmentIds: attachments.map(a => a.id) } : {}),
      }) });
      setAttachments([]);
      const sid = (j.run as Run | undefined)?.sessionId ?? activeId;
      if (!activeId && sid) setActiveId(sid);
      await refreshAll();
      await refreshSessions();
      if (sid) await loadSession(sid);
    } catch (e) {
      const err = e as Error & { code?: string };
      const code = err.code ?? err.message;
      // A declined business request must stay explicit. Otherwise a generic
      // completion can pretend to have done an unsupported action.
      const greeting = /^(سلام(?: علیکم)?|درود|صبح بخیر|عصر بخیر|شب بخیر|ممنون|مرسی|متشکرم|hello|hi|thanks)[\s!؟?.،]*$/i.test(q);
      if (code === "PLAN_UNSUPPORTED" && greeting && !attachments.length) {
        try {
          const res = await fetch("/api/admin/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, ...(activeId ? { sessionId: activeId } : {}) }) });
          const j = await res.json();
          if (!res.ok) throw new Error(faError(String(j.error ?? "خطا")));
          const sid = (j.sessionId as string | undefined) ?? activeId;
          if (!activeId && sid) setActiveId(sid);
          await refreshSessions();
          await loadSession(sid);
          return;
        } catch (e2) { setError(e2 instanceof Error ? e2.message : "خطا"); }
      } else {
        setError(faError(code));
      }
      setMessages(m => m.filter(x => x.id !== `tmp-${key}`));
    } finally { setPending(false); }
  }
  async function control(action: string, run?: Run, extra?: Record<string, unknown>) {
    const target = run ?? activeRun;
    if (!target) return;
    setError("");
    try {
      const j = await api(`runs/${target.id}`, { method: "POST", body: JSON.stringify({ action, ...(action === "approve" ? { inputHash: target.inputHash } : {}), ...extra }) });
      setActiveRun((j.run ?? null) as Run | null);
      await refreshAll();
      await loadSession(activeId);
    } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function openRun(id: string) {
    const j = await api(`runs/${id}`);
    setActiveRun(j.run as Run);
    setPanelOpen(true);
  }
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/agent/files", { method: "POST", body: form });
      const j = await res.json();
      if (!res.ok) throw new Error(faError(String(j.error ?? "خطا")));
      setAttachments(a => [...a, { id: j.artifact.id as string, filename: j.artifact.filename as string }]);
    } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
    finally { setUploading(false); }
  }
  async function generateReport(kind: "sales_report_csv" | "sales_report_xlsx" | "sales_chart_svg") {
    setError("");
    try {
      const res = await fetch("/api/admin/agent/artifacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, day: reportDay, ...(activeId ? { sessionId: activeId } : {}) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(faError(String(j.error ?? "خطا")));
      if (activeId) await loadSession(activeId);
    } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function toggleAiEnabled(enabled: boolean) {
    const res = await fetch("/api/admin/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    if (res.ok) setSettings((await res.json()).settings);
    else setError("خطا در تغییر تنظیمات دستیار تحلیلی");
  }
  async function lessonAction(id: string, action: string) {
    setError("");
    try { await api(`lessons/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await refreshAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function skillAction(id: string, action: string) {
    setError("");
    try { await api(`skills/${id}`, { method: "POST", body: JSON.stringify({ action }) }); await refreshAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function rollbackSkill(slug: string) {
    setError("");
    try { await api("skills/rollback", { method: "POST", body: JSON.stringify({ slug }) }); await refreshAll(); }
    catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function runSkill(slug: string) {
    setError("");
    try {
      const j = await api("skills/run", { method: "POST", body: JSON.stringify({ slug }) });
      setActiveRun(j.run as Run);
      setPanelOpen(true);
      await refreshAll();
    } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
  }
  async function openLegacy(id: string) {
    const j = await fetch(`/api/admin/ai/chats/${id}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setLegacyView(((j?.session?.messages ?? []) as ChatMessage[]));
    setActiveId(null);
  }

  const approvalRun = runs.find(r => r.state === "waiting_approval" && !r.parentRunId) ?? null;
  const visibleRuns = runs.filter(r => ["waiting_approval", "queued", "paused", "running"].includes(r.state) && !r.parentRunId);

  return (
    <div>
      <h1 className="heading-section mb-1">فضای کاری دستیار</h1>
      <p className="mb-4 text-sm text-muted">گفتگو، اجرای کارهای چندمرحله‌ای، تأیید تغییرات کسب‌وکار، فایل‌ها و گزارش‌ها — همه در یک‌جا.</p>

      {status !== null && (
        <p role="status" className={`mb-3 rounded-lg p-2 text-xs ${status.enabled ? (status.writes ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300") : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"}`}>
          موتور اجرا: {status.enabled ? "فعال" : "خاموش (kill switch)"} · تغییرات کسب‌وکار: {status.writes ? "باز" : "بسته"}
          {status.shadow ? " · حالت سایه" : ""} · صف تأیید: {status.approvalQueue} · در حال اجرا: {status.running}
        </p>
      )}
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error} <button type="button" className="underline" onClick={() => setError("")}>بستن</button></p>}

      <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)_260px]">
        <aside className={`card flex max-h-[640px] flex-col overflow-hidden p-3 max-xl:fixed max-xl:top-[calc(env(safe-area-inset-top)+0.5rem)] max-xl:bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] max-xl:right-2 max-xl:z-40 max-xl:w-72 ${sidebarOpen ? "" : "max-xl:hidden"}`} aria-label="گفتگوها">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-espresso dark:text-dark-text">گفتگوها</h2>
            <button type="button" onClick={() => void (async () => {
              const j = await api("sessions", { method: "POST", body: JSON.stringify({}) });
              await refreshSessions();
              await openSession((j.session as { id: string }).id);
            })()} className="rounded-lg bg-olive px-2 py-1 text-xs font-medium text-cream hover:bg-olive-600 dark:hover:bg-olive-600" aria-label="گفتگوی جدید">+ جدید</button>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto">
            {sessions.length === 0 && <li className="px-2 py-4 text-center text-xs text-muted dark:text-dark-textSecondary">گفتگویی ندارید.</li>}
            {sessions.map(s => (
              <li key={s.id} className="group relative">
                {editing === s.id ? (
                  <div className="flex gap-1 p-1">
                    <input className="input text-xs" value={editTitle} onChange={e => setEditTitle(e.target.value)} aria-label="عنوان گفتگو" autoFocus onKeyDown={e => { if (e.key === "Enter") void renameSession(s.id); if (e.key === "Escape") setEditing(null); }} />
                    <button type="button" className={`rounded bg-olive px-2 text-xs text-cream`} onClick={() => void renameSession(s.id)} aria-label="ذخیره نام">✓</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => void openSession(s.id)} className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${activeId === s.id ? "bg-olive/10 text-olive-700 dark:bg-olive/20 dark:text-olive-300" : "hover:bg-beige dark:hover:bg-dark-surfaceHover"}`}>
                    <span className="block truncate text-xs font-medium text-espresso dark:text-dark-text">{s.title}</span>
                    <span className="block text-[10px] text-muted dark:text-dark-textSecondary">{s.messageCount} پیام · {faTime(s.updatedAt)}</span>
                  </button>
                )}
                <span className="absolute left-2 top-2 hidden gap-1 group-hover:flex">
                  <button type="button" aria-label={`تغییر نام ${s.title}`} onClick={() => { setEditing(s.id); setEditTitle(s.title); }} className="rounded-full bg-beige px-1.5 text-[10px] dark:bg-dark-surfaceHover">✎</button>
                  <button type="button" aria-label={`بایگانی ${s.title}`} onClick={() => void archiveSession(s.id)} className="rounded-full bg-beige px-1.5 text-[10px] dark:bg-dark-surfaceHover">📥</button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-1 rounded border p-1 text-[11px] text-muted hover:bg-beige dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover xl:hidden" onClick={() => setSidebarOpen(false)}>بستن فهرست</button>
        </aside>

        <section className="card flex min-h-[520px] flex-col overflow-hidden" aria-label="گفتگو">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted dark:text-dark-textSecondary">در حال بارگذاری…</p>
            ) : legacyView ? (
<div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-900/30">
                  <p className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300">آرشیو قدیمی — فقط‌خواندنی</p>
                {legacyView.map(m => (
                  <div key={m.id} className={`mb-1 max-w-[85%] rounded-2xl px-3 py-2 text-xs ${m.role === "user" ? "ms-auto bg-olive/80 text-cream" : "me-auto border border-coffee/10 bg-cream dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"}`}>{m.content}</div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                <span aria-hidden="true" className="text-3xl">☕</span>
                <p className="text-sm font-medium text-espresso dark:text-dark-text">{activeId ? "گفتگو خالی است" : "یک گفتگو شروع کنید"}</p>
                <p className="max-w-md text-xs leading-relaxed text-muted dark:text-dark-textSecondary">سؤال بپرسید (فروش، انبار، سفارش‌ها)، کار چندمرحله‌ای بدهید یا فایل بارگذاری کنید. تغییرات کسب‌وکار فقط با کارت تأیید شما اجرا می‌شود.</p>
                {!activeId && <button type="button" className="btn-primary text-sm" onClick={() => void (async () => {
                  const j = await api("sessions", { method: "POST", body: JSON.stringify({}) });
                  await refreshSessions();
                  await openSession((j.session as { id: string }).id);
                })()}>شروع گفتگو</button>}
              </div>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-olive text-cream" : "border border-coffee/10 bg-cream text-espresso dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"}`}>
                    {m.role === "user" ? m.content : <AnswerBubble text={m.content} />}
                  </div>
                </div>
              ))
            )}
            {pending && (
              <div className="flex justify-end" role="status">
                <div className="rounded-2xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm text-muted dark:border-dark-border dark:bg-dark-surface dark:text-dark-textSecondary">در حال بررسی درخواست و ساخت برنامه…</div>
              </div>
            )}
          </div>

          {visibleRuns.length > 0 && (
            <div className="mx-3 mb-2 flex flex-wrap gap-2">
              {visibleRuns.map(r => (
                <button key={r.id} type="button" className={`rounded-full border px-3 py-1 text-xs ${r.state === "waiting_approval" ? "border-amber-400 bg-amber-50 dark:bg-amber-900/30" : "border-coffee/20 bg-cream dark:border-dark-border dark:bg-dark-surface dark:hover:bg-dark-surfaceHover"}`} onClick={() => void openRun(r.id)}>
                  <span className={`me-1 inline-block h-1.5 w-1.5 rounded-full ${r.state === "running" ? "animate-pulse bg-olive" : r.state === "waiting_approval" ? "bg-amber-500" : "bg-coffee/30"}`} aria-hidden="true" />
                  {TOOL_FA[r.tool] ?? r.tool} · {RUN_STATE_FA[r.state] ?? r.state}
                </button>
              ))}
            </div>
          )}

          {approvalRun && <ApprovalCard run={approvalRun} onApprove={() => void control("approve", approvalRun)} onReject={() => void control("reject", approvalRun)} />}

          <form onSubmit={e => { e.preventDefault(); void send(); }} className="border-t border-coffee/10 bg-cream-50 p-3 dark:border-dark-border dark:bg-dark-surface">
            {attachments.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-1">
                {attachments.map(a => (
                  <li key={a.id} className="rounded-full bg-beige px-2 py-0.5 text-[11px] dark:bg-dark-surfaceHover">
                    {a.filename}
                    <button type="button" aria-label={`حذف پیوست ${a.filename}`} onClick={() => setAttachments(x => x.filter(y => y.id !== a.id))}> ✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <label className="btn-secondary cursor-pointer text-xs" aria-label="بارگذاری فایل پیوست">
                {uploading ? "…" : "📎"}
                <input type="file" accept=".csv,.xlsx,.txt,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
              </label>
              <textarea
                className="input min-h-[44px] flex-1 resize-none"
                rows={1}
                placeholder={featureFlags.agentEnabled ? "سؤال یا درخواست خود را بنویسید… (Enter ارسال)" : "موتور اجرا خاموش است"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
                aria-label="متن پیام"
                maxLength={1000}
              />
              <button type="submit" className="btn-primary" disabled={pending || !input.trim() || !featureFlags.agentEnabled} aria-label="ارسال">ارسال</button>
            </div>
          </form>
        </section>

        <section className={`card flex max-h-[640px] flex-col overflow-hidden p-3 max-xl:fixed max-xl:top-[calc(env(safe-area-inset-top)+0.5rem)] max-xl:bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] max-xl:left-2 max-xl:z-40 max-xl:w-80 max-xl:max-w-[calc(100%-1rem)] ${panelOpen ? "" : "max-xl:hidden"}`} aria-label="پنل خروجی و پیش‌نمایش">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-espresso dark:text-dark-text">خروجی و پیش‌نمایش</h2>
            <button type="button" className="text-xs text-muted dark:text-dark-textSecondary underline" onClick={() => setPanelOpen(false)}>بستن</button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto pe-1">
            {activeRun ? (
              <>
                <RunOutput run={activeRun} artifacts={artifacts} />
                {["succeeded", "failed", "cancelled"].includes(activeRun.state) && <CorrectionBox onCorrect={note => control("correct", activeRun, { note })} />}
<details className="rounded border border-coffee/15 p-2 text-[11px] dark:border-dark-border">
                  <summary className="cursor-pointer text-muted dark:text-dark-textSecondary">شناسه‌ها و جزئیات فنی</summary>
                  <p dir="ltr" className="break-all">Run: {activeRun.id}<br />Trace: {activeRun.traceId}<br />Model: {activeRun.modelId ?? "—"}<br />Prompt: {activeRun.promptVersion ?? "—"}<br />Skill: {activeRun.skillVersion ?? "—"}</p>
                  {activeRun.events && <ul dir="ltr" className="mt-1">{activeRun.events.map(e => <li key={e.id}>{e.name} · {e.state}</li>)}</ul>}
                </details>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted dark:text-dark-textSecondary">گزارش‌های آماده (مبنا: سفارش‌های تکمیل‌شده، Asia/Tehran):</p>
                <div className="flex flex-wrap items-center gap-2">
                  <JalaliDateInput value={reportDay} onChange={setReportDay} ariaLabel="روز گزارش" />
                  <button type="button" className="btn-secondary text-xs" onClick={() => void generateReport("sales_report_csv")}>CSV</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => void generateReport("sales_report_xlsx")}>اکسل</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => void generateReport("sales_chart_svg")}>نمودار</button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted dark:text-dark-textSecondary">این عدد جمع ارزش سفارش‌های تکمیل‌شده است؛ وصولی نقدی یا سود نیست.</p>
                <ArtifactList artifacts={artifacts} />
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-2 flex gap-2 xl:hidden">
        <button type="button" className="btn-secondary text-xs" onClick={() => setSidebarOpen(true)} aria-expanded={sidebarOpen}>گفتگوها</button>
        <button type="button" className="btn-secondary text-xs" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen}>پنل خروجی</button>
      </div>

      <div className="mt-4">
        <button type="button" className="btn-secondary text-xs" onClick={() => setManageOpen(v => !v)} aria-expanded={manageOpen}>
          {manageOpen ? "بستن تنظیمات و مدیریت" : "تنظیمات، درس‌ها و اسکیل‌ها"}
        </button>
        {manageOpen && (
          <div className="card mt-2 space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coffee/10 p-3 dark:border-dark-border">
              <div className="text-xs">
                <p className="font-semibold text-espresso dark:text-dark-text">سرویس مدل: {settings.provider} · مدل: {settings.model}</p>
                <p className="text-muted dark:text-dark-textSecondary">{settings.hasApiKey ? "کلید API از متغیر محیطی خوانده می‌شود (سمت سرور)." : "کلید API تنظیم نشده (ZHIPU_API_KEY)."}</p>
              </div>
              <button type="button" role="switch" aria-checked={settings.enabled} onClick={() => void toggleAiEnabled(!settings.enabled)} className={`rounded-full border px-3 py-1 text-xs ${settings.enabled ? "border-olive bg-olive text-cream" : "border-coffee/20 bg-beige dark:border-coffee/30 dark:bg-dark-surfaceHover"}`}>
                دستیار تحلیلی: {settings.enabled ? "روشن" : "خاموش"}
              </button>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-espresso dark:text-dark-text">درس‌ها (پیشنهادها و فعال‌سازی)</h3>
              {lessons.length === 0 && <p className="text-xs text-muted dark:text-dark-textSecondary">درسی ثبت نشده است.</p>}
              <ul className="space-y-2">
                {lessons.map(l => (
                  <li key={l.id} className="rounded border border-coffee/10 p-2 text-xs dark:border-dark-border">
                    <p><span className="rounded-full bg-beige px-2 py-0.5 text-[10px] dark:bg-dark-surfaceHover">{l.status === "draft" ? "پیش‌نویس" : l.status === "active" ? "فعال" : l.status}</span> <strong>{l.topic}</strong></p>
                    <p className="mt-1">{l.statement}</p>
                    {l.evidence?.length > 0 && <p className="mt-1 text-muted dark:text-dark-textSecondary" dir="ltr">evidence: {l.evidence.map(e => e.id.slice(0, 8)).join(", ")}</p>}
                    <div className="mt-1 flex gap-2">
                      {l.status === "draft" && <>
                        <button type="button" className="btn-primary text-[11px]" onClick={() => void lessonAction(l.id, "activate")}>فعال‌سازی</button>
                        <button type="button" className="btn-secondary text-[11px]" onClick={() => void lessonAction(l.id, "reject")}>رد</button>
                      </>}
                      {l.status === "active" && <button type="button" className="text-[11px] text-danger underline" onClick={() => void lessonAction(l.id, "expire")}>انقضا</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-espresso dark:text-dark-text">اسکیل‌ها (نسخه‌ها، آزمون، فعال‌سازی، بازگشت)</h3>
              {skills.length === 0 && <p className="text-xs text-muted dark:text-dark-textSecondary">اسکیلی ثبت نشده است.</p>}
              <ul className="space-y-2">
                {skills.map(s => {
                  const unevaluable = s.testResult?.evaluated === false;
                  return (
                    <li key={s.id} className="rounded border border-coffee/10 p-2 text-xs dark:border-dark-border">
                      <p><strong dir="ltr">{s.slug}</strong> <span dir="ltr" className="text-muted">v{s.version}</span> · {s.status === "draft" ? "پیش‌نویس" : s.status === "active" ? "فعال" : "بازنشسته"}
                        {unevaluable && <span className="ms-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">معیار ارزیابی‌ناپذیر — تأییدنشده</span>}
                      </p>
                      <p className="mt-1 text-muted">{s.definition?.description}</p>
                      {s.testResult && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted">نتیجه آزمون: {s.testResult.passed ? "قبول" : "مردود"}</summary>
                          <pre dir="ltr" className="mt-1 max-h-40 overflow-auto rounded bg-beige p-1 text-[10px] dark:bg-dark-surfaceHover">{JSON.stringify(s.testResult, null, 1)}</pre>
                        </details>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary text-[11px]" onClick={() => void skillAction(s.id, "test")}>آزمون</button>
                        {s.status === "draft" && <button type="button" className="btn-secondary text-[11px]" onClick={() => void skillAction(s.id, "activate")}>فعال‌سازی</button>}
                        {s.status === "active" && <button type="button" className="btn-secondary text-[11px]" onClick={() => void skillAction(s.id, "deactivate")}>غیرفعال‌سازی</button>}
                        {s.status === "retired" && <button type="button" className="btn-secondary text-[11px]" onClick={() => void (async () => {
                          setError("");
                          try { await api("skills/rollback", { method: "POST", body: JSON.stringify({ slug: s.slug }) }); await refreshAll(); } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
                        })()}>بازگشت به این نسخه</button>}
                        <button type="button" className="btn-secondary text-[11px]" disabled={s.status !== "active" || !featureFlags.agentEnabled} onClick={() => void (async () => {
                          setError("");
                          try { const j = await api("skills/run", { method: "POST", body: JSON.stringify({ slug: s.slug }) }); setActiveRun(j.run as Run); setPanelOpen(true); await refreshAll(); } catch (e) { setError(e instanceof Error ? e.message : "خطا"); }
                        })()}>اجرا</button>
                        <details className="w-full"><summary className="cursor-pointer text-muted dark:text-dark-textSecondary">تعریف نسخه</summary><pre dir="ltr" className="max-h-40 overflow-auto text-[10px]">{JSON.stringify(s.definition, null, 1)}</pre></details>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <details className="rounded border border-coffee/15 p-2 text-[11px] dark:border-dark-border">
              <summary className="cursor-pointer text-muted dark:text-dark-textSecondary">وضعیت پیکربندی (server-side)</summary>
              <ul className="mt-1 space-y-0.5">
                <li>موتور اجرا: {featureFlags.agentEnabled ? "فعال" : "غیرفعال (AGENT_ENABLED=false)"}</li>
                <li>نسخه پرامپت: {status?.promptVersion ?? "—"}</li>
                <li>Telemetry: {featureFlags.telemetryConfigured ? "متصل به OpenObserve" : "پیکربندی نشده"}</li>
                {featureFlags.openobserveUrl && <li><a href={featureFlags.openobserveUrl} target="_blank" rel="noreferrer" className="underline">داشبورد OpenObserve</a></li>}
              </ul>
            </details>
          </div>
        )}

        {legacySessions.length > 0 && (
          <details className="card mt-4 p-3">
            <summary className="cursor-pointer text-xs text-muted dark:text-dark-textSecondary">آرشیو گفتگوهای قدیمی (نسخه قبل — فقط‌خواندنی، {legacySessions.length} گفتگو)</summary>
            <ul className="mt-2 space-y-1">
              {legacySessions.map(s => (
                <li key={s.id} className="flex items-center justify-between rounded border border-coffee/10 px-2 py-1 text-xs dark:border-dark-border">
                  <button type="button" className="underline text-espresso dark:text-dark-text" onClick={() => void openLegacy(s.id)}>👁 {s.title} <span className="text-muted dark:text-dark-textSecondary">({s.messageCount} پیام)</span></button>
                  <span className="text-[10px] text-amber-700 dark:text-amber-300">فقط‌خواندنی</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function CorrectionBox({ onCorrect }: { onCorrect: (note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-coffee/15 p-2">
      <input className="input flex-1 text-xs" value={note} onChange={e => setNote(e.target.value)} maxLength={500} aria-label="متن اصلاح" placeholder="اصلاح شما برای بهبود پاسخ‌های بعدی (اختیاری)" />
      <button type="button" className="btn-secondary text-xs" disabled={note.trim().length < 2} onClick={() => { void onCorrect(note).then(() => setNote("")); }}>ثبت اصلاح</button>
    </div>
  );
}
