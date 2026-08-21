import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, RiskBadge, ReliabilityBar, Badge } from "@/components/ui";
import { MapPin, Factory } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const session = await requireSession();
  const suppliers = await db.supplier.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ category: "asc" }, { reliabilityScore: "desc" }],
    include: { catalog: { include: { product: true } } },
  });

  const categories = [...new Set(suppliers.map((s) => s.category))];

  return (
    <div>
      <PageHeader
        title="Supplier Network"
        description={`${suppliers.length} active suppliers across ${categories.length} categories — the graph FARMAN sources from.`}
      />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map((s) => (
          <Link key={s.id} href={`/procurement/suppliers/${s.id}`} className="group">
            <Card className="h-full p-5 hover:border-line-strong transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink group-hover:text-accent transition-colors truncate">{s.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-faint">
                    <MapPin className="h-3 w-3" /> {s.location}
                  </p>
                </div>
                <Badge tone="neutral">{s.category}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-y-2.5 text-xs">
                <div>
                  <p className="text-ink-faint">Reliability</p>
                  <div className="mt-1"><ReliabilityBar value={s.reliabilityScore} /></div>
                </div>
                <div className="text-right">
                  <p className="text-ink-faint">Risk</p>
                  <div className="mt-0.5"><RiskBadge level={s.riskLevel} /></div>
                </div>
                <div>
                  <p className="text-ink-faint">On-time</p>
                  <p className="num mt-0.5 text-ink-dim">{Math.round(s.onTimeRate)}%</p>
                </div>
                <div className="text-right">
                  <p className="text-ink-faint">Avg delivery</p>
                  <p className="num mt-0.5 text-ink-dim">{Math.round(s.avgDeliveryDays)} days</p>
                </div>
              </div>

              <div className="mt-3.5 pt-3 border-t border-line/70 flex items-center justify-between text-xs text-ink-faint">
                <span className="flex items-center gap-1.5">
                  <Factory className="h-3 w-3" /> {s.catalog.length} catalog items
                </span>
                <span>{s.totalOrders} orders</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
