import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge, EmptyState } from "@/components/ui";
import { CategoryBars } from "@/components/charts";
import { formatMoney, formatDate } from "@/lib/format";
import { CircleAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const session = await requireSession();
  const expenses = await db.expense.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ flagged: "desc" }, { amount: "desc" }],
  });

  // Aggregate by category (budget is per-category)
  const byCat = new Map<string, { total: number; budget: number | null }>();
  for (const e of expenses) {
    const cur = byCat.get(e.category) ?? { total: 0, budget: null };
    cur.total += e.amount;
    if (e.monthlyBudget != null) cur.budget = Math.max(cur.budget ?? 0, e.monthlyBudget);
    byCat.set(e.category, cur);
  }
  const catRows = [...byCat.entries()]
    .map(([label, v]) => ({ label, value: v.total, budget: v.budget }))
    .sort((a, b) => b.value - a.value);

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const totalBudget = catRows.reduce((a, r) => a + (r.budget ?? 0), 0);
  const flagged = expenses.filter((e) => e.flagged);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={`${formatMoney(total)} this month across ${catRows.length} categories · ${totalBudget ? `${((total / totalBudget) * 100).toFixed(0)}% of allocated budget` : ""}`}
      />

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start">
        <Card>
          <CardHeader title="Budget Utilization" subtitle="Spend vs monthly allocation" />
          <div className="p-5">
            {catRows.length === 0 ? (
              <EmptyState title="No expenses recorded" />
            ) : (
              <>
                <CategoryBars data={catRows.slice(0, 8)} />
                <p className="mt-4 text-xs text-ink-faint">
                  Vertical marker = category budget. Amber/red indicates ≥90/≥100% utilization.
                </p>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Expense Ledger"
            subtitle="Current month"
            action={flagged.length > 0 ? <Badge tone="warn">{flagged.length} flagged</Badge> : undefined}
          />
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className={`px-5 py-3 ${e.flagged ? "bg-warn/[0.04]" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink flex items-center gap-2">
                      {e.flagged && <CircleAlert className="h-3.5 w-3.5 text-warn shrink-0" />}
                      {e.description}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">{e.vendor} · {e.category} · {formatDate(e.date)}</p>
                    {e.flagged && e.flagReason && (
                      <p className="mt-1.5 text-xs text-warn">{e.flagReason}</p>
                    )}
                  </div>
                  <span className={`num text-[13px] font-medium shrink-0 ${e.flagged ? "text-warn" : ""}`}>
                    {formatMoney(e.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
