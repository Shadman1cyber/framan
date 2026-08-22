"use client";

import { policies, roles } from "@/lib/mock-data";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default function PoliciesPage() {
  return (
    <div>
      <PageHeader
        title="Policies & permissions"
        meta="The rules Farman enforces. Agents cannot bypass them; they stop and ask instead."
      />

      <section>
        <h2 className="mb-2 text-sm font-medium">Active policies</h2>
        <div className="space-y-[0.5px]">
          {policies.map((p) => (
            <div key={p.id} className="border-[0.5px] border-borders px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span>{p.name}</span>
                <span className="tnum text-xs text-neutral-400">{p.code}</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-600">
                {p.description}
              </p>
              <p className="mt-1 text-sm text-neutral-500">Triggers when: {p.trigger}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Roles and approval limits</h2>
        <div className="space-y-[0.5px]">
          {roles.map((r) => (
            <div key={r.id} className="border-[0.5px] border-borders px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span>{r.title}</span>
                <span className="tnum text-neutral-500">
                  up to {money(r.approvalLimit)} per order
                </span>
              </div>
              <ul className="mt-1 grid gap-x-8 gap-y-0.5 pl-4 text-sm text-neutral-600 sm:grid-cols-2">
                {r.canApprove.map((x) => (
                  <li key={x} className="list-disc">
                    {x}
                  </li>
                ))}
                {r.cannotApprove.map((x) => (
                  <li key={x} className="list-disc text-neutral-500">
                    Cannot: {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
