import { db } from "@/lib/db";
import { getAIProvider } from "@/lib/agents/ai/provider";
import { logActivity, setAgentStatus, bumpAgentTasks } from "@/lib/agents/activity";

// Business Agent — turns a natural-language idea into an executable workspace:
// structured plan + phased task list the user can work through.

export async function createBusinessFromIdea(companyId: string, idea: string) {
  const ai = getAIProvider();
  await setAgentStatus("business", "working", "Structuring your business idea");

  const plan = await ai.setupBusiness(idea);

  const business = await db.business.create({
    data: {
      companyId,
      name: plan.name,
      ideaText: idea,
      concept: plan.concept,
      targetCustomers: plan.targetCustomers,
      revenueModel: plan.revenueModel,
      productsJson: plan.products as never,
      operationsJson: plan.operations as never,
      suppliersNeededJson: plan.suppliersNeeded as never,
      costBreakdownJson: plan.costBreakdown as never,
      assumptionsJson: plan.assumptions as never,
      projectedMonthlyRevenue: plan.projectedMonthlyRevenue,
      projectedMonthlyCost: plan.projectedMonthlyCost,
    },
  });

  // Phased execution tasks
  const tasks: { title: string; detail?: string; phase: string; phaseOrder: number }[] = [
    { title: "Identify and shortlist suppliers", detail: `Source ${plan.suppliersNeeded[0]?.category ?? "core"} partners and request quotes`, phase: "research", phaseOrder: 1 },
    { title: "Select initial products / offerings", detail: "Pick the first 3–5 items with best margin potential", phase: "research", phaseOrder: 2 },
    { title: "Calculate unit economics", detail: "Landed cost per unit incl. shipping, packaging, fees", phase: "setup", phaseOrder: 3 },
    { title: "Create pricing model", detail: "Set retail prices against target gross margin", phase: "setup", phaseOrder: 4 },
    { title: "Set up sales channel", detail: plan.targetCustomers.toLowerCase().includes("international") ? "Marketplace + storefront with international payments" : "Storefront / channel setup", phase: "setup", phaseOrder: 5 },
    { title: "Prepare launch checklist", detail: "Photography, copy, inventory ready-to-ship", phase: "launch", phaseOrder: 6 },
    { title: "First marketing campaign", detail: "Launch budget allocation and creative", phase: "launch", phaseOrder: 7 },
    { title: "Weekly operations review", detail: "Sales, cash, supplier performance cadence", phase: "operate", phaseOrder: 8 },
  ];
  for (const t of tasks) {
    await db.businessTask.create({ data: { businessId: business.id, ...t } });
  }

  await logActivity({
    companyId,
    agentKey: "business",
    actor: "Business Agent",
    action: "business_created",
    level: "success",
    message: `Business Agent generated workspace “${plan.name}” from your idea`,
    meta: { businessId: business.id },
  });
  await setAgentStatus("business", "idle", null);
  await bumpAgentTasks("business");

  return business;
}
