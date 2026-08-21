import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { ApprovalPanel, type RecommendationPayload } from "@/components/approval-card";
import { formatMoney, timeAgo } from "@/lib/format";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await requireSession();
  const approvals = await db.approval.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { request: true },
  });

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="FARMAN never executes consequential actions without you. High-value orders, new suppliers and unusual prices pause here."
      />

      {approvals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5 text-good" />}
            title="Approval queue is empty"
            description="When a workflow requires human judgment, it will appear here with FARMAN's full reasoning."
          />
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <Badge tone="warn">{pending.length} pending</Badge>
              <span className="text-xs text-ink-faint">Workflows are paused until you decide.</span>
            </div>
          )}

          <div className="space-y-6">
            {pending.map((a) => {
              if (!a.request) return null;
              const rec = a.payloadJson as unknown as RecommendationPayload | null;
              return (
                <div key={a.id}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <Link href={`/procurement/requests/${a.requestId}`} className="text-[13px] font-medium hover:text-accent transition-colors">
                      {a.request.title} <span className="text-ink-faint font-normal">· requested {timeAgo(a.createdAt)}</span>
                    </Link>
                  </div>
                  {rec && <ApprovalPanel approvalId={a.id} requestId={a.request.id} recommendation={rec} decided="pending" />}
                </div>
              );
            })}
          </div>

          {decided.length > 0 && (
            <Card className="mt-6">
              <div className="px-5 pt-4 pb-3 border-b border-line">
                <h2 className="text-[13px] font-semibold tracking-wide uppercase text-ink">Decision history</h2>
              </div>
              <ul className="divide-y divide-line">
                {decided.map((a) => {
                  const rec = a.payloadJson as unknown as RecommendationPayload | null;
                  return (
                    <li key={a.id} className="flex items-center gap-4 px-5 py-3.5">
                      <Badge tone={a.status === "approved" ? "good" : a.status === "rejected" ? "bad" : "warn"}>
                        {a.status.replace("_", " ")}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-ink truncate">{a.title}</p>
                        {a.request && (
                          <Link href={`/procurement/requests/${a.requestId}`} className="text-[11px] text-accent hover:underline">
                            {a.request.title}
                          </Link>
                        )}
                      </div>
                      <span className="num text-[13px] font-medium shrink-0">
                        {rec ? formatMoney(rec.totalPrice) : "—"}
                      </span>
                      <span className="text-[11px] text-ink-faint shrink-0 w-20 text-right">{a.decidedAt ? timeAgo(a.decidedAt) : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
