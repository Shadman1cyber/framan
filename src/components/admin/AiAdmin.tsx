"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Settings = { enabled: boolean; provider: string; model: string; hasApiKey: boolean };
type Insight = { id: string; kind: string; severity: string; title: string; body: string; createdAt: string };
type ChatMessage = { id: string; role: string; content: string; createdAt?: string };
type ChatSession = {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
};

const KIND_LABELS: Record<string, string> = {
  INVENTORY: "انبار",
  FINANCE: "مالی",
  OPERATION: "عملیات",
  GENERAL: "عمومی",
};

export function AiAdmin({
  initialSettings,
  initialInsights,
  initialSessions,
}: {
  initialSettings: Settings;
  initialInsights: Insight[];
  initialSessions: ChatSession[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [insights, setInsights] = useState(initialInsights);
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { show } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to the bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/admin/ai/chats/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      setActiveSessionId(j.session.id);
      setMessages(j.session.messages);
    } catch (e) {
      show(e instanceof Error ? e.message : "خطا", "error");
    } finally {
      setLoadingSession(false);
    }
  }, [show]);

  async function refreshSessions() {
    const res = await fetch("/api/admin/ai/chats");
    if (!res.ok) return;
    const j = await res.json();
    setSessions(j.sessions ?? []);
  }

  function newChat() {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
  }

  async function deleteSession(id: string) {
    const res = await fetch(`/api/admin/ai/chats/${id}`, { method: "DELETE" });
    if (!res.ok) {
      show("خطا در حذف گفتگو", "error");
      return;
    }
    setSessions((s) => s.filter((x) => x.id !== id));
    if (activeSessionId === id) newChat();
    show("گفتگو حذف شد", "success");
  }

  async function toggleEnabled(enabled: boolean) {
    const res = await fetch("/api/admin/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      const j = await res.json();
      setSettings(j.settings);
      show(enabled ? "دستیار هوشمند فعال شد" : "دستیار هوشمند غیرفعال شد", "success");
    } else show("خطا", "error");
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || asking) return;
    setAsking(true);
    setInput("");
    // Optimistically show the user's question.
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: q }]);
    try {
      const res = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, sessionId: activeSessionId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      setMessages((m) => [
        ...m.filter((x) => !x.id.startsWith("tmp-") || x.content !== q),
        { id: `u-${Date.now()}`, role: "user", content: q },
        { id: `a-${Date.now()}`, role: "assistant", content: j.answer },
      ]);
      setActiveSessionId(j.sessionId);
      refreshSessions();
    } catch (err) {
      // Remove the optimistic message on failure.
      setMessages((m) => m.filter((x) => !(x.id.startsWith("tmp-") && x.content === q)));
      show(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setAsking(false);
    }
  }

  async function refreshInsights() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/ai/insights", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "خطا");
      const list = await fetch("/api/admin/ai/insights");
      const lj = await list.json();
      setInsights(lj.insights ?? []);
      show("هشدارها به‌روزرسانی شد", "success");
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا", "error");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Enable/disable switch */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-espresso dark:text-dark-text">وضعیت دستیار هوشمند</h2>
          <p className="mt-1 text-xs text-muted dark:text-dark-textSecondary">
            سرویس: {settings.provider} · مدل: {settings.model}
            <br />
            {settings.hasApiKey
              ? "کلید API از متغیر محیطی ZHIPU_API_KEY خوانده می‌شود (سمت سرور)."
              : "⚠ کلید API تنظیم نشده — ZHIPU_API_KEY را در فایل .env قرار دهید."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleEnabled(!settings.enabled)}
          role="switch"
          aria-checked={settings.enabled}
          aria-label={settings.enabled ? "دستیار هوشمند روشن" : "دستیار هوشمند خاموش"}
          className={`relative inline-flex h-10 w-24 items-center overflow-hidden rounded-full border transition-colors ${
            settings.enabled
              ? "border-olive bg-olive text-cream"
              : "border-coffee/20 bg-beige text-espresso/70 dark:border-dark-border dark:bg-dark-surfaceHover dark:text-dark-textSecondary"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-7 w-7 rounded-full bg-cream-50 shadow-soft transition-all duration-200 dark:bg-dark-text ${
              settings.enabled ? "left-1" : "right-1"
            }`}
          />
          <span
            className={`w-full text-center text-xs font-semibold transition-all duration-200 ${
              settings.enabled ? "pe-9" : "ps-9"
            }`}
          >
            {settings.enabled ? "روشن" : "خاموش"}
          </span>
        </button>
      </div>

      {/* Chat with history */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* History sidebar */}
        <aside className="card flex max-h-[560px] flex-col overflow-hidden p-3" aria-label="تاریخچه گفتگوها">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-espresso dark:text-dark-text">گفتگوها</h3>
            <button
              type="button"
              onClick={newChat}
              disabled={!settings.enabled}
              className="rounded-lg bg-olive px-2.5 py-1 text-xs font-medium text-cream transition-colors hover:bg-olive-600 disabled:opacity-40 dark:hover:bg-olive-600"
            >
              + گفتگوی جدید
            </button>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto">
            {sessions.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-muted dark:text-dark-textSecondary">
                هنوز گفتگویی ندارید.
              </li>
            )}
            {sessions.map((s) => (
              <li key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => loadSession(s.id)}
                  className={`w-full rounded-xl px-3 py-2 text-right transition-colors ${
                    activeSessionId === s.id
                      ? "bg-olive/10 text-olive-700 dark:bg-olive/20 dark:text-olive-300"
                      : "hover:bg-beige dark:hover:bg-dark-surfaceHover"
                  }`}
                >
                  <span className="block truncate text-xs font-medium text-espresso dark:text-dark-text">{s.title}</span>
                  <span className="block text-[10px] text-muted dark:text-dark-textSecondary">
                    {s.messageCount} پیام ·{" "}
                    {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(s.updatedAt),
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(s.id)}
                  aria-label="حذف گفتگو"
                  className="absolute left-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-danger/10 text-[10px] text-danger group-hover:flex"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat pane */}
        <div className="card flex max-h-[560px] flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingSession ? (
              <p className="py-10 text-center text-sm text-muted">در حال بارگذاری گفتگو…</p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                <span aria-hidden="true" className="text-3xl">🤖</span>
                <p className="text-sm font-medium text-espresso dark:text-dark-text">
                  سوال خود را بپرسید
                </p>
                <p className="max-w-sm text-xs leading-relaxed text-muted dark:text-dark-textSecondary">
                  دستیار به داده‌های فروش، انبار و عملیاتی کافه دسترسی کنترل‌شده دارد و فقط تحلیل ارائه می‌دهد.
                  مثلاً: «اگر سفارش‌ها ۳۰٪ زیاد شود شف‌ها کافی هستند؟»
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-olive text-cream"
                        : "border border-coffee/10 bg-cream text-espresso dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {asking && (
              <div className="flex justify-end">
                <div className="rounded-2xl border border-coffee/10 bg-cream px-4 py-2.5 text-sm text-muted dark:border-dark-border dark:bg-dark-surface dark:text-dark-textSecondary">
                  در حال تحلیل داده‌ها…
                </div>
              </div>
            )}
          </div>
          <form onSubmit={ask} className="flex gap-2 border-t border-coffee/10 bg-cream-50 p-3 dark:border-dark-border dark:bg-dark-surface">
            <input
              className="input flex-1"
              placeholder={settings.enabled ? "سوال خود را بنویسید..." : "دستیار غیرفعال است"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!settings.enabled || asking}
            />
            <button type="submit" className="btn-primary" disabled={asking || !settings.enabled || !input.trim()}>
              {asking ? "..." : "ارسال"}
            </button>
          </form>
        </div>
      </div>

      {/* Insights */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="heading-card">هشدارها و بینش‌ها</h2>
          <button onClick={refreshInsights} disabled={refreshing} className="btn-secondary text-xs">
            {refreshing ? "در حال بررسی..." : "بررسی مجدد"}
          </button>
        </div>
        {insights.length === 0 ? (
          <div className="card p-6 text-center text-sm text-muted dark:text-dark-textSecondary">هشداری ثبت نشده است.</div>
        ) : (
          <ul className="space-y-2">
            {insights.map((i) => (
              <li
                key={i.id}
                className={`card p-4 ${
                  i.severity === "CRITICAL"
                    ? "border-danger/30"
                    : i.severity === "WARNING"
                      ? "border-warning/30"
                      : ""
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
<span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      i.severity === "CRITICAL"
                        ? "bg-danger/10 text-danger dark:bg-danger/20 dark:text-danger"
                        : i.severity === "WARNING"
                        ? "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning"
                        : "bg-olive/10 text-olive-600 dark:bg-olive/20 dark:text-olive-300"
                    }`}
                  >
                    {KIND_LABELS[i.kind] ?? i.kind}
                  </span>
                  <span className="text-sm font-semibold text-espresso dark:text-dark-text">{i.title}</span>
                </div>
                <p className="text-xs leading-relaxed text-espresso/75 dark:text-dark-textSecondary">{i.body}</p>
                <p className="mt-1 text-[10px] text-muted dark:text-dark-textSecondary">
                  {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(i.createdAt),
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
