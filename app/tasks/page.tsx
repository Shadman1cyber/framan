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
      <PageHeader title="My tasks" meta="Approvals and reviews waiting on you." />
      {items.length === 0 ? (
        <p className="border-[0.5px] border-borders px-4 py-3 text-sm text-neutral-500">
          Nothing is waiting on you right now. Farman will surface a task here whenever a policy
          checkpoint or a blocked workflow needs a human.
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
              {item.amount ? `$${item.amount.toLocaleString()} · ` : ""}
              {item.statusLabel}
            </StatusLabel>
          </Link>
        ))
      )}
    </div>
  );
}
