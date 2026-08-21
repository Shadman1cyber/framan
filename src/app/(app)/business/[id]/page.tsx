import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge, SectionTitle } from "@/components/ui";
import { BusinessTaskList } from "@/components/business-task-list";
import { formatMoney } from "@/lib/format";
import { ArrowLeft, Users, Package, Truck, DollarSign, ListChecks } from "lucide-react";

export const dynamic = "force-dynamic";

type ProductPlan = { name: string; description: string; priceRange: string };
type OpsList = string[];
type SupplierNeed = { category: string; notes: string };
type CostItem = { item: string; amount: number; note: string };
type Assumption = { label: string; value: string };

export default async function BusinessWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const business = await db.business.findUnique({ where: { id }, include: { tasks: { orderBy: { phaseOrder: "asc" } } } });
  if (!business || business.companyId !== session.companyId) notFound();

  const products = business.productsJson as unknown as ProductPlan[];
  const operations = business.operationsJson as unknown as OpsList;
  const suppliersNeeded = business.suppliersNeededJson as unknown as SupplierNeed[];
  const costs = business.costBreakdownJson as unknown as CostItem[];
  const assumptions = business.assumptionsJson as unknown as Assumption[];
  const totalCost = costs.reduce((a, c) => a + c.amount, 0);

  return (
    <div>
      <Link href="/business/setup" className="inline-flex items-center gap-1.5 text-xs text-ink-faint hover:text-ink-dim transition-colors mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Business setup
      </Link>

      <PageHeader
        title={business.name}
        description={business.concept}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={business.status === "planning" ? "info" : "good"}>{business.status}</Badge>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-5">
          {/* Products & customers */}
          <Card>
            <CardHeader title="Offerings" subtitle={<span>Target: {business.targetCustomers}</span>} />
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              {products.map((p) => (
                <div key={p.name} className="rounded-lg border border-line bg-raised px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink">{p.name}</p>
                    <Badge tone="accent">{p.priceRange}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-dim leading-relaxed">{p.description}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Operations + suppliers */}
          <div className="grid sm:grid-cols-2 gap-5">
            <Card>
              <CardHeader title="Initial Operations" />
              <ul className="p-5 pt-3 space-y-2">
                {operations.map((o, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-ink-dim">
                    <span className="num text-accent mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span> {o}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Suppliers Needed" subtitle="FARMAN can source these on request" />
              <ul className="p-5 pt-3 space-y-3">
                {suppliersNeeded.map((s) => (
                  <li key={s.category}>
                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink"><Truck className="h-3.5 w-3.5 text-accent" />{s.category}</p>
                    <p className="mt-1 pl-5.5 text-xs text-ink-dim leading-relaxed" style={{ paddingLeft: 22 }}>{s.notes}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Tasks */}
          <Card>
            <CardHeader
              title="Execution Plan"
              subtitle="Work through phases — FARMAN tracks progress"
              action={<ListChecks className="h-4 w-4 text-ink-faint" />}
            />
            <BusinessTaskList tasks={business.tasks.map((t) => ({ id: t.id, title: t.title, detail: t.detail, phase: t.phase, done: t.done }))} />
          </Card>
        </div>

        {/* Right rail: economics */}
        <div className="space-y-5 lg:sticky lg:top-[76px]">
          <Card>
            <CardHeader title="Unit Economics" />
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-raised border border-line px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Projected revenue/mo</p>
                  <p className="num mt-1 text-[15px] font-semibold text-good">{formatMoney(business.projectedMonthlyRevenue)}</p>
                </div>
                <div className="rounded-lg bg-raised border border-line px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Projected cost/mo</p>
                  <p className="num mt-1 text-[15px] font-semibold text-warn">{formatMoney(business.projectedMonthlyCost)}</p>
                </div>
                <div className="rounded-lg bg-raised border border-line px-3 py-2.5 col-span-2">
                  <p className="text-[10px] uppercase tracking-wide text-ink-faint">Estimated startup capital</p>
                  <p className="num mt-1 text-[15px] font-semibold">{formatMoney(totalCost)}</p>
                </div>
              </div>
              <div>
                <SectionTitle>Revenue model</SectionTitle>
                <p className="text-xs leading-relaxed text-ink-dim flex gap-2"><Users className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />{business.revenueModel}</p>
              </div>
              <div>
                <SectionTitle>Key assumptions</SectionTitle>
                <ul className="space-y-1.5">
                  {assumptions.map((a) => (
                    <li key={a.label} className="flex justify-between text-xs">
                      <span className="text-ink-faint">{a.label}</span>
                      <span className="num text-ink-dim">{a.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Startup Costs" />
            <ul className="divide-y divide-line">
              {costs.map((c) => (
                <li key={c.item} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <div>
                    <p className="text-[13px] text-ink">{c.item}</p>
                    <p className="text-[11px] text-ink-faint">{c.note}</p>
                  </div>
                  <span className="num text-[13px] font-medium shrink-0">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="border-accent/25 bg-accent-soft/40">
            <div className="p-4 flex items-start gap-2.5">
              <Package className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed text-ink-dim">
                <span className="text-ink font-medium">Next lever:</span> once you shortlist suppliers, create a purchase request — the Procurement Agent will negotiate-ready quotes and the AI CFO will validate affordability automatically.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
