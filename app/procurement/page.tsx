"use client";

import Link from "next/link";
import { useDemo } from "@/lib/store";
import { getWorkflow, getStatusTone } from "@/lib/views";
import { purchaseRequest, rfq, workflows } from "@/lib/mock-data";
import type { Workflow } from "@/lib/types";
import { PageHeader, StatusLabel } from "@/components/ui";

export default function ProcurementPage() {
  const { decision } = useDemo();

  return (
    <div>
      <PageHeader
        title="تدارکات"
        meta="درخواست‌های خرید و وضعیت تأمین آن‌ها."
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">درخواست فعال</h2>
        <Link
          href="/approvals/apr-1042"
          className="-mt-[0.5px] flex items-center gap-3 border-[0.5px] border-l-2 border-l-amber-600 border-borders px-4 py-3 hover:bg-surface"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm">{purchaseRequest.title}</span>
            <span className="block truncate text-sm text-neutral-500">
              PR-{purchaseRequest.id.replace("pr-", "")} · {purchaseRequest.quantity.toLocaleString()}{" "}
              {purchaseRequest.unitLabel} · {rfq.responsesReceived} پیشنهاد دریافت شد · لازم تا{" "}
              {purchaseRequest.neededBy}
            </span>
          </span>
          <StatusLabel tone="attention">
            ۱۵۵٬۰۰۰٬۰۰۰ ریال · نیازمند تأیید
          </StatusLabel>
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">همهٔ جریان‌های کار تدارکات</h2>
        {workflows.map((w) => {
          const view = getWorkflow(w.id, decision);
          return (
            <RowLink key={w.id} wf={w} statusLine={view.statusLine} tone={getStatusTone(view.statusKind)} />
          );
        })}
      </section>
    </div>
  );
}

function RowLink({
  wf,
  statusLine,
  tone,
}: {
  wf: Workflow;
  statusLine: string;
  tone: Parameters<typeof StatusLabel>[0]["tone"];
}) {
  return (
    <Link
      href={`/workflows/${wf.id}`}
      className="-mt-[0.5px] flex items-center gap-3 border-[0.5px] border-borders px-4 py-3 hover:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{wf.title}</span>
        <span className="block truncate text-sm text-neutral-500">{statusLine}</span>
      </span>
      <StatusLabel tone={tone}>{wf.amount ? `$${wf.amount.toLocaleString()}` : ""}</StatusLabel>
    </Link>
  );
}
