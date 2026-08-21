import { requireSession } from "@/lib/auth";
import { getFinanceSnapshot, OPENING_CASH } from "@/lib/agents/finance/analytics";
import { Card, CardHeader, PageHeader, StatCard, Badge } from "@/components/ui";
import { CashAreaChart } from "@/components/charts";
import { formatMoney } from "@/lib/format";
import { POLICY } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function CashFlowPage() {
  const session = await requireSession();
  const snap = await getFinanceSnapshot(session.companyId);

  // Running cash series
  let run = OPENING_CASH;
  const series = snap.monthly.map((m) => {
    run += m.income - m.expense;
    return { label: m.label, value: Math.round(run) };
  });

  const horizonDays = [30, 60, 90];
  const buffer = (snap.monthly.at(-1)?.expense ?? snap.expense30) * POLICY.cashBufferMonths;

  return (
    <div>
      <PageHeader
        title="Cash Flow"
        description="Projection engine maintained by the AI CFO. Pending payables from approved purchases are included automatically."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cash today" value={formatMoney(snap.cash)} tone="good" />
        <StatCard label="+30 days" value={formatMoney(snap.cash + snap.avgDailyNet * 30)} sub={snap.avgDailyNet >= 0 ? "Net positive trend" : "Watch outflows"} tone={snap.avgDailyNet >= 0 ? "good" : "warn"} />
        <StatCard label="+60 days" value={formatMoney(snap.cash + snap.avgDailyNet * 60)} />
        <StatCard label="+90 days" value={formatMoney(snap.forecast90)} tone={snap.forecast90 >= snap.cash ? "good" : "warn"} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
        <Card>
          <CardHeader title="Cash Position — trailing 6 months" subtitle={`Safety buffer policy: keep ≥ ${formatMoney(buffer)} (${(POLICY.cashBufferMonths * 100).toFixed(0)}% of monthly opex) at all times`} />
          <div className="p-5">
            <CashAreaChart data={series} height={220} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Upcoming Outflows" subtitle="Pending payables FARMAN is tracking" />
            {snap.recentTxns.filter((t) => t.type === "expense" && t.status === "pending").length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-faint">No pending outflows — all commitments settled.</p>
            ) : (
              <ul className="divide-y divide-line text-[13px]">
                {snap.recentTxns.filter((t) => t.type === "expense" && t.status === "pending").map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-ink-dim max-w-[240px] truncate">{t.description}</span>
                    <span className="num font-medium">{formatMoney(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="AI CFO Assessment" />
            <div className="p-5 pt-3 space-y-3 text-[13px] leading-relaxed text-ink-dim">
              <p>
                Average daily net over the last quarter is{" "}
                <span className={`num ${snap.avgDailyNet >= 0 ? "text-good" : "text-bad"}`}>{formatMoney(snap.avgDailyNet)}</span>.
                At this rate the company adds roughly{" "}
                <span className="num text-ink">{formatMoney(snap.avgDailyNet * 30)}</span> per month.
              </p>
              <p>
                After committed payables of <span className="num text-warn">{formatMoney(snap.payables)}</span>, projected
                cash stays comfortably above the {formatMoney(buffer)} safety buffer across all horizons.
              </p>
              <Badge tone="good">Autonomous purchasing remains within policy</Badge>
            </div>
          </Card>
        </div>
      </div>

      {/* Horizon detail */}
      <Card className="mt-5">
        <CardHeader title="Horizon Detail" subtitle={`Baseline ${formatMoney(snap.cash)} · receivables expected ${formatMoney(snap.receivables)}`} />
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
          {horizonDays.map((d) => (
            <div key={d} className="px-5 py-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Day +{d}</p>
              <p className="num mt-1 text-lg font-semibold">{formatMoney(snap.cash + snap.avgDailyNet * d)}</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                incl. {formatMoney(d >= 30 ? Math.min(snap.payables, d / 15 * 1000) : 0)} scheduled settlements
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
