import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFinanceSnapshot, attentionSummary, OPENING_CASH } from "@/lib/agents/finance/analytics";
import { formatMoney, timeAgo, formatDate } from "@/lib/format";
import { Card, CardHeader, StatCard, Badge, PageHeader, EmptyState } from "@/components/ui";
import { CashAreaChart } from "@/components/charts";
import {
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Cpu,
  ArrowRight,
  CircleAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";

export const dynamic = "force-dynamic";

const levelIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: CircleAlert };
const levelColor = { info: "text-info", success: "text-good", warning: "text-warn", error: "text-bad" };

export default async function DashboardPage() {
  const session = await requireSession();
  const companyId = session.companyId;

  const [snapshot, agents, pendingApprovals, activeRequests, openPOs, activity, attention] =
    await Promise.all([
      getFinanceSnapshot(companyId),
      db.agent.findMany({ orderBy: { key: "asc" } }),
      db.approval.findMany({
        where: { companyId, status: "pending" },
        include: { request: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      db.purchaseRequest.count({ where: { companyId, status: { in: ["processing", "awaiting_approval", "changes_requested"] } } }),
      db.purchaseOrder.count({ where: { companyId, status: { in: ["issued", "confirmed", "shipped"] } } }),
      db.activityLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 8 }),
      attentionSummary(companyId),
    ]);

  const cashSeries = snapshot.monthly.map((m) => ({
    label: m.label,
    value: Math.round(m.income - m.expense),
  }));
  // Build a running cash series properly
  let run = OPENING_CASH;
  for (const m of snapshot.monthly) {
    run += m.income - m.expense;
    cashSeries.find((c) => c.label === m.label)!.value = Math.round(run);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${session.name.split(" ")[0]}`}
        description={`${session.companyName} — live operational picture. FARMAN is monitoring procurement, finance and business execution.`}
      />

      {/* Health strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Cash position" value={formatMoney(snapshot.cash)} sub={`90-day forecast ${formatMoney(snapshot.forecast90)}`} tone={snapshot.cash > 300000 ? "good" : "warn"} href="/finance/overview" />
        <StatCard label="Active requests" value={String(activeRequests)} sub={`${pendingApprovals.length} awaiting your approval`} tone={pendingApprovals.length ? "warn" : undefined} href="/procurement/requests" />
        <StatCard label="Open purchase orders" value={String(openPOs)} sub="Tracked against delivery windows" href="/procurement/orders" />
        <StatCard label="Pending payables" value={formatMoney(snapshot.payables)} sub={`Receivables expected ${formatMoney(snapshot.receivables)}`} href="/finance/cashflow" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* AI Activity */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="AI Agents — Live"
            subtitle="What FARMAN's agents are doing right now"
            action={<Link href="/ai/agents" className="text-xs text-accent hover:underline">All agents →</Link>}
          />
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            {agents.map((a) => (
              <div key={a.id} className="rounded-lg border border-line bg-raised px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu className={`h-3.5 w-3.5 shrink-0 ${a.status === "working" ? "text-accent pulse-dot" : "text-ink-faint"}`} />
                    <p className="text-[13px] font-medium truncate">{a.name}</p>
                  </div>
                  <Badge tone={a.status === "working" ? "accent" : a.status === "waiting" ? "warn" : a.status === "error" ? "bad" : "neutral"}>
                    {a.status}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-ink-dim truncate">{a.currentTask ?? a.description}</p>
              </div>
            ))}
          </div>

          {/* Cash chart */}
          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Cash position — 6 months</h3>
              <Link href="/finance/cashflow" className="text-xs text-accent hover:underline">Cash flow →</Link>
            </div>
            <CashAreaChart data={cashSeries} />
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-5">
          {/* Recommended actions */}
          <Card>
            <CardHeader title="Needs your attention" subtitle="FARMAN paused these actions for you" />
            <div className="p-3 space-y-2">
              {attention.bullets.length === 0 && !attention.link && (
                <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-good" />} title="Nothing needs you right now" description="FARMAN is monitoring operations autonomously." />
              )}
              {pendingApprovals.map((ap) => (
                <Link
                  key={ap.id}
                  href={`/procurement/requests/${ap.requestId}`}
                  className="block rounded-lg border border-warn/25 bg-warn/5 hover:bg-warn/10 transition-colors px-3.5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-warn shrink-0" />
                    <p className="text-[13px] font-medium leading-snug">{ap.title}</p>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-ink-dim line-clamp-2">{ap.description}</p>
                </Link>
              ))}
              {session.companyId && (
                <Link
                  href="/ai/approvals"
                  className="flex items-center justify-between rounded-lg border border-line bg-raised px-3.5 py-2.5 text-[13px] text-ink-dim hover:text-ink transition-colors"
                >
                  Open approval queue <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader title="Recent activity" action={<Link href="/ai/activity" className="text-xs text-accent hover:underline">Full log →</Link>} />
            <ul className="divide-y divide-line">
              {activity.map((a) => {
                const Icon = levelIcon[(a.level as keyof typeof levelIcon) ?? "info"];
                return (
                  <li key={a.id} className="flex gap-3 px-4 py-2.5">
                    <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${levelColor[(a.level as keyof typeof levelColor) ?? "info"]}`} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] text-ink-dim leading-snug">{a.message}</p>
                      <p className="text-[10.5px] text-ink-faint mt-0.5">{a.actor} · {timeAgo(a.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Link href="/procurement/requests/new" className="group rounded-xl border border-line bg-surface px-4 py-4 hover:border-accent/40 transition-colors">
          <ShoppingCart className="h-4 w-4 text-accent mb-2" />
          <p className="text-sm font-medium group-hover:text-accent transition-colors">New purchase request</p>
          <p className="text-xs text-ink-dim mt-0.5">Describe what you need — FARMAN sources and executes.</p>
        </Link>
        <Link href="/business/setup" className="group rounded-xl border border-line bg-surface px-4 py-4 hover:border-accent/40 transition-colors">
          <Wallet className="h-4 w-4 text-accent mb-2" />
          <p className="text-sm font-medium group-hover:text-accent transition-colors">Start a business</p>
          <p className="text-xs text-ink-dim mt-0.5">Describe an idea — get an executable workspace.</p>
        </Link>
        <Link href="/finance/cfo" className="group rounded-xl border border-line bg-surface px-4 py-4 hover:border-accent/40 transition-colors">
          <CircleAlert className="h-4 w-4 text-accent mb-2" />
          <p className="text-sm font-medium group-hover:text-accent transition-colors">Ask the AI CFO</p>
          <p className="text-xs text-ink-dim mt-0.5">Affordability, overspend, supplier costs — answered from live data.</p>
        </Link>
      </div>
    </div>
  );
}
