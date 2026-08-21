import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ScrollText, CheckCircle2, AlertTriangle, Info, CircleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const levelMeta: Record<string, { icon: React.ReactNode; cls: string }> = {
  info: { icon: <Info className="h-3.5 w-3.5" />, cls: "text-info bg-info/10 border-info/25" },
  success: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-good bg-good/10 border-good/25" },
  warning: { icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: "text-warn bg-warn/10 border-warn/25" },
  error: { icon: <CircleAlert className="h-3.5 w-3.5" />, cls: "text-bad bg-bad/10 border-bad/25" },
};

export default async function ActivityPage() {
  const session = await requireSession();
  const logs = await db.activityLog.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Complete audit trail — every agent action, decision and human decision is recorded here. Trust through transparency."
      />

      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={<ScrollText className="h-5 w-5" />} title="No activity yet" />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((l) => {
              const meta = levelMeta[l.level] ?? levelMeta.info;
              return (
                <li key={l.id} className="flex gap-4 px-5 py-3 hover:bg-raised/40 transition-colors">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${meta.cls}`}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-ink">{l.message}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-ink-faint">
                      <span className="font-medium text-ink-dim">{l.actor}</span>
                      <span>·</span>
                      <span className="font-mono">{l.action}</span>
                      {l.requestId && (
                        <>
                          <span>·</span>
                          <a href={`/procurement/requests/${l.requestId}`} className="text-accent hover:underline">
                            view workflow
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="num text-[11px] text-ink-faint shrink-0">{formatDateTime(l.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
