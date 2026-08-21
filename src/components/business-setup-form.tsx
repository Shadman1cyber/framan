"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBusinessAction } from "@/server/actions/business";
import { Loader2, Sparkles, CircleAlert, ArrowRight } from "lucide-react";

const EXAMPLES = [
  "I want to start a small business selling Iranian handmade products internationally.",
  "I want to launch an online store for specialty saffron and tea exports.",
  "I want to start a consulting service helping factories digitize procurement.",
];

export function BusinessSetupForm({ prefillIdea }: { prefillIdea: string }) {
  const [idea, setIdea] = useState(prefillIdea);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const steps = pending
    ? ["Understanding your idea…", "Structuring the business model…", "Estimating costs & revenue…", "Generating execution tasks…"]
    : [];
  const [stepIdx, setStepIdx] = useState(0);

  if (pending) {
    setTimeout(() => setStepIdx((i) => (i < steps.length - 1 ? i + 1 : i)), 700);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createBusinessAction(idea);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/business/${res.id}?fresh=1`);
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <form onSubmit={submit} className="p-6">
        <label htmlFor="idea" className="block text-xs font-medium text-ink-dim mb-2 uppercase tracking-wide">
          Describe your business idea
        </label>
        <textarea
          id="idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={3}
          placeholder='e.g. "I want to start an online business selling Iranian handmade products internationally."'
          className="w-full rounded-lg bg-bg border border-line px-4 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition resize-none"
        />

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setIdea(ex)}
              className="rounded-full border border-line bg-raised px-3 py-1 text-[11px] text-ink-dim hover:text-ink hover:border-line-strong transition-colors"
            >
              {ex.length > 52 ? ex.slice(0, 52) + "…" : ex}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-bad bg-bad/10 border border-bad/20 rounded-lg px-3 py-2">
            <CircleAlert className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || idea.trim().length < 10}
          className="mt-5 inline-flex items-center gap-2 h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-[#04211d] hover:bg-accent-strong disabled:opacity-60 transition-colors"
        >
          {pending ? <Loader2 className="h-4 w-4 spin" /> : <Sparkles className="h-4 w-4" />}
          {pending ? "Business Agent working…" : "Generate Business Workspace"}
        </button>
      </form>

      {pending && (
        <ul className="px-6 pb-6 space-y-2">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2.5 text-[13px] transition-opacity ${i <= stepIdx ? "opacity-100 text-ink-dim" : "opacity-30 text-ink-faint"}`}>
              {i < stepIdx ? (
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
              ) : (
                <Loader2 className={`h-3 w-3 ${i === stepIdx ? "spin text-accent" : ""}`} />
              )}
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
