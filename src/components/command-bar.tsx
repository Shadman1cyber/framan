"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command as CommandIcon, Loader2, CornerDownLeft, Sparkles } from "lucide-react";
import { runCommandAction } from "@/server/actions/command";
import type { CommandResult } from "@/lib/agents/command";
import { formatMoney } from "@/lib/format";
import { Badge, ScorePill, RiskBadge } from "@/components/ui";

const SUGGESTIONS = [
  "Find the best supplier for 500 packaging units",
  "Can we afford this purchase?",
  "Show me our biggest expenses",
  "What needs my attention today?",
  "Start a business selling Iranian handmade products internationally",
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setText("");
      setResult(null);
      setError(null);
    }
  }, [open]);

  function run(cmd?: string) {
    const t = (cmd ?? text).trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const res = await runCommandAction(t);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      const r = res.result as CommandResult;
      if (r.kind === "business_setup") {
        setOpen(false);
        router.push(`/business/setup?idea=${encodeURIComponent(r.idea)}`);
        return;
      }
      setResult(r);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 h-9 w-full max-w-[420px] rounded-lg border border-line bg-surface px-3 text-[13px] text-ink-faint hover:border-line-strong hover:text-ink-dim transition-colors"
      >
        <CommandIcon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Give FARMAN a command…</span>
        <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-mono text-ink-faint">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[640px] rounded-xl border border-line-strong bg-surface shadow-2xl overflow-hidden rise">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
              className="flex items-center gap-3 border-b border-line px-4 h-[52px]"
            >
              <Sparkles className="h-4 w-4 text-accent shrink-0" />
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Give FARMAN a command…"
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
              {pending ? (
                <Loader2 className="h-4 w-4 spin text-accent" />
              ) : (
                <button type="submit" className="text-ink-faint hover:text-accent transition-colors">
                  <CornerDownLeft className="h-4 w-4" />
                </button>
              )}
            </form>

            <div className="max-h-[52vh] overflow-y-auto p-4">
              {!result && !pending && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">Try a command</p>
                  <ul className="space-y-1">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button
                          onClick={() => run(s)}
                          className="w-full text-left rounded-lg px-3 py-2 text-[13px] text-ink-dim hover:bg-raised hover:text-ink transition-colors"
                        >
                          “{s}”
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pending && (
                <div className="space-y-2 py-1">
                  <p className="text-[13px] text-ink-dim flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 spin text-accent" /> FARMAN is executing…
                  </p>
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-4 w-1/2" />
                </div>
              )}

              {error && <p className="text-sm text-bad">{error}</p>}

              {result && <CommandResultView result={result} onDone={() => setOpen(false)} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CommandResultView({ result, onDone }: { result: CommandResult; onDone: () => void }) {
  if (result.kind === "unknown")
    return (
      <div className="text-[13px] leading-relaxed">
        <p className="text-ink-dim">
          I couldn&apos;t map that to an executable workflow — and I won&apos;t pretend to.
          Commands I can execute today:
        </p>
        <ul className="mt-2 space-y-1 text-ink">
          {SUGGESTIONS.slice(0, 4).map((s) => (
            <li key={s} className="flex gap-2"><span className="text-accent">›</span>{s}</li>
          ))}
        </ul>
      </div>
    );

  if (result.kind === "cfo") {
    const a = result.answer;
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wider text-accent mb-1.5">AI CFO</p>
        <p className="text-sm font-medium">{a.title}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{a.answer}</p>
        {a.metrics && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {a.metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-line bg-bg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-ink-faint">{m.label}</p>
                <p
                  className={`num mt-0.5 text-sm font-semibold ${
                    m.tone === "good" ? "text-good" : m.tone === "bad" ? "text-bad" : m.tone === "warn" ? "text-warn" : "text-ink"
                  }`}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}
        {a.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-dim">
            {a.bullets.map((b, i) => (
              <li key={i} className="flex gap-2"><span className="text-accent mt-0.5">·</span>{b}</li>
            ))}
          </ul>
        )}
        {a.link && (
          <a
            href={a.link.href}
            onClick={onDone}
            className="mt-4 inline-flex items-center rounded-lg bg-accent-soft border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
          >
            {a.link.label} →
          </a>
        )}
      </div>
    );
  }

  if (result.kind !== "procurement_preview") return null;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-accent mb-1.5">Procurement Agent</p>
      <p className="text-sm font-medium">
        Sourcing preview — {formatMoney(result.offers[0]?.totalPrice ?? 0)} best total for{" "}
        {result.quantity.toLocaleString()} × {result.itemType}
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        Category detected: {result.category}. Create the full request to trigger the complete workflow with approval gate.
      </p>
      <table className="mt-3 w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint border-b border-line">
            <th className="py-1.5 pr-2 font-medium">Supplier</th>
            <th className="py-1.5 pr-2 font-medium text-right">Unit</th>
            <th className="py-1.5 pr-2 font-medium text-right">Total</th>
            <th className="py-1.5 pr-2 font-medium text-right">Lead</th>
            <th className="py-1.5 pr-2 font-medium">Reliability</th>
            <th className="py-1.5 pr-2 font-medium">Risk</th>
            <th className="py-1.5 font-medium text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {result.offers.map((o, i) => (
            <tr key={o.supplierName} className={`border-b border-line/60 ${i === 0 ? "bg-accent-soft/40" : ""}`}>
              <td className="py-2 pr-2 text-ink">{o.supplierName}</td>
              <td className="num py-2 pr-2 text-right">{formatMoney(o.unitPrice, { compact: true })}</td>
              <td className="num py-2 pr-2 text-right">{formatMoney(o.totalPrice, { compact: true })}</td>
              <td className="num py-2 pr-2 text-right">{o.leadTimeDays}d</td>
              <td className="py-2 pr-2">{Math.round(o.reliabilityScore)}%</td>
              <td className="py-2 pr-2"><RiskBadge level={o.riskLevel} /></td>
              <td className="py-2 text-right"><ScorePill score={o.score} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <a
        href={`/procurement/requests/new?item=${encodeURIComponent(result.itemType)}&qty=${result.quantity}`}
        onClick={onDone}
        className="mt-4 inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-[#04211d] hover:bg-accent-strong transition-colors"
      >
        Create full request →
      </a>
    </div>
  );
}
