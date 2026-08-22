"use client";

import { company } from "@/lib/mock-data";
import { useDemo } from "@/lib/store";
import { Btn, PageHeader } from "@/components/ui";

const integrations = [
  {
    name: "ERP / accounting sync",
    state: "Degraded — retrying",
    detail:
      "Connection timeout at 11:42 while posting an accrual. Automatic retries run every 4 minutes; escalates after three failures.",
    cls: "text-red-700",
  },
  {
    name: "Packline ordering portal",
    state: "Connected",
    detail: "Used to deliver purchase orders and receive confirmations. Last handshake 11:58.",
    cls: "text-green-700",
  },
  {
    name: "Supplier email intake",
    state: "Connected",
    detail: "Quotes arriving as attachments are parsed, timestamped, and filed as evidence.",
    cls: "text-green-700",
  },
];

export default function SettingsPage() {
  const { reset } = useDemo();
  return (
    <div>
      <PageHeader title="Settings & integrations" meta={`${company.name} · demo environment`} />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Integrations</h2>
        <div className="space-y-[0.5px]">
          {integrations.map((i) => (
            <div key={i.name} className="border-[0.5px] border-borders px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                <span>{i.name}</span>
                <span className={i.cls}>{i.state}</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-neutral-500">{i.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium">Demo</h2>
        <div className="rounded-xl border-[0.5px] border-borders p-5">
          <p className="max-w-xl text-sm leading-relaxed text-neutral-600">
            This build is a click-through demo with seeded data. Reset returns the workspace to its
            starting point: the packaging request waiting on your approval.
          </p>
          <div className="mt-3">
            <Btn onClick={reset}>Reset demo data</Btn>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Data handling</h2>
        <p className="max-w-xl text-sm leading-relaxed text-neutral-500">
          All data in this demo is fictional and stored in memory. No external services are called;
          supplier responses, policies, and financials are seeded fixtures.
        </p>
      </section>
    </div>
  );
}
