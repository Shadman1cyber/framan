"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useDemo } from "@/lib/store";
import { getActivityFeed, getExecutionSteps, getWorkflow } from "@/lib/views";
import type { Decision } from "@/lib/types";
import { purchaseRequest, recommendation } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui";
import { Stepper } from "@/components/stepper";

export default function WorkflowPage({ params }: { params: { id: string } }) {
  const { decision } = useDemo();

  if (params.id.startsWith("wf-chat-")) {
    return <ChatJobView id={params.id} />;
  }

  const wf = getWorkflow(params.id, decision);
  const isMain = wf.id === "wf-1042";
  const events = getActivityFeed(decision)
    .filter((e) => e.workflowId === wf.id)
    .slice(0, 4);

  return (
    <div>
      <PageHeader
        title={wf.title}
        meta={`Opened by ${wf.initiatedByName} · ${wf.openedAt} · ${
          wf.amount ? `$${wf.amount.toLocaleString()}` : "no amount yet"
        }`}
      />

      <section className="mb-8">
        <Stepper
          stages={wf.stages}
          workflowId={wf.id}
          currentStageId={wf.currentStageId}
        />
        <p className="mt-5 text-sm text-neutral-700">{viewStatusLine(wf, isMain)}</p>
      </section>

      {isMain && <MainStageCards decision={decision} />}
      {!isMain && <MinorNotes id={wf.id} />}

      <section className="mt-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <Link
            href="/activity"
            className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
          >
            Full audit log <ArrowRight size={12} />
          </Link>
        </div>
        <div>
          {events.map((e) => (
            <div
              key={e.id}
              className="border-[0.5px] border-borders px-4 py-3 [margin-top:-0.5px]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm">
                  <span className={e.actorKind === "user" ? "" : "text-neutral-500"}>
                    {e.actorName}
                  </span>{" "}
                  — {e.action}
                </span>
                <span className="tnum shrink-0 text-xs text-neutral-400">{e.at}</span>
              </div>
              <div className="mt-0.5 text-sm text-neutral-500">Outcome: {e.outcome}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChatJobView({ id }: { id: string }) {
  const { jobs } = useDemo();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return (
      <p className="text-sm text-neutral-500">
        This chat-created job is no longer in memory (it clears on refresh). Ask the orchestrator
        again in{" "}
        <Link href="/chat" className="underline">
          Chat
        </Link>{" "}
        and it will re-create it.
      </p>
    );
  }
  return (
    <div>
      <PageHeader
        title={job.title}
        meta={`Created via chat · ${job.amount ? `$${job.amount.toLocaleString()}` : "no amount given"}`}
      />
      <section className="mb-8">
        <ol className="space-y-[0.5px]">
          {job.stages.map((stage, i) => (
            <li
              key={`${stage}-${i}`}
              className="flex items-center gap-3 border-[0.5px] border-borders px-4 py-3"
            >
              <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[0.5px] border-neutral-300 text-xs text-neutral-400">
                {i + 1}
              </span>
              <span className="text-sm">{stage}</span>
              <span className="ml-auto text-sm text-neutral-400">
                {i === 0 ? "Next — starts when the job runs" : "Queued"}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {job.needsApproval ? (
        <div className="rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
          Approval required before Farman executes this job
          {job.policyNote ? `: ${job.policyNote}` : "."} It appears in “Needs you” until a director
          signs off.
        </div>
      ) : (
        <div className="rounded-md border-l-2 border-borders bg-surface p-4 text-sm leading-relaxed text-neutral-600">
          Queued by the orchestrator from your chat request. This demo plans new jobs but does not
          execute them — the seeded packaging request shows the full end-to-end run.
        </div>
      )}
      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/chat" className="underline hover:text-neutral-600">
          Back to chat
        </Link>
        <Link href="/workflows" className="underline hover:text-neutral-600">
          All workflows
        </Link>
      </div>
    </div>
  );
}

function viewStatusLine(wf: ReturnType<typeof getWorkflow>, isMain: boolean): string {
  if (isMain && wf.currentStageId === "approve" && wf.statusKind === "needs_user") {
    return `${wf.statusLine} Approval expires in 48 hours.`;
  }
  if (isMain && wf.statusKind === "waiting_external") {
    return `${wf.statusLine} Farman checks every 15 minutes and posts the confirmation here when it arrives.`;
  }
  if (wf.statusKind === "blocked") {
    return wf.statusLine;
  }
  return wf.statusLine;
}

function MainStageCards({ decision }: { decision: Decision }) {
  const steps = getExecutionSteps(decision);
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title="Recommendation">
        {decision === "rejected" ? (
          <p>
            The recommendation was not accepted. Packline Industries ($15,500) remains on record
            with the reasons it was preferred.
          </p>
        ) : decision === "approved" ? (
          <p>
            Accepted — Packline Industries at $15,500: lowest price among offers meeting the Sep 28
            deadline, 98% delivery record.
          </p>
        ) : (
          <p>{recommendation.because}</p>
        )}
        <LinkRow href={`/workflows/wf-1042/compare`} label="Review the comparison" />
      </Card>
      <Card title="Approval">
        {decision === "approved" ? (
          <p>Approved by you just now — recorded with EV-110 and policy snapshot EV-120.</p>
        ) : decision === "rejected" ? (
          <p>Rejected by you — the workflow stopped before any purchase was made.</p>
        ) : decision === "pending" ? (
          <p>
            Policy POL-2 requires director sign-off above $10,000. This order is $15,500.
          </p>
        ) : (
          <p>
            You asked Farman to revise or gather more evidence; the approval returns to you when
            that work finishes.
          </p>
        )}
        <LinkRow href="/approvals/apr-1042" label="Open the approval" />
      </Card>
      <Card title="Execution">
        {decision === "approved" ? (
          <p>
            {done + 1} of 6 execution steps complete — waiting on supplier confirmation from
            Packline Industries.
          </p>
        ) : decision === "rejected" ? (
          <p>Nothing was executed — the job closed before any order was placed.</p>
        ) : (
          <p>6 steps are queued and run automatically once the approval is granted.</p>
        )}
        <LinkRow href={`/workflows/wf-1042/execution`} label="Open the timeline" />
      </Card>
      <Card title="Request">
        <p>
          {purchaseRequest.quantity.toLocaleString()} {purchaseRequest.unitLabel} ·{" "}
          {purchaseRequest.category} · needed by {purchaseRequest.neededBy}.
          {" "}
          Recommended supplier: Packline Industries.
        </p>
      </Card>
    </div>
  );
}

function MinorNotes({ id }: { id: string }) {
  if (id === "wf-1040") {
    return (
      <CalloutBlock tone="danger" title="Blocked by policy POL-7">
        Preferred-list vendors need two quotes before an award. One quote received; a second was
        requested at 10:15. Farman resumes comparing automatically when it arrives.
      </CalloutBlock>
    );
  }
  if (id === "wf-1041") {
    return (
      <CalloutBlock tone="warn" title="Approval expired">
        The approval request sent Aug 29 expired after 48 hours without a decision. Decide now to
        keep this order moving; otherwise Farman resubmits tomorrow at 9:00 with fresh quotes.
      </CalloutBlock>
    );
  }
  if (id === "wf-1044") {
    return (
      <CalloutBlock tone="danger" title="Integration failure — retrying">
        The ERP rejected the connection while posting the financial update (timeout at 11:42). The
        order is confirmed with the supplier; only the ledger posting is delayed. Retries run every
        4 minutes and Farman escalates to Sam Ortiz after three failures.
      </CalloutBlock>
    );
  }
  return null;
}

function CalloutBlock({
  tone,
  title,
  children,
}: {
  tone: "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "warn"
      ? "border-amber-600 bg-amber-50"
      : "border-red-600 bg-red-50";
  return (
    <div className={`rounded-md border-l-2 ${styles} p-4`}>
      <div className="text-sm">{title}</div>
      <div className="mt-1 text-sm text-neutral-600">{children}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-[0.5px] border-borders p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-1.5 text-sm leading-relaxed text-neutral-600">{children}</div>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-sm underline hover:text-neutral-600"
    >
      {label} <ArrowRight size={12} />
    </Link>
  );
}
