"use client";

import Link from "next/link";
import { useDemo } from "@/lib/store";
import {
  budgetCategories,
  company,
  transactionsSeed,
} from "@/lib/mock-data";
import type { Transaction } from "@/lib/types";
import { money, signedMoney } from "@/lib/format";
import { MetricGroup, Metric, PageHeader } from "@/components/ui";

export default function FinancePage() {
  const { decision } = useDemo();

  const pending: Transaction = {
    id: "txn-1042",
    label: "Q4 packaging — Packline Industries (PR-1042)",
    workflowId: "wf-1042",
    amount: -15500,
    state:
      decision === "approved"
        ? "scheduled"
        : decision === "rejected"
          ? "posted"
          : "held_pending_approval",
    timing:
      decision === "approved"
        ? "Scheduled Oct 1 · Net 30"
        : decision === "rejected"
          ? "Never charged — order closed"
          : "Held pending your approval",
  };

  const rows = [pending, ...transactionsSeed];
  const packaging = budgetCategories.find((c) => c.id === "cat-packaging");

  return (
    <div>
      <PageHeader
        title="Finance"
        meta="What Farman spends, what it commits, and what it holds for you."
      />

      <MetricGroup>
        <Metric label="Cash position" value={money(company.cashPosition)} />
        <Metric
          label="Committed this month"
          value={money(budgetCategories.reduce((s, c) => s + c.committed, 0))}
          note="Across all categories"
        />
        <Metric
          label="Held for approval"
          value={decision === "approved" ? money(0) : money(15500)}
          note={decision === "approved" ? "Released to schedule" : "Awaiting your decision"}
        />
      </MetricGroup>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Category budgets</h2>
        <div className="border-[0.5px] border-borders">
          {budgetCategories.map((c) => {
            const remaining = c.monthlyCap - c.committed;
            const pct = Math.round((c.committed / c.monthlyCap) * 100);
            return (
              <div key={c.id} className="-mt-[0.5px] px-4 py-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                  <span>{c.name}</span>
                  <span className="tnum text-neutral-500">
                    {money(c.committed)} of {money(c.monthlyCap)} cap · {money(remaining)} left
                  </span>
                </div>
                <div className="mt-2 h-1 w-full bg-surface">
                  <div
                    className={`h-full ${pct > 90 ? "bg-red-600" : "bg-neutral-700"}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          Packaging is the only category affected by the current recommendation; after it,
          {" "}
          {money((packaging?.monthlyCap ?? 0) - (packaging?.committed ?? 0) - 15500)} remains.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Recent transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-left font-medium text-neutral-500">
                  Transaction
                </th>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-right font-medium text-neutral-500">
                  Amount
                </th>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-left font-medium text-neutral-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="border-[0.5px] border-borders px-4 py-2.5">
                    {t.workflowId ? (
                      <Link href={`/workflows/${t.workflowId}`} className="underline hover:text-neutral-600">
                        {t.label}
                      </Link>
                    ) : (
                      t.label
                    )}
                    <span className="block text-xs text-neutral-400">{t.timing}</span>
                  </td>
                  <td className="tnum border-[0.5px] border-borders px-4 py-2.5 text-right">
                    {signedMoney(t.amount)}
                  </td>
                  <td className="border-[0.5px] border-borders px-4 py-2.5">
                    <TransactionState state={t.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TransactionState({ state }: { state: Transaction["state"] }) {
  const map: Record<Transaction["state"], { label: string; cls: string }> = {
    posted: { label: "Posted", cls: "text-green-700" },
    scheduled: { label: "Scheduled", cls: "text-neutral-500" },
    held_pending_approval: { label: "Held pending approval", cls: "text-amber-700" },
    retry_queued: { label: "Retry queued — ERP sync", cls: "text-red-700" },
  };
  const s = map[state];
  return <span className={`text-sm ${s.cls}`}>{s.label}</span>;
}
