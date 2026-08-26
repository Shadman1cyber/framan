"use client";

import type { ReactNode } from "react";

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  display: string;
  tone?: "primary" | "muted" | "good" | "bad";
  note?: string;
}

const toneFill: Record<NonNullable<BarItem["tone"]>, string> = {
  primary: "bg-brand",
  muted: "bg-neutral-300",
  good: "bg-green-600",
  bad: "bg-red-500",
};

/** Horizontal bar list — scales to the largest value, RTL-safe. */
export function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const pct = Math.max(2, Math.round((item.value / max) * 100));
        return (
          <div key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sm">{item.label}</span>
              <span className="tnum text-sm text-neutral-600">{item.display}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className={`h-full rounded-full ${toneFill[item.tone ?? "muted"]}`} style={{ width: `${pct}%` }} />
            </div>
            {item.note ? (
              <div className="mt-1 text-xs text-neutral-400">{item.note}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Thin usage bar with cap marker and percentage. */
export function UsageBar({
  used,
  cap,
  dangerOverPct = 90,
}: {
  used: number;
  cap: number;
  dangerOverPct?: number;
}) {
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  const hot = pct >= dangerOverPct;
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${hot ? "bg-red-500" : "bg-neutral-800"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`tnum shrink-0 text-xs ${hot ? "text-red-700" : "text-neutral-400"}`}>{pct}٪</span>
    </div>
  );
}

/** Compact vertical mini-bars for a short time series (e.g. daily spend). */
export function MiniBars({
  points,
}: {
  points: Array<{ label: string; value: number; display?: string }>;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {points.map((p, i) => {
          const h = Math.max(4, Math.round((p.value / max) * 100));
          const isLast = i === points.length - 1;
          return (
            <div key={`${p.label}-${i}`} className="group relative flex-1">
              <div
                className={`w-full rounded-t-sm ${isLast ? "bg-brand" : "bg-neutral-200"} transition-colors group-hover:bg-neutral-400`}
                style={{ height: `${h}%` }}
              />
              <span className="pointer-events-none absolute -top-7 right-1/2 hidden translate-x-1/2 whitespace-nowrap rounded-md border-[0.5px] border-borders bg-white px-1.5 py-0.5 text-xs text-neutral-700 group-hover:block">
                {p.display ?? p.value}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-neutral-400">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Linear progress with caption — used for workflow/execution completion. */
export function ProgressLine({ done, total, caption }: { done: number; total: number; caption: string }) {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <div className="max-w-sm">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-neutral-500">{caption}</div>
    </div>
  );
}
