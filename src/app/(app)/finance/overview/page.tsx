import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFinanceSnapshot } from "@/lib/agents/finance/analytics";
import { Card, CardHeader, PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { IncomeExpenseBars } from "@/components/charts";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinanceOverviewPage() {
  const session = await requireSession();
  const snap = await getFinanceSnapshot(session.companyId);
  const customers = await db.customer.findMany({
    where: { companyId: session.companyId },
    orderBy: { revenueYtd: "desc" },
  });

  const netMargin = snap.revenue30 > 0 ? ((snap.revenue30 - snap.expense30) / snap.revenue30) * 100 : null;

  return (
    <div>
      <PageHeader
        title="Finance Overview"
        description="The operational nervous system — every business decision FARMAN executes lands here as a financial consequence."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cash position" value={formatMoney(snap.cash)} tone="good" sub="Across all accounts" />
        <StatCard label="Revenue (30d)" value={formatMoney(snap.revenue30)} sub={`Expenses ${formatMoney(snap.expense30)}`} />
        <StatCard label="Net margin (30d)" value={netMargin == null ? "—" : `${netMargin.toFixed(1)}%`} tone={netMargin != null && netMargin > 15 ? "good" : "warn"} sub="After all operating costs" />
        <StatCard label="90-day forecast" value={formatMoney(snap.forecast90)} tone={snap.forecast90 >= snap.cash ? "good" : "warn"} sub="Trend-based projection" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
        <Card>
          <CardHeader title="Income vs Expenses" subtitle="Trailing 6 months" />
          <div className="p-5">
            <IncomeExpenseBars data={snap.monthly} />
            <div className="mt-4 flex items-center gap-5 text-xs text-ink-faint">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good/80" /> Income</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad/70" /> Expenses</span>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Working Capital" />
            <ul className="divide-y divide-line text-[13px]">
              <li className="flex justify-between px-5 py-3"><span className="text-ink-dim">Accounts payable</span><span className="num text-warn">{formatMoney(snap.payables)}</span></li>
              <li className="flex justify-between px-5 py-3"><span className="text-ink-dim">Accounts receivable</span><span className="num text-good">{formatMoney(snap.receivables)}</span></li>
              <li className="flex justify-between px-5 py-3"><span className="text-ink-dim">Avg daily net (90d)</span><span className={`num ${snap.avgDailyNet >= 0 ? "text-good" : "text-bad"}`}>{formatMoney(snap.avgDailyNet)}</span></li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="Customers by YTD Revenue" action={<Badge>{customers.length} active</Badge>} />
            <ul className="divide-y divide-line">
              {customers.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <div>
                    <p className="text-ink">{c.name}</p>
                    <p className="text-[11px] text-ink-faint">{c.industry} · {c.country}</p>
                  </div>
                  <span className="num font-medium">{formatMoney(c.revenueYtd)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent Transactions" subtitle="Ledger feed across procurement, sales and operations" />
        {snap.recentTxns.length === 0 ? (
          <EmptyState title="No transactions recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {snap.recentTxns.map((t) => (
                  <tr key={t.id} className="border-b border-line/60 last:border-0 hover:bg-raised/40 transition-colors">
                    <td className="num px-4 py-2.5 text-ink-faint">{formatDate(t.date)}</td>
                    <td className="px-4 py-2.5 max-w-[360px] truncate">{t.description}</td>
                    <td className="px-4 py-2.5 text-ink-dim">{t.category}</td>
                    <td className="px-4 py-2.5"><Badge tone={t.status === "cleared" ? "neutral" : t.status === "pending" ? "warn" : "info"}>{t.status}</Badge></td>
                    <td className={`num px-4 py-2.5 text-right font-medium ${t.type === "income" ? "text-good" : "text-ink"}`}>
                      {t.type === "income" ? "+" : "−"}{formatMoney(t.amount)}
                    </td>
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
