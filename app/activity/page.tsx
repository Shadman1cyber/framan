"use client";

import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/lib/store";
import { getActivityFeed } from "@/lib/views";
import type { ActivityEvent } from "@/lib/types";
import { EvidenceChip } from "@/components/ui";

type Filter = "all" | "user" | "agent" | "system";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "همه" },
  { key: "user", label: "تصمیم‌های انسانی" },
  { key: "agent", label: "اقدامات عامل‌ها" },
  { key: "system", label: "سیستم" },
];

export default function ActivityPage() {
  const { decision } = useDemo();
  const [filter, setFilter] = useState<Filter>("all");
  const all = getActivityFeed(decision);
  const shown =
    filter === "all" ? all : all.filter((e) => e.actorKind === filter);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-lg">گزارش فعالیت و حسابرسی</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">
          هر اقدام مهم فرمان یا درخواست او، همراه با آغازگر، سیاست اعمال‌شده و شواهد پشت آن.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md border-[0.5px] px-3 py-1.5 text-sm ${
              filter === f.key
                ? "border-borders bg-surface font-medium"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ol className="space-y-[0.5px]">
        {shown.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ol>

      <p className="mt-8 text-sm text-neutral-400">
        رویدادها برای همیشه نگهداری می‌شوند. بخش 
        <Link href="/policies" className="text-brand underline hover:text-brand-hover">
          سیاست‌ها
        </Link>{" "}
        قواعد ارجاع‌شده در بالا را ببینید.
      </p>
    </div>
  );
}

function EventRow({ event }: { event: ActivityEvent }) {
  const actorLabel =
    event.actorKind === "user"
      ? event.actorName
      : event.actorKind === "agent"
        ? event.actorName
        : "System";
  return (
    <li className="border-[0.5px] border-borders px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm">
          <span
            className={
              event.actorKind === "user"
                ? "font-medium"
                : event.actorKind === "system"
                  ? "text-neutral-400"
                  : "text-neutral-500"
            }
          >
            {actorLabel}
          </span>{" "}
          — {event.action}
        </span>
        <span className="tnum shrink-0 text-xs text-neutral-400">{event.at}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-1 text-sm text-neutral-500">
        {event.policyCode ? (
          <Link
            href="/policies"
            className="text-neutral-700 underline decoration-neutral-300 hover:decoration-neutral-700"
          >
            سیاست {event.policyCode}
          </Link>
        ) : null}
        <span>نتیجه: {event.outcome}</span>
      </div>
      {event.evidenceIds.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-start gap-1.5">
          {event.evidenceIds.map((id) => (
            <EvidenceChip key={id} id={id} />
          ))}
        </div>
      ) : null}
    </li>
  );
}
