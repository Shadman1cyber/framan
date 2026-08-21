import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { Card, CardHeader, PageHeader, Badge, ScorePill, RiskBadge, EmptyState } from "@/components/ui";
import { WorkflowTimeline, type TimelineStage } from "@/components/workflow-timeline";
import { ApprovalPanel, type RecommendationPayload } from "@/components/approval-card";
import { APPROVAL_STATUS } from "@/lib/domain";
import { ArrowLeft, FileText, CircleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();

  const request = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      approval: true,
      purchaseOrder: true,
      stages: { orderBy: { sortOrder: "asc" } },
      offers: {
        orderBy: { rank: "asc" },
        include: { supplier: true },
      },
    },
  });
  if (!request || request.companyId !== session.companyId) notFound();

  const rec = request.recommendation as unknown as RecommendationPayload | null;
  const fresh = sp.fresh === "1" && (request.status === "awaiting_approval" || request.status === "processing");

  return (
    <div>
      <Link href="/procurement/requests" className="inline-flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-dim transition-colors mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> All requests
      </Link>

      <PageHeader
        title={request.title}
        description={`${request.quantity.toLocaleString()} × ${request.itemDescription} · needed ${formatDate(request.neededBy)}${request.budget ? ` · budget ${formatMoney(request.budget)}` : ""}`}
        actions={
          <Badge tone={request.status === "completed" ? "good" : request.status === "awaiting_approval" ? "warn" : request.status === "failed" ? "bad" : "info"}>
            {request.status.replace(/_/g, " ")}
          </Badge>
        }
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        {/* Left: workflow + offers */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="AI Workflow" subtitle="Every step FARMAN executed, with reasoning — fully inspectable" />
            <div className="px-6 py-5">
              <WorkflowTimeline
                fresh={fresh}
                stages={request.stages.map(
                  (s): TimelineStage => ({
                    key: s.key,
                    label: s.label,
                    status: s.status,
                    summary: s.summary,
                    startedAt: s.startedAt?.toISOString() ?? null,
                    completedAt: s.completedAt?.toISOString() ?? null,
                  })
                )}
              />
            </div>
          </Card>

          {/* Offer comparison */}
          {request.offers.length > 0 && (
            <Card>
              <CardHeader title={`Supplier Comparison — ${request.offers.length} offers`} subtitle="Weighted score: price 40% · delivery fit 25% · reliability 20% − risk penalty" />
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-2.5 font-medium">Supplier</th>
                      <th className="px-4 py-2.5 font-medium text-right">Unit</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total</th>
                      <th className="px-4 py-2.5 font-medium text-right">Lead</th>
                      <th className="px-4 py-2.5 font-medium">Reliability</th>
                      <th className="px-4 py-2.5 font-medium">Risk</th>
                      <th className="px-4 py-2.5 font-medium text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.offers.map((o) => (
                      <tr key={o.id} className={`border-b border-line/60 last:border-0 ${o.selected ? "bg-accent-soft/50" : ""}`}>
                        <td className="px-4 py-2.5">
                          <Link href={`/procurement/suppliers/${o.supplierId}`} className="font-medium hover:text-accent transition-colors flex items-center gap-2">
                            {o.supplier.name}
                            {o.selected && <Badge tone="accent">Selected</Badge>}
                          </Link>
                          <p className="text-[11px] text-ink-faint">{o.supplier.location}</p>
                        </td>
                        <td className="num px-4 py-2.5 text-right">{formatMoney(o.unitPrice, { compact: true })}</td>
                        <td className="num px-4 py-2.5 text-right">{formatMoney(o.totalPrice, { compact: true })}</td>
                        <td className="num px-4 py-2.5 text-right">{o.leadTimeDays}d {!o.fitsDeadline && <span className="text-bad">⚠</span>}</td>
                        <td className="px-4 py-2.5">{Math.round(o.supplier.reliabilityScore)}%</td>
                        <td className="px-4 py-2.5"><RiskBadge level={o.supplier.riskLevel} /></td>
                        <td className="px-4 py-2.5 text-right"><ScorePill score={o.score} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Purchase order result */}
          {request.purchaseOrder && (
            <Card>
              <CardHeader title="Purchase Order" subtitle="Generated automatically after your approval" action={<Link href="/procurement/orders" className="text-xs text-accent hover:underline">All orders →</Link>} />
              <div className="p-5 grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">PO Number</p>
                  <p className="num mt-0.5 text-sm font-mono font-medium text-accent">{request.purchaseOrder.poNumber}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Total (incl. 9% tax)</p>
                  <p className="num mt-0.5 text-sm font-semibold">{formatMoney(request.purchaseOrder.total)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Expected delivery</p>
                  <p className="num mt-0.5 text-sm">{formatDate(request.purchaseOrder.expectedDelivery)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Status</p>
                  <p className="mt-0.5"><Badge tone="good">{request.purchaseOrder.status}</Badge></p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Issued</p>
                  <p className="num mt-0.5 text-sm">{formatDateTime(request.purchaseOrder.sentAt)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-ink-faint">Supplier channel</p>
                  <p className="mt-0.5 text-sm"><Badge tone="accent">Confirmed by supplier (simulated)</Badge></p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right column: parsed requirement + recommendation/approval */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Parsed Requirement" />
            <div className="p-5 space-y-3">
              <p className="text-[13px] leading-relaxed text-ink-dim">{request.parsedSummary ?? "Parsing…"}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone="info">{request.category}</Badge>
                <Badge>{request.priority} priority</Badge>
                {request.budget ? <Badge tone="neutral">budget {formatMoney(request.budget)}</Badge> : null}
              </div>
            </div>
          </Card>

          {rec && (
            <ApprovalPanel
              approvalId={request.approval?.id ?? null}
              requestId={request.id}
              recommendation={rec}
              decided={(request.approval?.status as "pending" | "approved" | "rejected" | "changes_requested") ?? "pending"}
            />
          )}

          {request.status === "failed" && (
            <Card>
              <EmptyState
                icon={<CircleAlert className="h-5 w-5 text-bad" />}
                title="Workflow failed"
                description="FARMAN could not complete this workflow. See the activity log for details."
              />
            </Card>
          )}

          {/* Finance impact after execution */}
          {request.purchaseOrder && (
            <Card>
              <CardHeader title="Financial Impact" subtitle="Recorded by the AI CFO" action={<FileText className="h-4 w-4 text-ink-faint" />} />
              <ul className="p-5 pt-3 space-y-2 text-[13px] text-ink-dim">
                <li className="flex justify-between"><span>Pending payable created</span><span className="num text-ink">{formatMoney(request.purchaseOrder.total)}</span></li>
                <li className="flex justify-between"><span>Category</span><span>Procurement</span></li>
                <li className="flex justify-between"><span>Cash flow effect</span><span className="text-warn">Outflow on delivery</span></li>
                <li className="pt-1 border-t border-line/60">
                  <Link href="/finance/cashflow" className="text-accent hover:underline text-xs">See updated cash flow →</Link>
                </li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
