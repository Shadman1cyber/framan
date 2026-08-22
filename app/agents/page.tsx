"use client";

import Link from "next/link";
import { agents } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui";

const statusStyle: Record<string, { label: string; cls: string }> = {
  working: { label: "Working", cls: "text-neutral-600" },
  idle: { label: "Idle", cls: "text-neutral-400" },
  waiting_for_user: { label: "Waiting on you", cls: "text-amber-700" },
  waiting_external: { label: "Waiting on an external system", cls: "text-neutral-500" },
  retrying: { label: "Retrying after failure", cls: "text-red-700" },
};

export default function AgentsPage() {
  return (
    <div>
      <PageHeader
        title="Agents"
        meta="What each Farman agent does, what it may do on its own, and when it must stop and ask."
      />
      <div className="space-y-[0.5px]">
        {agents.map((a) => {
          const s = statusStyle[a.status];
          return (
            <section key={a.id} className="border-[0.5px] border-borders px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 className="text-sm font-medium">{a.name}</h2>
                <span className={`text-sm ${s.cls}`}>{s.label}</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">{a.purpose}</p>
              <p className="mt-2 text-sm text-neutral-500">Right now: {a.statusLine}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-neutral-400">Does without asking</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-neutral-600">
                    {a.doesAutonomously.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Stops and asks when</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-neutral-600">
                    {a.escalatesWhen.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {a.worksOnWorkflowId ? (
                <Link
                  href={`/workflows/${a.worksOnWorkflowId}`}
                  className="mt-3 inline-block text-sm underline hover:text-neutral-600"
                >
                  See the workflow it’s working on
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
