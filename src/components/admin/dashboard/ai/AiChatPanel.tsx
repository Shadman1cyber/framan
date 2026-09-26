"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useToast } from "@/components/ui/Toast";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

/**
 * The assistant conversation itself: message list, ask box, session continuity.
 * Shared by the home-screen card and the floating launcher, and it talks to the
 * same /api/admin/ai/chat endpoint as the full assistant page.
 */
export function AiChatPanel({ autoFocus = false }: { autoFocus?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, asking]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || asking) return;
    setAsking(true);
    setInput("");
    const pendingId = `tmp-${Date.now()}`;
    setMessages((current) => [...current, { id: pendingId, role: "user", content: question }]);
    try {
      const res = await fetch("/api/admin/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "خطا");
      setMessages((current) => [
        ...current.filter((message) => message.id !== pendingId),
        { id: `u-${Date.now()}`, role: "user", content: question },
        { id: `a-${Date.now()}`, role: "assistant", content: payload.answer },
      ]);
      setSessionId(payload.sessionId ?? null);
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      show(error instanceof Error ? error.message : "خطا", "error");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <div
        ref={scrollRef}
        data-testid="ai-chat-messages"
        className="max-h-[260px] min-h-[120px] flex-1 space-y-2 overflow-y-auto pl-1"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[12px] leading-relaxed text-dashboard-muted">
            دستیار به داده‌های فروش، انبار و عملیاتی کافه دسترسی کنترل‌شده دارد و فقط تحلیل ارائه می‌دهد.
            مثلاً: «اگر سفارش‌ها ۳۰٪ زیاد شود شف‌ها کافی هستند؟»
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
              <p
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  message.role === "user"
                    ? "bg-signal-bright/15 text-dashboard-foreground"
                    : "border border-dashboard-line bg-dashboard-raised text-dashboard-foreground"
                }`}
              >
                {message.content}
              </p>
            </div>
          ))
        )}
        {asking && (
          <div className="flex justify-end">
            <p className="rounded-2xl border border-dashboard-line bg-dashboard-raised px-3.5 py-2.5 text-[12px] text-dashboard-muted">
              در حال تحلیل داده‌ها…
            </p>
          </div>
        )}
      </div>
      <form onSubmit={ask} className="mt-3 flex gap-2 border-t border-dashboard-line pt-3">
        <input
          ref={inputRef}
          aria-label="پرسش از دستیار"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="سوال خود را بنویسید..."
          disabled={asking}
          className="min-h-9 flex-1 rounded-full border border-dashboard-line bg-dashboard-raised px-4 text-[12px] leading-relaxed text-dashboard-foreground outline-none transition-colors placeholder:text-dashboard-muted focus:border-signal-bright/60"
        />
        <button
          type="submit"
          disabled={asking || !input.trim()}
          className="inline-flex min-h-9 items-center rounded-full bg-signal-bright px-5 text-[12px] font-semibold text-dashboard transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {asking ? "..." : "ارسال"}
        </button>
      </form>
    </>
  );
}
