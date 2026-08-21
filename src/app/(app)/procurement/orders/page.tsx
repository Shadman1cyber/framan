import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/format";
import type { Tone } from "@/components/ui";
import { PackageOpen } from "lucide-react";

export const dynamic = "force-dynamic";

const poTone: Record<string, Tone> = {
  issued: "info",
  confirmed: "info",
  shipped: "accent",
  delivered: "good",
  cancelled: "bad",
};

export default async function OrdersPage() {
  const session = await requireSession();
  const orders = await db.purchaseOrder.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    include: { supplier: true, items: true },
  });

  const totalSpend = orders.reduce((a, o) => a + o.total, 0);
  const openOrders = orders.filter((o) => ["issued", "confirmed", "shipped"].includes(o.status));

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description={`${orders.length} orders · ${formatMoney(totalSpend)} lifetime value · ${openOrders.length} in flight`}
      />

      <Card>
        {orders.length === 0 ? (
          <EmptyState icon={<PackageOpen className="h-5 w-5" />} title="No purchase orders yet" description="Approve a recommendation and FARMAN will issue the PO here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-medium">PO</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Expected</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50 transition-colors">
                    <td className="px-4 py-3">
                      {o.requestId ? (
                        <Link href={`/procurement/requests/${o.requestId}`} className="font-mono text-accent hover:underline">{o.poNumber}</Link>
                      ) : (
                        <span className="font-mono">{o.poNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/procurement/suppliers/${o.supplierId}`} className="hover:text-accent transition-colors">{o.supplier.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim max-w-[280px] truncate">{o.items.map((i) => i.description).join(", ")}</td>
                    <td className="num px-4 py-3 text-right font-medium">{formatMoney(o.total)}</td>
                    <td className="num px-4 py-3 text-ink-dim">{formatDate(o.expectedDelivery)}</td>
                    <td className="px-4 py-3"><Badge tone={poTone[o.status] ?? "neutral"}>{o.status}</Badge></td>
                    <td className="num px-4 py-3 text-ink-faint">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
