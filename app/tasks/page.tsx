"use client";

import Link from "next/link";
import { useDemo } from "@/lib/store";
import { needsYou } from "@/lib/views";
import { PageHeader, StatusLabel } from "@/components/ui";

export default function TasksPage() {
  const { decision } = useDemo();
  const items = needsYou(decision);

  return (
    <div>
      <PageHeader title="کارهای من" meta="تأییدها و بررسی‌هایی که منتظر شما هستند." />
      {items.length === 0 ? (
        <p className="border-[0.5px] border-borders px-4 py-3 text-sm text-neutral-500">
          در حال حاضر چیزی در انتظار شما نیست. هرگاه یک نقطه کنترلی سیاست یا جریان کاری متوقف‌شده به انسان نیاز پیدا کند، فرمان آن را همین‌جا نشان می‌دهد.
        </p>
      ) : (
        items.map((item) => (
          <Link
            key={item.workflowId}
            href={
              item.workflowId === "wf-1042"
                ? "/approvals/apr-1042"
                : `/workflows/${item.workflowId}`
            }
            className="-mt-[0.5px] flex items-center gap-3 border-[0.5px] border-l-2 border-l-amber-600 border-borders px-4 py-3 first:mt-0 hover:bg-surface"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{item.title}</span>
              <span className="block truncate text-sm text-neutral-500">{item.context}</span>
            </span>
            <StatusLabel tone={item.statusTone}>
              {item.amount ? `${new Intl.NumberFormat("fa").format(item.amount)} ریال · ` : ""}
              {item.statusLabel}
            </StatusLabel>
          </Link>
        ))
      )}
    </div>
  );
}
