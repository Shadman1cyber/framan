"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Hourglass, XCircle } from "lucide-react";

export type TimelineStage = {
  key: string;
  label: string;
  status: string;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

// Animated workflow timeline. Data is complete on arrival; the staggered
// reveal conveys the agent's execution sequence without faking latency.
export function WorkflowTimeline({ stages, fresh }: { stages: TimelineStage[]; fresh?: boolean }) {
  const [visible, setVisible] = useState(fresh ? 0 : stages.length);

  useEffect(() => {
    if (!fresh) return;
    if (visible >= stages.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), fresh ? 420 : 60);
    return () => clearTimeout(t);
  }, [visible, stages.length, fresh]);

  return (
    <ol className="relative">
      {stages.map((s, i) => {
        const shown = i < visible;
        const isLast = i === stages.length - 1;
        const done = s.status === "done";
        const failed = s.status === "failed";
        const waiting = s.status === "waiting";
        const running = s.status === "running";
        return (
          <li key={s.key} className={`relative flex gap-4 pb-5 ${shown ? "rise" : "opacity-0"}`} style={{ minHeight: 44 }}>
            {!isLast && (
              <span
                className={`absolute left-[13px] top-7 bottom-0 w-px ${failed ? "bg-bad/30" : waiting ? "bg-warn/40" : "bg-line-strong"}`}
              />
            )}
            <span
              className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                done || running
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : waiting
                    ? "border-warn/50 bg-warn/10 text-warn"
                    : failed
                      ? "border-bad/50 bg-bad/10 text-bad"
                      : "border-line bg-raised text-ink-faint"
              }`}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" />
              ) : running ? (
                <Loader2 className="h-3.5 w-3.5 spin" />
              ) : waiting ? (
                <Hourglass className="h-3 w-3" />
              ) : failed ? (
                <XCircle className="h-3.5 w-3.5" />
              ) : (
                <span className="num text-[10px]">{i + 1}</span>
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-[13px] font-medium ${shown ? "text-ink" : ""}`}>{s.label}</p>
                {waiting && (
                  <span className="rounded-md border border-warn/30 bg-warn/10 px-1.5 py-px text-[10px] font-medium text-warn">
                    HUMAN GATE
                  </span>
                )}
                {s.completedAt && (
                  <span className="num text-[10.5px] text-ink-faint">
                    {new Date(s.completedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                )}
              </div>
              {s.summary && (
                <p className="mt-1 text-xs leading-relaxed text-ink-dim max-w-xl">{s.summary}</p>
              )}
            </div>
          </li>
        );
      })}
      {fresh && visible < stages.length && (
        <li className="flex items-center gap-3 pl-11 pb-2">
          <Loader2 className="h-3.5 w-3.5 spin text-accent" />
          <span className="text-xs text-ink-faint">FARMAN agents working…</span>
        </li>
      )}
    </ol>
  );
}
