"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  approval,
  budgetCategories,
  company,
  offers,
  purchaseRequest,
  recommendation,
  suppliers as supplierRecords,
} from "@/lib/mock-data";
import type { Decision, Offer } from "@/lib/types";
import { money, signedMoney } from "@/lib/format";
import { Btn, EvidenceChip, MetricGroup, Metric } from "@/components/ui";

const recommendedId = recommendation.offerId;

export default function ApprovalPage({ params }: { params: { id: string } }) {
  const { decision, decide, reset } = useDemo();

  if (params.id !== approval.id) {
    return (
      <p className="text-sm text-neutral-500">
        Unknown approval reference. Open{" "}
        <Link href="/tasks" className="underline">
          My tasks
        </Link>{" "}
        to see what needs you.
      </p>
    );
  }

  const packaging = budgetCategories.find((c) => c.id === "cat-packaging");
  const remaining = packaging ? packaging.monthlyCap - packaging.committed : 0;
  const remainingAfter = remaining - approval.amount;
  const recommendedOffer = offers.find((o) => o.id === recommendedId) as Offer;

  return (
    <div>
      <header className="mb-6">
        <div className="text-sm text-neutral-500">
          <Link href="/workflows/wf-1042" className="hover:text-neutral-700">
            Workflow wf-1042
          </Link>{" "}
          · Approve stage
        </div>
        <h1 className="mt-1 text-lg">Approval decision</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Requested {approval.requestedAt} · assigned to {approval.assignedToName} ·{" "}
          {approval.expiresIn}
        </p>
      </header>

      {/* The approval card */}
      <div className="rounded-xl border-[0.5px] border-borders p-6 sm:p-8">
        {/* 1 — what am I approving + 2 — how much */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Label>What you’re approving</Label>
            <h2 className="mt-1 text-base">Award to Packline Industries</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-neutral-600">
              {purchaseRequest.quantity.toLocaleString()} kraft stand-up pouches for the Q4 launch,
              delivered by {purchaseRequest.neededBy}.
            </p>
          </div>
          <div className="text-right">
            <Label>Order total</Label>
            <div className="tnum mt-1 text-3xl">{money(approval.amount)}</div>
            <div className="tnum mt-0.5 text-sm text-neutral-500">
              {money(recommendedOffer.unitPrice)} per unit
            </div>
          </div>
        </div>

        {/* 3 — why this option: factor table, no bare scores */}
        <div className="mt-7">
          <Label>Why this option</Label>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            Farman recommends Packline Industries because it is the lowest-cost offer that meets
            your Sep 28 deadline from the supplier with the strongest delivery record.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-28 border-[0.5px] border-borders bg-surface px-3 py-2 text-left font-medium text-neutral-500">
                    Factor
                  </th>
                  <th className="border-[0.5px] border-borders bg-surface px-3 py-2 text-left align-top">
                    <div>Packline Industries</div>
                    <div className="text-xs font-medium">
                      {decision === "rejected" ? "Was recommended" : "Recommended"}
                    </div>
                  </th>
                  {offers
                    .filter((o) => o.id !== recommendedId)
                    .map((o) => (
                      <th
                        key={o.id}
                        className="border-[0.5px] border-borders px-3 py-2 text-left align-top font-medium"
                      >
                        {supplierName(o)}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    Price
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">$15,500</span>
                    <span className="block text-xs text-neutral-500">
                      Lowest among options that meet the deadline
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">$13,000</span>
                    <span className="block text-xs text-neutral-500">
                      Cheaper, but misses the deadline
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    <span className="tnum">$18,000</span>
                    <span className="block text-xs text-neutral-500">
                      $2,500 (16%) more than the recommendation
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    Lead time
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    21 days — arrives Sep 22
                    <span className="block text-xs text-green-700">
                      Meets Sep 28 with a 6-day buffer
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    35 days — arrives Oct 6
                    <span className="block text-xs text-red-700">Misses the deadline</span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    12 days — arrives Sep 13
                    <span className="block text-xs text-green-700">Meets the deadline</span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    Reliability
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    98% on time across 24 orders
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    No delivery history
                    <span className="block text-xs text-amber-700">
                      Insufficient evidence — new supplier
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    89% on time, last 6 orders
                    <span className="block text-xs text-neutral-500">
                      3 late deliveries — schedule risk
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top text-neutral-500">
                    Payment terms
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    Net 30
                    <span className="block text-xs text-neutral-500">Standard per policy POL-8</span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    Net 45
                    <span className="block text-xs text-neutral-500">
                      Outside standard terms
                    </span>
                  </td>
                  <td className="border-[0.5px] border-borders px-3 py-2 align-top">
                    Net 30, 2%/10 discount
                    <span className="block text-xs text-green-700">
                      Early-pay discount meets POL-8
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4 — risk/policy trigger */}
        <div className="mt-7">
          <Label>Why this needs you</Label>
          <div className="mt-2 rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
            {approval.requiredBecause}
          </div>
        </div>

        {/* 5 — what happens if approved */}
        <div className="mt-7">
          <Label>If you approve</Label>
          <p className="mt-1 text-sm leading-relaxed text-neutral-700">{approval.ifApproved}</p>
        </div>

        {/* Finance impact — inline, phase 7 */}
        <div className="mt-7">
          <Label>Financial context</Label>
          <div className="mt-2">
            <MetricGroup>
              <Metric label="Cash position today" value={money(company.cashPosition)} />
              <Metric
                label="This transaction"
                value={signedMoney(-approval.amount)}
                note="Due Oct 1 under Net 30 terms"
              />
              <Metric
                label="Packaging budget remaining"
                value={`${money(remaining)} → ${money(remainingAfter)}`}
                note={`Of ${money(packaging?.monthlyCap ?? 0)} monthly cap`}
              />
            </MetricGroup>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              Affordable — the payment lands Oct 1 under Net 30 terms, cash stays positive, and
              packaging spend remains inside the monthly cap with {money(remainingAfter)} to spare.
              Checked by the Finance agent at 11:07 (EV-140).
            </p>
          </div>
        </div>

        {/* Decision */}
        <div className="mt-8 border-t-[0.5px] border-borders pt-6">
          {decision === "pending" ? (
            <>
              <Label>Your decision</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="primary" onClick={() => decide("approved")}>
                  Approve — $15,500
                </Btn>
                <Btn onClick={() => decide("rejected")}>Reject</Btn>
                <Btn onClick={() => decide("change_requested")}>Request change</Btn>
                <Btn onClick={() => decide("evidence_requested")}>
                  Ask for more evidence
                </Btn>
              </div>
              <p className="mt-3 text-sm text-neutral-500">
                Your decision is recorded in the audit log with the evidence shown above.
              </p>
            </>
          ) : (
            <DecisionResult decision={decision} onReset={reset} />
          )}
        </div>
      </div>

      {/* Supporting evidence */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Supporting evidence</h2>
        <EvidenceRow id="EV-110" />
        <EvidenceRow id="EV-111" />
        <EvidenceRow id="EV-112" />
        <EvidenceRow id="EV-120" />
        <Link
          href="/activity"
          className="mt-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
        >
          See the full audit trail <ArrowRight size={12} />
        </Link>
      </section>
    </div>
  );
}

function DecisionResult({
  decision,
  onReset,
}: {
  decision: Exclude<Decision, "pending">;
  onReset: () => void;
}) {
  if (decision === "approved") {
    return (
      <div>
        <div className="flex items-center gap-2 rounded-md border-l-2 border-green-600 bg-green-50 p-4 text-sm">
          <Check size={14} className="shrink-0 text-green-700" />
          Approved just now — recorded with evidence EV-110 and policy snapshot EV-120. Farman is
          executing.
        </div>
        <Link
          href="/workflows/wf-1042/execution"
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
        >
          Follow the execution <ArrowRight size={12} />
        </Link>
      </div>
    );
  }
  if (decision === "rejected") {
    return (
      <div className="rounded-md border-l-2 border-red-600 bg-red-50 p-4 text-sm leading-relaxed">
        Rejected — the workflow stopped. Nothing was ordered and nothing will be charged. Both
        losing quotes remain open in case you want to restart sourcing.
        <div className="mt-3">
          <Link href="/activity" className="inline-flex items-center gap-1 underline">
            What happened next <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div>
      {decision === "change_requested" ? (
        <div className="rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
          Change requested — the Evaluation agent is revising the recommendation against updated
          lead times from all three suppliers. You’ll be notified here within the hour; nothing has
          been ordered while it works.
        </div>
      ) : (
        <div className="rounded-md border-l-2 border-amber-600 bg-amber-50 p-4 text-sm leading-relaxed">
          More evidence requested — Farman is asking Summit Flexible Packaging’s references for
          on-time delivery records, and VerdePack Co. for performance data from comparable
          customers. The approval returns here with whatever comes back.
        </div>
      )}
      <button onClick={onReset} className="mt-3 text-sm text-neutral-400 underline hover:text-neutral-600">
        Demo: reset to the pending decision
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-neutral-400">{children}</div>;
}

function supplierName(offer: Offer): string {
  return supplierRecords.find((s) => s.id === offer.supplierId)?.name ?? "";
}

function EvidenceRow({ id }: { id: string }) {
  return (
    <div className="flex items-start gap-3 border-[0.5px] border-borders px-4 py-2.5 [margin-top:-0.5px]">
      <EvidenceChip id={id} />
    </div>
  );
}
