"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  getExecutionStepsFor,
  getWorkflow,
} from "@/lib/views";
import { purchaseOrder, purchaseRequest } from "@/lib/mock-data";
import type { Decision } from "@/lib/types";
import { money } from "@/lib/format";
import { ExecutionTimeline } from "@/components/timeline";

export default function ExecutionPage({ params }: { params: { id: string } }) {
  const { decision } = useDemo();

  const isMain = params.id === "wf-1042";
  const steps = getExecutionStepsFor(params.id, decision);
  const wf = getWorkflow(params.id, decision);

  if (!isMain && steps.length === 0) {
    return (
      <EmptyState
        id={params.id}
        title="No data — execution hasn’t started"
        body="This workflow hasn’t reached the Execute stage yet. The timeline appears here once an approval is granted and Farman starts acting on it."
      />
    );
  }

  if (decision === "rejected" && isMain) {
    return (
      <div>
        <Header />
        <div className="rounded-md border-l-2 border-red-600 bg-red-50 p-4 text-sm leading-relaxed">
          Nothing to execute — you rejected the recommendation, so Farman stopped before creating a
          purchase order. Nothing was sent and nothing will be charged.
          <div className="mt-2">
            <Link href="/workflows/wf-1042" className="underline">
              Back to the workflow
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const done = steps.filter((s) => s.state === "done").length;
  const summary = isMain ? mainSummary(decision, done) : wf.statusLine;

  return (
    <div>
      <Header />

      <p className="mb-6 text-sm text-neutral-700">{summary}</p>

      <section className="max-w-xl">
        <h2 className="mb-4 text-sm font-medium">Execution timeline</h2>
        <ExecutionTimeline steps={steps} />
      </section>

      {isMain && decision === "approved" ? (
        <section className="mt-8 max-w-xl rounded-xl border-[0.5px] border-borders p-5">
          <h3 className="text-sm font-medium">{purchaseOrder.id}</h3>
          <dl className="mt-2 space-y-1 text-sm text-neutral-600">
            <div className="flex justify-between gap-4">
              <dt>Supplier</dt>
              <dd>{purchaseOrder.supplierName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Total</dt>
              <dd className="tnum">{money(purchaseOrder.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Terms</dt>
              <dd>Net 30 · payment due Oct 1</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Delivery window</dt>
              <dd>Arrives Sep 22</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function mainSummary(decision: Decision, done: number): string {
  if (decision === "approved")
    return `In progress — ${done + 1} of 6 steps complete. Next update when Packline Industries confirms PO-${purchaseOrder.id.replace("PO-", "")}.`;
  if (decision === "change_requested")
    return "Queued — the Evaluation agent is revising the recommendation; execution starts after the revised version is approved.";
  if (decision === "evidence_requested")
    return "Queued — Farman is collecting the extra evidence you asked for; execution starts after you decide.";
  return "Queued — all six steps are ready and run automatically once this approval is granted.";
}

function Header() {
  return (
    <header className="mb-6">
      <Link
        href="/workflows/wf-1042"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={12} /> Workflow wf-1042
      </Link>
      <h1 className="mt-1 text-lg">Execute stage — Q4 retail packaging</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {purchaseRequest.quantity.toLocaleString()} pouches for {purchaseRequest.title.includes("kraft") ? "the Q4 launch" : ""}{" "}
        · needed by {purchaseRequest.neededBy}
      </p>
    </header>
  );
}

function EmptyState({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div>
      <Link
        href={`/workflows/${id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
      >
        <ArrowLeft size={12} /> Back to workflow
      </Link>
      <h1 className="mt-3 text-lg">{title}</h1>
      <p className="mt-1 max-w-lg text-sm leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}
