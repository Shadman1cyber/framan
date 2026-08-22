"use client";

import { useDemo } from "@/lib/store";
import { getWorkflow, getStatusTone } from "@/lib/views";
import { workflows } from "@/lib/mock-data";
import { PageHeader, Row, StatusLabel } from "@/components/ui";
import Link from "next/link";

const stageLabels: Record<string, string> = {
  specify: "Specify",
  source: "Source",
  compare: "Compare",
  approve: "Approve",
  execute: "Execute",
  complete: "Complete",
};

export default function WorkflowsPage() {
  const { decision, jobs } = useDemo();
  return (
    <div>
      <PageHeader title="Workflows" meta="Every job Farman is running or has run." />
      <div className="mb-8 text-sm text-neutral-500">
        Open a workflow to see its stages, what Farman is doing, and where you can step in.
      </div>
      {workflows.map((w) => {
        const view = getWorkflow(w.id, decision);
        const stage = stageLabels[view.currentStageId] ?? "";
        return (
          <Row
            key={w.id}
            href={`/workflows/${w.id}`}
            title={w.title}
            context={`${stage} stage · ${view.statusLine}`}
            right={<StatusLabel tone={getStatusTone(view.statusKind)}>{w.amount ? `$${w.amount.toLocaleString()}` : ""}</StatusLabel>}
          />
        );
      })}
      {jobs.length > 0 ? (
        <>
          <div className="mt-8 mb-2 text-sm text-neutral-400">Created from chat</div>
          {jobs.map((j) => (
            <Row
              key={j.id}
              href={`/workflows/${j.id}`}
              title={j.title}
              context={
                j.needsApproval
                  ? "Approval required before Farman starts this job"
                  : "Queued by the orchestrator — Specify stage assigned"
              }
              right={<StatusLabel tone={j.needsApproval ? "attention" : "neutral"}>Planned</StatusLabel>}
            />
          ))}
        </>
      ) : null}
      <p className="mt-6 text-sm text-neutral-400">
        Looking for a specific purchase request? See{" "}
        <Link href="/procurement" className="underline hover:text-neutral-600">
          Procurement
        </Link>
        .
      </p>
    </div>
  );
}
