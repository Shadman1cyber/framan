import { db } from "@/lib/db";
import { POLICY } from "@/lib/domain";
import type { CfoAnswer } from "@/lib/agents/ai/provider";
import { formatMoney } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// AI CFO analytics — all figures are computed from the knowledge graph
// (transactions / expenses / purchase orders), never hardcoded in the UI.
// ─────────────────────────────────────────────────────────────────────────────

// Demo company opening balance for the period (IRR).
export const OPENING_CASH = 386_000_000_000;

export async function getFinanceSnapshot(companyId: string) {
  const since90 = new Date(Date.now() - 90 * 86400000);
  const [txns, expenses] = await Promise.all([
    db.transaction.findMany({ where: { companyId }, orderBy: { date: "asc" } }),
    db.expense.findMany({ where: { companyId }, orderBy: { date: "desc" } }),
  ]);

  const cleared = txns.filter((t) => t.status === "cleared");
  const pending = txns.filter((t) => t.status === "pending");

  const cash =
    OPENING_CASH +
    cleared.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0) -
    cleared.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);

  const last30 = Date.now() - 30 * 86400000;
  const revenue30 = cleared.filter((t) => t.type === "income" && t.date.getTime() >= last30).reduce((a, t) => a + t.amount, 0);
  const expense30 = cleared.filter((t) => t.type === "expense" && t.date.getTime() >= last30).reduce((a, t) => a + t.amount, 0);

  // Monthly series (last 6 months) for charts
  const monthly: { label: string; income: number; expense: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inc = cleared.filter((t) => t.type === "income" && t.date >= d && t.date < next).reduce((a, t) => a + t.amount, 0);
    const exp = cleared.filter((t) => t.type === "expense" && t.date >= d && t.date < next).reduce((a, t) => a + t.amount, 0);
    monthly.push({ label: d.toLocaleString("en-US", { month: "short" }), income: inc, expense: exp });
  }

  const payables = pending.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
  const receivables = pending.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);

  const avgDailyNet =
    monthly.slice(-3).reduce((a, m) => a + (m.income - m.expense), 0) / 90;

  return {
    cash,
    revenue30,
    expense30,
    payables,
    receivables,
    monthly,
    avgDailyNet,
    expenses,
    forecast90: Math.round(cash + avgDailyNet * 90),
    recentTxns: txns.slice(-8).reverse(),
  };
}

export async function affordabilityCheck(companyId: string, amount: number): Promise<CfoAnswer> {
  const snap = await getFinanceSnapshot(companyId);
  const monthlyOpex = snap.monthly.at(-1)?.expense || snap.expense30;
  const buffer = monthlyOpex * POLICY.cashBufferMonths;
  const after = snap.cash - snap.payables * 0.9 - amount; // payables weighted near-term
  const verdict = after >= buffer;

  return {
    intent: "affordability",
    title: `Affordability analysis — ${formatMoney(amount)}`,
    answer: verdict
      ? `Yes — FARMAN assesses this purchase as affordable. After settling near-term payables (~${formatMoney(snap.payables)}) and this ${formatMoney(amount)}, projected cash of ${formatMoney(after)} stays above the required ${formatMoney(buffer)} operating buffer.`
      : `Caution — this purchase would leave ${formatMoney(after)} in projected cash, below the recommended ${formatMoney(buffer)} buffer. FARMAN suggests splitting into two deliveries or negotiating 60-day payment terms.`,
    bullets: [
      `Current cash position: ${formatMoney(snap.cash)}`,
      `Near-term payables due: ${formatMoney(snap.payables)}`,
      `Required safety buffer (50% of monthly opex): ${formatMoney(buffer)}`,
      verdict
        ? `Net cash impact keeps you ${formatMoney(after - buffer)} above the floor`
        : `Shortfall vs buffer: ${formatMoney(buffer - after)} — consider staged delivery`,
      `90-day projection with this spend: ${formatMoney(snap.forecast90 - amount)}`,
    ],
    metrics: [
      { label: "Cash today", value: formatMoney(snap.cash) },
      { label: "After purchase", value: formatMoney(after), tone: verdict ? "good" : "bad" },
      { label: "Buffer floor", value: formatMoney(buffer), tone: "warn" },
    ],
  };
}

