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
import { MiniBars, UsageBar } from "@/components/charts";
import { spendLast14Days } from "@/lib/mock-data";

export default function FinancePage() {
  const { decision } = useDemo();

  const pending: Transaction = {
    id: "txn-1042",
    label: "Q4 packaging — Packline Industries (PR-1042)",
    workflowId: "wf-1042",
    amount: -155000000,
    state:
      decision === "approved"
        ? "scheduled"
        : decision === "rejected"
          ? "posted"
          : "held_pending_approval",
    timing:
      decision === "approved"
        ? "زمان‌بندی ۱ اکتبر · خالص ۳۰ روز"
        : decision === "rejected"
          ? "هیچ هزینه‌ای نشد — سفارش بسته شد"
          : "نگه‌داشته تا تأیید شما",
  };

  const rows = [pending, ...transactionsSeed];
  const packaging = budgetCategories.find((c) => c.id === "cat-packaging");

  return (
    <div>
      <PageHeader
        title="مالی"
        meta="آنچه فرمان خرج می‌کند، تعهد می‌بندد و برای شما نگه می‌دارد."
      />

      <MetricGroup>
        <Metric label="موجودی نقد" value={money(company.cashPosition)} />
        <Metric
          label="تعهدشده این ماه"
          value={money(budgetCategories.reduce((s, c) => s + c.committed, 0))}
          note="در همهٔ دسته‌ها"
        />
        <Metric
          label="نگه‌داشته برای تأیید"
          value={decision === "approved" ? money(0) : money(155000000)}
          note={decision === "approved" ? "برای زمان‌بندی آزاد شد" : "در انتظار تصمیم شما"}
        />
      </MetricGroup>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">بودجهٔ دسته‌ها</h2>
        <div className="border-[0.5px] border-borders">
          {budgetCategories.map((c) => {
            const remaining = c.monthlyCap - c.committed;
            return (
              <div key={c.id} className="-mt-[0.5px] px-4 py-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                  <span>{c.name}</span>
                  <span className="tnum text-neutral-500">
                    {money(c.committed)} از سقف {money(c.monthlyCap)} · {money(remaining)} باقی است
                  </span>
                </div>
                <div className="mt-2">
                  <UsageBar used={c.committed} cap={c.monthlyCap} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          بسته‌بندی تنها دستهٔ متأثر از پیشنهاد فعلی است؛ پس از آن، {" "}
          {money((packaging?.monthlyCap ?? 0) - (packaging?.committed ?? 0) - 155000000)} باقی می‌مانَد.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-sm font-medium">هزینهٔ ۱۴ روز اخیر</h2>
        <p className="mb-4 text-sm text-neutral-500">
          بلندی هر ستون، مجموع هزینهٔ آن روز است؛ امروز با رنگ تیره مشخص شده.
        </p>
        <MiniBars
          points={spendLast14Days.map((d) => ({
            label: d.label,
            value: d.amount,
            display: money(d.amount),
          }))}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">تراکنش‌های اخیر</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-left font-medium text-neutral-500">
                  تراکنش
                </th>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-right font-medium text-neutral-500">
                  مبلغ
                </th>
                <th className="border-[0.5px] border-borders bg-surface px-4 py-2 text-left font-medium text-neutral-500">
                  وضعیت
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="border-[0.5px] border-borders px-4 py-2.5">
                    {t.workflowId ? (
                      <Link href={`/workflows/${t.workflowId}`} className="text-brand underline hover:text-brand-hover">
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
    posted: { label: "ثبت‌شده", cls: "text-green-700" },
    scheduled: { label: "زمان‌بندی‌شده", cls: "text-neutral-500" },
    held_pending_approval: { label: "نگه‌داشته تا تأیید", cls: "text-amber-700" },
    retry_queued: { label: "تلاش مجدد — همگام‌سازی ERP", cls: "text-red-700" },
  };
  const s = map[state];
  return <span className={`text-sm ${s.cls}`}>{s.label}</span>;
}
