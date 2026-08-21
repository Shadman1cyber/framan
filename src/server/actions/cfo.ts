"use server";

import { requireSession } from "@/lib/auth";
import {
  affordabilityCheck,
  cashflowAnswer,
  expenseAnalysis,
  attentionSummary,
  supplierCostRanking,
} from "@/lib/agents/finance/analytics";
import { db } from "@/lib/db";
import type { CfoAnswer } from "@/lib/agents/ai/provider";
import { formatMoney } from "@/lib/format";
import { revalidatePath } from "next/cache";

export async function askCfoAction(question: string): Promise<{ ok: boolean; error?: string; answer?: CfoAnswer }> {
  const session = await requireSession();
  const q = String(question ?? "").trim();
  if (!q) return { ok: false, error: "Ask a question first." };
  const t = q.toLowerCase();

  let answer: CfoAnswer;
  if (/afford|enough cash|can we pay/.test(t)) {
    // Attach amount from the newest pending approval if present
    const pending = await db.approval.findFirst({
      where: { companyId: session.companyId, status: "pending" },
      include: { request: true },
      orderBy: { createdAt: "desc" },
    });
    const amt = Number((pending?.request?.recommendation as { totalPrice?: number } | null)?.totalPrice ?? 0);
    answer = amt > 0 ? await affordabilityCheck(session.companyId, amt) : await cashflowAnswer(session.companyId);
  } else if (/expense|overspend|spending|cost us|costing/.test(t)) {
    if (/supplier/.test(t)) {
      const ranking = await supplierCostRanking(session.companyId);
      answer = {
        intent: "suppliers_cost",
        title: "Suppliers costing us the most",
        answer: ranking.length
          ? `${ranking[0].name} is your largest supplier by spend at ${formatMoney(ranking[0].total)} across ${ranking[0].orders} orders (${Math.round((ranking[0].total / ranking.reduce((a, r) => a + r.total, 0)) * 100)}% of PO value).`
          : "No purchase orders recorded yet.",
        bullets: ranking.slice(0, 6).map((r, i) => `#${i + 1} ${r.name} — ${formatMoney(r.total)} · ${r.orders} orders`),
        link: { label: "Open Procurement Intelligence", href: "/procurement/intelligence" },
      };
    } else {
      answer = await expenseAnalysis(session.companyId);
    }
  } else if (/cash|forecast|runway|burn|flow/.test(t)) {
    answer = await cashflowAnswer(session.companyId);
  } else if (/attention|approve|pending|today|should i/.test(t)) {
    answer = await attentionSummary(session.companyId);
  } else {
    return {
      ok: false,
      error:
        "Outside my current scope. I can answer: “Can we afford this purchase?”, “How will this affect cash flow?”, “Which suppliers are costing us the most?”, “Where are we overspending?”, “What needs my attention today?”",
    };
  }

  await db.activityLog.create({
    data: {
      companyId: session.companyId,
      agentKey: "finance_cfo",
      actor: "AI CFO",
      action: "question_answered",
      message: `AI CFO answered: “${q.slice(0, 120)}”`,
      level: "info",
    },
  });
  revalidatePath("/ai/activity");
  return { ok: true, answer };
}