export async function expenseAnalysis(companyId: string): Promise<CfoAnswer> {
  const expenses = await db.expense.findMany({
    where: { companyId },
    orderBy: { date: "desc" },
  });
  const byCat = new Map<string, { total: number; budget: number | null }>();
  for (const e of expenses) {
    const cur = byCat.get(e.category) ?? { total: 0, budget: null };
    cur.total += e.amount;
    cur.budget = e.monthlyBudget ?? cur.budget;
    byCat.set(e.category, cur);
  }
  const rows = [...byCat.entries()]
    .map(([cat, v]) => ({ cat, ...v, pct: v.budget ? (v.total / v.budget) * 100 : null }))
    .sort((a, b) => b.total - a.total);
  const top = rows[0];
  const over = rows.filter((r) => r.pct != null && r.pct > 95);
  const flagged = expenses.filter((e) => e.flagged);

  return {
    intent: "expenses",
    title: "Where you are overspending",
    answer: `Largest category is ${top?.cat} at ${formatMoney(top?.total ?? 0)}${
      top?.budget ? ` (${Math.round((top.total / top.budget) * 100)}% of its ${formatMoney(top.budget)} budget)` : ""
    }. ${over.length > 0 ? `${over.length} categories are at or above 95% of budget.` : "No category has exceeded its budget."}`,
    bullets: [
      ...rows.slice(0, 5).map(
        (r) =>
          `${r.cat}: ${formatMoney(r.total)}${r.budget ? ` of ${formatMoney(r.budget)} budget (${r.pct!.toFixed(0)}%)` : ""}`
      ),
      ...(flagged.length
        ? [`${flagged.length} expense(s) flagged for review: ${flagged.map((f) => f.vendor).join(", ")}`]
        : []),
    ],
    metrics: rows.slice(0, 4).map((r) => ({
      label: r.cat,
      value: `${r.pct != null ? `${r.pct.toFixed(0)}%` : formatMoney(r.total)}`,
      tone: (r.pct ?? 0) > 100 ? "bad" : (r.pct ?? 0) > 90 ? "warn" : "good",
    })),
    link: { label: "Open Expenses", href: "/finance/expenses" },
  };
}

export async function cashflowAnswer(companyId: string): Promise<CfoAnswer> {
  const snap = await getFinanceSnapshot(companyId);
  const trend = snap.avgDailyNet >= 0 ? "positive" : "negative";
  return {
    intent: "cashflow",
    title: "Cash flow outlook",
    answer:
      `Cash position is ${formatMoney(snap.cash)}. Average daily net over the last quarter is ${formatMoney(snap.avgDailyNet)} (${trend}), projecting roughly ${formatMoney(snap.forecast90)} in 90 days before committed purchases.`,
    bullets: [
      `Receivables expected within 30 days: ${formatMoney(snap.receivables)}`,
      `Payables due: ${formatMoney(snap.payables)}`,
      `Next month projection: ${formatMoney(snap.cash + snap.avgDailyNet * 30)}`,
      `Largest upcoming outflow: ${formatMoney(Math.max(...snap.recentTxns.filter(t=>t.type==="expense").map(t=>t.amount),0))}`,
    ],
    metrics: [
      { label: "Cash", value: formatMoney(snap.cash), tone: "good" },
      { label: "90-day forecast", value: formatMoney(snap.forecast90), tone: snap.forecast90 > snap.cash ? "good" : "warn" },
      { label: "Pending outflows", value: formatMoney(snap.payables), tone: "warn" },
    ],
    link: { label: "Open Cash Flow", href: "/finance/cashflow" },
  };
}

export async function supplierCostRanking(companyId: string) {
  const pos = await db.purchaseOrder.findMany({
    where: { companyId },
    include: { supplier: true },
  });
  const bySupplier = new Map<string, { name: string; total: number; orders: number }>();
  for (const po of pos) {
    const cur = bySupplier.get(po.supplierId) ?? { name: po.supplier.name, total: 0, orders: 0 };
    cur.total += po.total;
    cur.orders += 1;
    bySupplier.set(po.supplierId, cur);
  }
  return [...bySupplier.values()].sort((a, b) => b.total - a.total);
}

export async function attentionSummary(companyId: string): Promise<CfoAnswer> {
  const [pendingApprovals, flaggedExpenses] = await Promise.all([
    db.approval.findMany({ where: { companyId, status: "pending" }, include: { request: true } }),
    db.expense.count({ where: { companyId, flagged: true } }),
  ]);
  return {
    intent: "attention",
    title: "What needs your attention",
    answer:
      pendingApprovals.length > 0
        ? `${pendingApprovals.length} approval${pendingApprovals.length > 1 ? "s" : ""} pending — FARMAN paused execution until you decide.${flaggedExpenses ? ` ${flaggedExpenses} flagged expense${flaggedExpenses > 1 ? "s" : ""} to review.` : ""}`
        : flaggedExpenses
          ? `${flaggedExpenses} flagged expense${flaggedExpenses > 1 ? "s" : ""} need review. Nothing else requires you right now.`
          : "Nothing needs you right now — FARMAN is monitoring operations.",
    bullets: pendingApprovals.map((a) => {
      if (!a.request) return a.title;
      const rec = a.request.recommendation as { totalPrice?: number } | null;
      return `${a.title}${rec?.totalPrice ? ` (${formatMoney(Number(rec.totalPrice))})` : ""}`;
    }),
    link: { label: "Open Approvals", href: "/ai/approvals" },
  };
}
