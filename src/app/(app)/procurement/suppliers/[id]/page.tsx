import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, RiskBadge, ReliabilityBar, Badge, ScorePill } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/format";
import { ArrowLeft, Mail, Phone, User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      catalog: {
        include: {
          product: true,
          priceHistory: { orderBy: { recordedAt: "asc" } },
        },
      },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 8, include: { items: true } },
    },
  });
  if (!supplier || supplier.companyId !== session.companyId) notFound();

  // Price movement per catalog item (first vs last history point)
  const priceTrend = (h: { price: number; recordedAt: Date }[]) => {
    if (h.length < 2) return null;
    const first = h[0].price;
    const last = h[h.length - 1].price;
    return ((last - first) / first) * 100;
  };

  return (
    <div>
      <Link href="/procurement/suppliers" className="inline-flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-dim transition-colors mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Supplier network
      </Link>

      <PageHeader
        title={supplier.name}
        description={`${supplier.category} · ${supplier.location}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={supplier.status === "active" ? "good" : "warn"}>{supplier.status}</Badge>
            <RiskBadge level={supplier.riskLevel} />
          </div>
        }
      />

      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
        {/* Profile */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Performance Profile" />
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-ink-faint mb-1">Reliability score</p>
                <ReliabilityBar value={supplier.reliabilityScore} />
              </div>
              <div className="grid grid-cols-2 gap-y-3 text-sm">
                <div><p className="text-xs text-ink-faint">On-time rate</p><p className="num mt-0.5">{Math.round(supplier.onTimeRate)}%</p></div>
                <div><p className="text-xs text-ink-faint">Avg delivery</p><p className="num mt-0.5">{Math.round(supplier.avgDeliveryDays)} days</p></div>
                <div><p className="text-xs text-ink-faint">Completed orders</p><p className="num mt-0.5">{supplier.totalOrders}</p></div>
                <div><p className="text-xs text-ink-faint">Risk score</p><p className="num mt-0.5">{Math.round(supplier.riskScore)}/100</p></div>
              </div>
              {supplier.notes && (
                <div className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-xs text-warn">
                  {supplier.notes}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <ul className="p-5 pt-3 space-y-2 text-[13px] text-ink-dim">
              <li className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-ink-faint" />{supplier.contactName ?? "—"}</li>
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-ink-faint" />{supplier.contactEmail ?? "—"}</li>
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-ink-faint" /><span className="num">{supplier.contactPhone ?? "—"}</span></li>
            </ul>
          </Card>
        </div>

        {/* Catalog + price history + orders */}
        <div className="space-y-5">
          <Card>
            <CardHeader title={`Catalog — ${supplier.catalog.length} items`} subtitle="Live pricing with quarterly trend from price history" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium text-right">Price</th>
                    <th className="px-4 py-2.5 font-medium text-right">Lead</th>
                    <th className="px-4 py-2.5 font-medium text-right">Min qty</th>
                    <th className="px-4 py-2.5 font-medium text-right">6-mo trend</th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.catalog.map((sp) => {
                    const trend = priceTrend(sp.priceHistory);
                    return (
                      <tr key={sp.id} className="border-b border-line/60 last:border-0 hover:bg-raised/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="text-ink">{sp.product.name}</p>
                          <p className="text-[11px] text-ink-faint font-mono">{sp.product.sku}</p>
                        </td>
                        <td className="num px-4 py-2.5 text-right">{formatMoney(sp.price, { compact: true })}<span className="text-ink-faint">/{sp.product.unit}</span></td>
                        <td className="num px-4 py-2.5 text-right">{sp.leadTimeDays}d</td>
                        <td className="num px-4 py-2.5 text-right">{sp.minOrderQty.toLocaleString()}</td>
                        <td className="num px-4 py-2.5 text-right">
                          {trend == null ? "—" : (
                            <span className={trend > 1 ? "text-bad" : trend < -1 ? "text-good" : "text-ink-dim"}>
                              {trend > 0 ? "+" : ""}{trend.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent Orders" action={<Link href="/procurement/orders" className="text-xs text-accent hover:underline">All orders →</Link>} />
            {supplier.purchaseOrders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-faint">No orders with this supplier yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {supplier.purchaseOrders.map((po) => (
                  <li key={po.id} className="flex items-center justify-between px-5 py-3 text-[13px]">
                    <div>
                      <p className="font-mono text-accent">{po.poNumber}</p>
                      <p className="text-xs text-ink-faint mt-0.5">{po.items.map((i) => i.description).join(", ").slice(0, 80)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-medium">{formatMoney(po.total)}</p>
                      <p className="mt-0.5 flex items-center gap-2 justify-end">
                        <Badge tone={po.status === "delivered" ? "good" : "info"}>{po.status}</Badge>
                        <span className="text-[11px] text-ink-faint">{formatDate(po.createdAt)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {supplier.catalog[0]?.priceHistory && supplier.catalog[0].priceHistory.length > 1 && (
            <Card>
              <CardHeader
                title="Sample Price History"
                subtitle={`${supplier.catalog[0].product.name} — last 6 months`}
              />
              <div className="p-5">
                <MiniPriceLine points={supplier.catalog[0].priceHistory.map((h) => h.price)} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniPriceLine({ points }: { points: number[] }) {
  const w = 560, h = 120, pad = 10;
  const min = Math.min(...points) * 0.98;
  const max = Math.max(...points) * 1.02;
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <path d={d} fill="none" stroke="#17b8a6" strokeWidth="2" strokeLinecap="round" />
      {points.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3" fill="#0a0d12" stroke="#17b8a6" strokeWidth="1.5" />
          <text x={x(i)} y={y(v) - 9} textAnchor="middle" fontSize="10" fill="#9aa4ba" className="num">{formatMoney(v, { compact: true })}</text>
        </g>
      ))}
    </svg>
  );
}
