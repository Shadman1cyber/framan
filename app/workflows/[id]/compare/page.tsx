"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { useDemo } from "@/lib/store";
import {
  offers,
  policies,
  purchaseRequest,
  recommendation,
  rfq,
  suppliers as supplierRecords,
} from "@/lib/mock-data";
import type { Decision, Offer } from "@/lib/types";
import { money } from "@/lib/format";

const recommended = offers.find((o) => o.id === recommendation.offerId) as Offer;
const recommendedId = recommended.id;
const others = offers.filter((o) => o.id !== recommendedId);

export default function ComparePage() {
  const { decision } = useDemo();

  return (
    <div>
      <header className="mb-6">
        <div className="text-sm text-neutral-500">
          <Link href="/workflows/wf-1042" className="hover:text-neutral-700">
            Workflow wf-1042
          </Link>{" "}
          · Compare stage
        </div>
        <h1 className="mt-1 text-lg">{purchaseRequest.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {rfq.responsesReceived} of 3 quotes received · stock needed by{" "}
          {purchaseRequest.neededBy}
        </p>
      </header>

      <DecisionNote decision={decision} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Offer comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40 border-[0.5px] border-borders bg-surface px-4 py-3 text-left font-medium text-neutral-500">
                  Factor
                </th>
                {offers.map((o) => {
                  const isRec = o.id === recommendedId;
                  return (
                    <th
                      key={o.id}
                      className={`border-[0.5px] border-borders px-4 py-3 text-left align-top ${
                        isRec ? "bg-surface" : ""
                      }`}
                    >
                      <div>{supplierName(o)}</div>
                      <div
                        className={`mt-0.5 text-xs ${isRec ? "font-medium" : "text-neutral-400"}`}
                      >
                        {isRec
                          ? decision === "rejected"
                            ? "Was recommended"
                            : "Recommended"
                          : `Received ${o.receivedAt}`}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <FactorRow
                label="Price"
                render={(o) => (
                  <>
                    <span className="tnum">{money(o.total)}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {money(o.unitPrice)} per unit × 50,000
                    </span>
                  </>
                )}
                noteFor={priceNote}
              />
              <FactorRow
                label="Lead time"
                render={(o) => (
                  <>
                    <span>{o.arrivalLabel}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs">
                      {o.meetsDeadline ? (
                        <span className="flex items-center gap-1 text-green-700">
                          <Check size={12} /> Meets your deadline
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-700">
                          <Minus size={12} /> Misses your deadline
                        </span>
                      )}
                    </span>
                  </>
                )}
              />
              <FactorRow
                label="Reliability"
                render={(o) => (
                  <>
                    <span>{o.reliabilityDisplay}</span>
                    {o.reliabilityConfidence === "unproven" ? (
                      <span className="mt-0.5 block text-xs text-amber-700">
                        Insufficient evidence — new supplier, nothing to verify against yet
                      </span>
                    ) : null}
                    {o.reliabilityConfidence === "low" ? (
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        Low confidence — based on only 6 recent orders
                      </span>
                    ) : null}
                  </>
                )}
              />
              <FactorRow
                label="Payment terms"
                render={(o) => (
                  <>
                    <span>{o.paymentTerms}</span>
                    {o.paymentTermsNote ? (
                      <span className="mt-0.5 block text-xs text-green-700">
                        {o.paymentTermsNote}
                      </span>
                    ) : null}
                  </>
                )}
              />
              <FactorRow
                label="Policy check"
                render={(o) =>
                  o.policyCheck.state === "pass" ? (
                    <span className="flex items-center gap-1 text-green-700">
                      <Check size={12} /> Pass
                      <span className="text-xs text-neutral-500">
                        ({policyName(o.policyCheck.policyCode)})
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="text-amber-700">Flagged</span>
                      <span className="mt-0.5 block text-xs text-neutral-600">
                        {o.policyCheck.note}
                      </span>
                    </>
                  )
                }
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Why the other options weren’t picked</h2>
        {others.map((o) => (
          <div key={o.id} className="rounded-md border-[0.5px] border-borders p-4">
            <div className="text-sm">{supplierName(o)}</div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">
              {recommendation.notPickedNotes[o.supplierId]}
            </p>
          </div>
        ))}
      </section>

      <NextStepCard decision={decision} />
    </div>
  );
}

function FactorRow({
  label,
  render,
  noteFor,
}: {
  label: string;
  render: (offer: Offer) => React.ReactNode;
  noteFor?: (offer: Offer) => React.ReactNode;
}) {
  return (
    <tr>
      <td className="border-[0.5px] border-borders bg-surface px-4 py-3 align-top text-neutral-500">
        {label}
      </td>
      {offers.map((o) => (
        <td key={o.id} className="border-[0.5px] border-borders px-4 py-3 align-top">
          {render(o)}
          {noteFor ? (
            <span className="mt-1 block text-xs text-neutral-500">{noteFor(o)}</span>
          ) : null}
        </td>
      ))}
    </tr>
  );
}

function DecisionNote({ decision }: { decision: Decision }) {
  if (decision === "approved") {
    return (
      <Note tone="good">
        Approved — Packline Industries was selected at {money(recommended.total)}. The order is
        executing; this comparison is retained as the record of what was considered.
      </Note>
    );
  }
  if (decision === "rejected") {
    return (
      <Note tone="danger">
        Closed without purchase — you rejected the recommendation. All three offers are shown as
        they stood when the decision was made.
      </Note>
    );
  }
  if (decision === "change_requested") {
    return (
      <Note tone="info">
        You asked for changes — the Evaluation agent is pulling updated lead times from all three
        suppliers. This table updates when the revised recommendation returns.
      </Note>
    );
  }
  if (decision === "evidence_requested") {
    return (
      <Note tone="info">
        You asked for more evidence — Farman is requesting on-time delivery records for Summit
        Flexible Packaging references and will add them here.
      </Note>
    );
  }
  return <Note tone="info">{recommendation.because}</Note>;
}

function NextStepCard({ decision }: { decision: Decision }) {
  if (decision !== "pending") return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border-[0.5px] border-borders p-5">
      <div>
        <div className="text-sm">Next: approval</div>
        <p className="mt-1 text-sm text-neutral-500">
          Policy POL-2 requires director sign-off above $10,000 before Farman can execute.
        </p>
      </div>
      <Link
        href="/approvals/apr-1042"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800"
      >
        Review approval
      </Link>
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "good" | "danger" | "info";
  children: React.ReactNode;
}) {
  const styles =
    tone === "good"
      ? "border-green-600 bg-green-50"
      : tone === "danger"
        ? "border-red-600 bg-red-50"
        : "border-neutral-300 bg-surface";
  return (
    <div className={`rounded-md border-l-2 ${styles} p-4 text-sm leading-relaxed`}>
      {children}
    </div>
  );
}

function supplierName(offer: Offer): string {
  return supplierRecords.find((s) => s.id === offer.supplierId)?.name ?? "";
}

function policyName(code: string): string {
  return policies.find((p) => p.code === code)?.name ?? code;
}

function priceNote(offer: Offer): string {
  const delta = offer.total - recommended.total;
  if (delta === 0) return "Lowest price among options that meet your deadline";
  const dir = delta < 0 ? "cheaper" : "more";
  const base = `${money(Math.abs(delta))} ${dir} than the recommendation`;
  if (!offer.meetsDeadline) return `${base} — but misses your Sep 28 deadline`;
  return base;
}
