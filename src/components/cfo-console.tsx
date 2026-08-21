"use client";

import { useState, useTransition } from "react";
import { askCfoAction } from "@/server/actions/cfo";
import { Loader2, Send, Bot, CircleAlert } from "lucide-react";
import type { CfoAnswer } from "@/lib/agents/ai/provider";

const QUESTIONS = [
  "Can we afford this purchase?",
  "How will this purchase affect cash flow?",
  "Which suppliers are costing us the most?",
  "Where are we overspending?",
  "What needs my attention today?",
];

type Turn = { question: string; answer?: CfoAnswer; error?: string };

export function CfoConsole() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startTransition] = useTransition();

  function ask(q?: string) {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion("");
    startTransition(async () => {
      const res = await askCfoAction(text);
      setTurns((prev) => [{ question: text, answer: res.answer, error: res.error }, ...prev]);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden lg:sticky lg:top-[76px]">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-line">
        <Bot className="h-4 w-4 text-accent" />
        <h2 className="text-[13px] font-semibold">Ask the AI CFO</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex gap-2 px-4 py-3 border-b border-line"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Can we afford a $12,000 order?"
          className="flex-1 h-9 rounded-lg bg-bg border border-line px-3 text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent transition"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 w-9 shrink-0 rounded-lg bg-accent text-[#04211d] flex items-center justify-center hover:bg-accent-strong disabled:opacity-60 transition"
          aria-label="Ask"
        >
          {pending ? <Loader2 className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            disabled={pending}
            className="rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink hover:border-line-strong transition-colors disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="max-h-[480px] overflow-y-auto divide-y divide-line">
        {turns.length === 0 && !pending && (
          <p className="px-5 py-6 text-xs text-ink-faint leading-relaxed">
            Answers are computed live from your ledger and supplier graph — try one of the suggested questions.
          </p>
        )}
        {pending && turns.length === 0 && (
          <div className="px-5 py-4 space-y-2">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="px-5 py-4 rise">
            <p className="text-[12px] font-medium text-accent">{t.question}</p>
            {t.error ? (
              <p className="mt-1.5 flex gap-2 text-[13px] text-warn leading-relaxed">
                <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" /> {t.error}
              </p>
            ) : t.answer ? (
              <>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">{t.answer.answer}</p>
                {t.answer.metrics && t.answer.metrics.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    {t.answer.metrics.map((m) => (
                      <div key={m.label} className="rounded-lg border border-line bg-bg px-2.5 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-ink-faint truncate">{m.label}</p>
                        <p className={`num mt-0.5 text-[13px] font-semibold ${m.tone === "good" ? "text-good" : m.tone === "bad" ? "text-bad" : m.tone === "warn" ? "text-warn" : "text-ink"}`}>
                          {m.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {t.answer.bullets.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {t.answer.bullets.slice(0, 6).map((b, j) => (
                      <li key={j} className="flex gap-2 text-[12px] text-ink-dim"><span className="text-accent mt-0.5">·</span>{b}</li>
                    ))}
                  </ul>
                )}
                {t.answer.link && (
                  <a href={t.answer.link.href} className="mt-2.5 inline-block text-xs text-accent hover:underline">
                    {t.answer.link.label} →
                  </a>
                )}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
