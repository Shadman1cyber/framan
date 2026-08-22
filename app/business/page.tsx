"use client";

import { company, roles, users, budgetCategories } from "@/lib/mock-data";
import { money } from "@/lib/format";
import { PageHeader, Card, MetricGroup, Metric } from "@/components/ui";

export default function BusinessPage() {
  return (
    <div>
      <PageHeader
        title="Business"
        meta={`${company.name} · ${company.workspace} workspace`}
      />

      <MetricGroup>
        {budgetCategories.map((c) => (
          <Metric
            key={c.id}
            label={c.name}
            value={money(c.monthlyCap - c.committed)}
            note={`remaining of ${money(c.monthlyCap)} cap`}
          />
        ))}
      </MetricGroup>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">People and permissions</h2>
        <div className="border-[0.5px] border-borders">
          {users.map((u) => {
            const role = roles.find((r) => r.id === u.roleId);
            return (
              <div key={u.id} className="-mt-[0.5px] border-[0.5px] border-borders px-4 py-3 first:mt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                  <span>{u.name}</span>
                  <span className="text-neutral-500">{role?.title}</span>
                </div>
                <div className="tnum mt-0.5 text-sm text-neutral-500">
                  May approve single orders up to {money(role?.approvalLimit ?? 0)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-neutral-400">
          Roles are managed in{" "}
          <span className="underline">Policies & permissions</span> (demo: read-only here).
        </p>
      </section>

      <section className="mt-8">
        <Card>
          <h2 className="text-sm font-medium">Workspaces</h2>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            This demo runs in a single workspace — Operations. In production, each business unit
            gets its own workspace with isolated policies, budgets, and audit logs.
          </p>
        </Card>
      </section>
    </div>
  );
}
