import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { PlusCircle, Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

const statusTone: Record<string, Tone> = {
  processing: "info",
  awaiting_approval: "warn",
  approved: "accent",
  rejected: "bad",
  changes_requested: "warn",
  completed: "good",
  failed: "bad",
};

const statusLabel: Record<string, string> = {
  processing: "Processing",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  completed: "Completed",
  failed: "Failed",
};

export default async function RequestsPage() {
  const session = await requireSession();
  const requests = await db.purchaseRequest.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    include: { approval: true },
  });

  return (
    <div>
      <PageHeader
        title="Purchase Requests"
        description="Every request is executed by the Procurement Agent through a transparent, inspectable workflow."
        actions={
          <Link
            href="/procurement/requests/new"
            className="inline-flex items-center gap-2 h-9 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-[#04211d] hover:bg-accent-strong transition-colors"
          >
            <PlusCircle className="h-4 w-4" /> New Request
          </Link>
        }
      />

      <Card>
        {requests.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No purchase requests yet"
            description="Create your first request and watch FARMAN source suppliers, compare offers and prepare execution."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Needed by</th>
                  <th className="px-4 py-3 font-medium">Recommended total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const rec = r.recommendation as Record<string, unknown> | null;
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/procurement/requests/${r.id}`} className="font-medium text-ink hover:text-accent transition-colors">
                          {r.title}
                        </Link>
                        <p className="text-xs text-ink-faint mt-0.5 line-clamp-1">{r.itemDescription}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-dim">{r.category}</td>
                      <td className="num px-4 py-3 text-ink-dim">{r.quantity.toLocaleString()} {r.unit}</td>
                      <td className="num px-4 py-3 text-ink-dim">{formatDate(r.neededBy)}</td>
                      <td className="num px-4 py-3 text-ink">
                        {rec?.totalPrice ? formatMoney(Number(rec.totalPrice)) : "—"}
                      </td>
                      <td className="px-4 py-3"><Badge tone={statusTone[r.status] ?? "neutral"}>{statusLabel[r.status] ?? r.status}</Badge></td>
                      <td className="num px-4 py-3 text-ink-faint">{formatDate(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
