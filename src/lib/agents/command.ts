import { db } from "@/lib/db";
import { getAIProvider, interpretCommandText } from "@/lib/agents/ai/provider";
import {
  affordabilityCheck,
  cashflowAnswer,
  expenseAnalysis,
  attentionSummary,
} from "@/lib/agents/finance/analytics";
import { findCandidateOffers } from "@/lib/agents/procurement/supplier-search";
import { evaluateOffers } from "@/lib/agents/procurement/evaluation";
import { logActivity } from "@/lib/agents/activity";
import type { CfoAnswer } from "@/lib/agents/ai/provider";

// Command interface — maps natural language to deterministic workflows.
// Honest by design: intents that are implemented execute; unknown commands
// say so and list what FARMAN can do.

export type CommandResult =
  | ({ kind: "cfo"; answer: CfoAnswer })
  | ({
      kind: "procurement_preview";
      quantity: number;
      itemType: string;
      category: string;
      offers: {
        supplierName: string;
        unitPrice: number;
        totalPrice: number;
        leadTimeDays: number;
        reliabilityScore: number;
        riskLevel: string;
        score: number;
      }[];
      requestId?: string;
    })
  | { kind: "business_setup"; idea: string }
  | { kind: "unknown"; text: string };

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Packaging: ["packaging", "box", "boxes", "carton", "pallet", "film", "wrap", "label", "sack", "strapping"],
  "Raw Materials": ["granules", "hdpe", "polymer", "resin", "ink", "masterbatch"],
  Components: ["metal", "ceramic", "fitting", "valve", "part"],
  Logistics: ["freight", "shipping", "customs"],
};

function detectCategory(text: string): string {
  const t = text.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS))
    if (words.some((w) => t.includes(w))) return cat;
  return "Packaging";
}

export async function runCommand(
  companyId: string,
  userId: string,
  text: string
): Promise<CommandResult> {
  const intent = interpretCommandText(text);
  await logActivity({
    companyId,
    agentKey: "user",
    actor: "You",
    action: "command",
    message: `Command: “${text}”`,
  });

  switch (intent.intent) {
    case "affordability": {
      // If there's a pending approval with a total, analyze it; else generic.
      const pending = await db.approval.findFirst({
        where: { companyId, status: "pending" },
        include: { request: true },
        orderBy: { createdAt: "desc" },
      });
      const amount =
        intent.amount ??
        Number((pending?.request?.recommendation as any)?.totalPrice ?? 0) ??
        0;
      if (amount > 0)
        return { kind: "cfo", answer: await affordabilityCheck(companyId, amount) };
      return { kind: "cfo", answer: await cashflowAnswer(companyId) };
    }
    case "expenses":
      return { kind: "cfo", answer: await expenseAnalysis(companyId) };
    case "cashflow":
      return { kind: "cfo", answer: await cashflowAnswer(companyId) };
    case "attention":
      return { kind: "cfo", answer: await attentionSummary(companyId) };
    case "business_setup":
      return { kind: "business_setup", idea: intent.idea };
    case "procurement": {
      const category = detectCategory(intent.itemType);
      const candidates = await findCandidateOffers(companyId, category, intent.quantity, intent.itemType);
      const evaluated = evaluateOffers(candidates, { quantity: intent.quantity, budget: null, neededBy: null });
      await logActivity({
        companyId,
        agentKey: "procurement",
        actor: "Procurement Agent",
        action: "command_sourcing",
        message: `Sourced ${evaluated.length} offers for ${intent.quantity.toLocaleString()} × ${intent.itemType}`,
      });
      return {
        kind: "procurement_preview",
        quantity: intent.quantity,
        itemType: intent.itemType,
        category,
        offers: evaluated.slice(0, 5).map((e) => ({
          supplierName: e.supplierName,
          unitPrice: e.unitPrice,
          totalPrice: e.totalPrice,
          leadTimeDays: e.leadTimeDays,
          reliabilityScore: e.reliabilityScore,
          riskLevel: e.riskLevel,
          score: e.score,
        })),
      };
    }
    default:
      return { kind: "unknown", text };
  }
}
