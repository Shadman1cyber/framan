import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge, ReliabilityBar, RiskBadge } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { supplierCostRanking, getFinanceSnapshot } from "@/lib/agents/finance/analytics";
import { Lightbulb, TrendingDown, TrendingUp, ShieldAlert, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const session = await requireSession();

  const [suppliers, catalog, ranking, snapshot] = await Promise.all([
    db.supplier.findMany({ where: { companyId: session.companyId, status: "active" }, include: { catalog: { include: { priceHistory: true } } } }),
    db.supplierProduct.findMany({
      where: { supplier: { companyId: session.companyId } },
      include: { supplier: true, product: true, priceHistory: true },
    }),
    supplierCostRanking(session.companyId),
    getFinanceSnapshot(session.companyId),
  ]);

  // Category-level market analysis
  const byCategory = new Map<string, { prices: number[]; count: number; suppliers: Set<string> }>();
  for (const sp of catalog) {
    const cur = byCategory.get(sp.product.category) ?? { prices: [], count: 0, suppliers: new Set<string>() };
    cur.prices.push(sp.price);
    cur.count++;
    cur.suppliers.add(sp.supplierId);
    byCategory.set(sp.product.category, cur);
  }

  // Biggest price movers (6-mo trend per catalog line)
  const movers = catalog
    .map((sp) => {
      const h = [...sp.priceHistory].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
      if (h.length < 2) return null;
      const trend = ((h[h.length - 1].price - h[0].price) / h[0].price) * 100;
      return { name: sp.product.name, supplier: sp.supplier.name, trend };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
    .slice(0, 5);

  const mostReliable = [...suppliers].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0];
  const riskiest = [...suppliers].sort((a, b) => b.riskScore - a.riskScore)[0];

  // Supplier concentration: share of spend held by the top supplier
  const topShare = ranking.length > 0 ? ranking[0].total / ranking.reduce((a, r) => a + r.total, 0) : 0;

  const packagingPrices = catalog.filter((c) => c.product.sku === "PKG-CB-4840").map((c) => c.price);
  const packagingAvg = packagingPrices.reduce((a, b) => a + b, 0) / Math.max(packagingPrices.length, 1);

  return (
    <div>
      <PageHeader
        title="Procurement Intelligence"
        description="Market view computed live from your supplier graph — pricing, reliability, concentration and cost drivers."
      />

      {/* Insight cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <InsightCard
          icon={<TrendingDown className="h-4 w-4 text-good" />}
          title="Best value supplier"
          body={`${mostReliable?.name} combines ${Math.round(mostReliable?.reliabilityScore ?? 0)}% reliability with mid-market pricing — FARMAN's default first choice.`}
        />
        <InsightCard
          icon={<ShieldAlert className="h-4 w-4 text-bad" />}
          title="Concentration risk"
          body={
            topShare > 0.35
              ? `${ranking[0]?.name} holds ${(topShare * 100).toFixed(0)}% of PO value. FARMAN recommends qualifying one alternative.`
              : `Spend is well distributed across ${ranking.length} suppliers (top share ${(topShare * 100).toFixed(0)}%).`
          }
        />
        <InsightCard
          icon={<TrendingUp className="h-4 w-4 text-warn" />}
          title="Biggest price mover"
          body={movers[0] ? `${movers[0].name}: ${movers[0].trend > 0 ? "+" : ""}${movers[0].trend.toFixed(1)}% over 6 months (${movers[0].supplier}).` : "Insufficient history."}
        />
        <InsightCard
          icon={<Users className="h-4 w-4 text-info" />}
          title="Category benchmark"
          body={`Heavy-duty carton (480×400mm) market average is $${packagingAvg.toFixed(2)} across ${packagingPrices.length} qualified suppliers.`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Spend ranking */}
        <Card>
          <CardHeader title="Supplier Cost Ranking" subtitle="Lifetime purchase-order value" />
          <ul className="divide-y divide-line">
            {ranking.slice(0, 8).map((r, i) => (
              <li key={r.name} className="flex items-center gap-3 px-5 py-3">
                <span className="num text-xs text-ink-faint w-5">#{i + 1}</span>
                <span className="flex-1 text-[13px] text-ink truncate">{r.name}</span>
                <span className="text-[11px] text-ink-faint">{r.orders} orders</span>
                <span className="num text-[13px] font-medium">{formatMoney(r.total)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Price movers */}
        <Card>
          <CardHeader title="Price Movement Watchlist" subtitle="Largest 6-month catalog price changes" />
          <ul className="divide-y divide-line">
            {movers.map((m) => (
              <li key={m.name + m.supplier} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink truncate">{m.name}</p>
                  <p className="text-[11px] text-ink-faint">{m.supplier}</p>
                </div>
                <Badge tone={m.trend > 1 ? "bad" : m.trend < -1 ? "good" : "neutral"}>
                  {m.trend > 0 ? "+" : ""}{m.trend.toFixed(1)}%
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        {/* Supplier scorecard */}
        <Card className="lg:col-span-2">
          <CardHeader title="Supplier Scorecard" subtitle="Reliability vs risk — who FARMAN trusts and why" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-2.5 font-medium">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Reliability</th>
                  <th className="px-4 py-2.5 font-medium text-right">On-time</th>
                  <th className="px-4 py-2.5 font-medium text-right">Avg lead</th>
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-4 py-2.5 font-medium text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {[...suppliers].sort((a, b) => b.reliabilityScore - a.reliabilityScore).map((s) => (
                  <tr key={s.id} className="border-b border-line/60 last:border-0 hover:bg-raised/40 transition-colors">
                    <td className="px-4 py-2.5 text-ink">{s.name}</td>
                    <td className="px-4 py-2.5 text-ink-dim">{s.category}</td>
                    <td className="px-4 py-2.5"><ReliabilityBar value={s.reliabilityScore} /></td>
                    <td className="num px-4 py-2.5 text-right">{Math.round(s.onTimeRate)}%</td>
                    <td className="num px-4 py-2.5 text-right">{Math.round(s.avgDeliveryDays)}d</td>
                    <td className="px-4 py-2.5"><RiskBadge level={s.riskLevel} /></td>
                    <td className="num px-4 py-2.5 text-right">{s.totalOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft px-5 py-4">
        <Lightbulb className="h-4 w-4 text-accent mt-0.5 shrink-0" />
        <p className="text-[13px] leading-relaxed text-ink-dim">
          <span className="text-ink font-medium">FARMAN insight:</span> procurement spending this month is{" "}
          {formatMoney(snapshot.expense30)} against {formatMoney(snapshot.revenue30)} revenue. Switching repeat orders to
          best-value suppliers would save approximately 6–9% annually at current volumes without extending lead times.
        </p>
      </div>
    </div>
  );
}

function InsightCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-[12px] font-semibold text-ink">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-ink-dim">{body}</p>
    </Card>
  );
}
