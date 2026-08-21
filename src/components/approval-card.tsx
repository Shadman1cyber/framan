"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveApprovalAction } from "@/server/actions/procurement";
import { Check, X, RotateCcw, Loader2, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/format";

export type RecommendationPayload = {
  supplierName: string;
  unitPrice: number;
  totalPrice: number;
  leadTimeDays: number;
  fitsDeadline: boolean;
  withinBudget: boolean;
  score: number;
  reliabilityScore: number;
  riskLevel: string;
  headline: string;
  why: string[];
  risks: string[];
  approvalRequirements?: { type: string; description: string }[];
  alternatives?: {
    supplierName: string;
    totalPrice: number;
    leadTimeDays: number;
    reliabilityScore: number;
    riskLevel: string;
    score: number;
  }[];
};

export function ApprovalPanel({
  approvalId,
  requestId,
  recommendation,
  decided,
}: {
  approvalId: string | null;
  requestId: string;
  recommendation: RecommendationPayload;
  decided: "pending" | "approved" | "rejected" | "changes_requested";
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const router = useRouter();

  function decide(decision: "approved" | "rejected" | "changes_requested") {
    if (!approvalId) return;
    startTransition(async () => {
      await resolveApprovalAction(approvalId, decision, note || undefined);
      setShowNote(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-warn/30 bg-gradient-to-b from-warn/[0.06] to-transparent overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pt-4">
        <ShieldCheck className="h-4 w-4 text-warn" />
        <h3 className="text-[13px] font-semibold text-ink">FARMAN recommends — your approval required</h3>
      </div>

      <div className="px-5 py-4 grid sm:grid-cols-4 gap-3">
        {[
          ["Supplier", recommendation.supplierName],
          ["Total", formatMoney(recommendation.totalPrice)],
          ["Unit price", formatMoney(recommendation.unitPrice)],
          [
            "Delivery",
            `${recommendation.leadTimeDays} days${recommendation.fitsDeadline ? " ✓ fits deadline" : ""}`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">{label}</p>
            <p className="num mt-0.5 text-sm font-medium text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-5 pb-1">
        <p className="text-[13px] text-ink leading-relaxed">{recommendation.headline}</p>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Why</p>
        <ul className="mt-1.5 space-y-1">
          {recommendation.why.map((w) => (
            <li key={w} className="flex gap-2 text-[13px] text-ink-dim">
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-good" /> {w}
            </li>
          ))}
        </ul>
        {recommendation.risks.length > 0 && (
          <>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Risks & trade-offs</p>
            <ul className="mt-1.5 space-y-1">
              {recommendation.risks.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] text-ink-dim">
                  <span className="mt-0.5 text-warn shrink-0">▲</span> {r}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Alternatives */}
      {recommendation.alternatives && recommendation.alternatives.length > 0 && (
        <div className="px-5 mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">Considered alternatives</p>
          <div className="space-y-1.5 mb-1">
            {recommendation.alternatives.map((a) => (
              <div key={a.supplierName} className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2 text-xs">
                <span className="text-ink-dim">{a.supplierName}</span>
                <span className="num flex items-center gap-3 text-ink-faint">
                  <span>{formatMoney(a.totalPrice, { compact: true })}</span>
                  <span>{a.leadTimeDays}d</span>
                  <span>{Math.round(a.reliabilityScore)}%</span>
                  <span className={a.score >= 80 ? "text-good" : a.score >= 65 ? "text-warn" : "text-bad"}>
                    {a.score.toFixed(0)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision area */}
      <div className="px-5 pb-5 pt-4 border-t border-line/60 mt-4">
        {decided === "pending" ? (
          <>
            {showNote && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Note to FARMAN (optional) — e.g. 'negotiate 60-day terms' or 'avoid this supplier'"
                className="mb-3 w-full rounded-lg bg-bg border border-line px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
              />
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => decide("approved")}
                disabled={pending}
                className="inline-flex items-center gap-2 h-10 rounded-lg bg-good px-5 text-sm font-semibold text-[#052e1c] hover:brightness-110 disabled:opacity-60 transition"
              >
                {pending ? <Loader2 className="h-4 w-4 spin" /> : <Check className="h-4 w-4" />}
                Approve & Execute
              </button>
              <button
                onClick={() => decide("rejected")}
                disabled={pending}
                className="inline-flex items-center gap-2 h-10 rounded-lg border border-bad/40 px-4 text-sm font-medium text-bad hover:bg-bad/10 disabled:opacity-60 transition"
              >
                <X className="h-4 w-4" /> Reject
              </button>
              <button
                onClick={() =>
                  showNote && note.trim()
                    ? decide("changes_requested")
                    : setShowNote(true)
                }
                disabled={pending}
                className="inline-flex items-center gap-2 h-10 rounded-lg border border-line-strong px-4 text-sm font-medium text-ink-dim hover:text-ink hover:bg-raised disabled:opacity-60 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Request Changes{showNote && !note.trim() ? " (add note)" : ""}
              </button>
              {showNote && (
                <button onClick={() => setShowNote(false)} className="text-xs text-ink-faint hover:text-ink-dim">
                  cancel note
                </button>
              )}
            </div>
            <p className="mt-2.5 text-xs text-ink-faint">
              Approving lets FARMAN issue the purchase order, notify the supplier channel and record the financial impact automatically.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Badge decided={decided} />
            <span className="text-ink-faint text-xs">
              {decided === "approved"
                ? "Executed by FARMAN."
                : decided === "rejected"
                  ? "Workflow closed."
                  : "FARMAN re-ran sourcing with your feedback."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ decided }: { decided: string }) {
  const map: Record<string, [string, string]> = {
    approved: ["Approved ✓", "text-good border-good/40 bg-good/10"],
    rejected: ["Rejected", "text-bad border-bad/40 bg-bad/10"],
    changes_requested: ["Changes requested — re-evaluated", "text-warn border-warn/40 bg-warn/10"],
  };
  const [label, cls] = map[decided] ?? [decided, "text-ink-dim"];
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
