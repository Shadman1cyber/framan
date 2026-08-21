"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { PRIORITY, APPROVAL_STATUS } from "@/lib/domain";
import { runProcurementPipeline, resolveApproval } from "@/lib/agents/orchestrator/engine";
import { logActivity, setAgentStatus, bumpAgentTasks } from "@/lib/agents/activity";
import { revalidatePath } from "next/cache";

export type CreateRequestInput = {
  title: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  neededBy?: string | null; // ISO date
  budget?: number | null;
  priority: string;
  notes?: string | null;
};

export async function createPurchaseRequestAction(
  input: CreateRequestInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireSession();

  // ── Validation (server-side, never trust the client) ─────────────────────
  const title = String(input.title ?? "").trim();
  const itemDescription = String(input.itemDescription ?? "").trim();
  const quantity = Math.floor(Number(input.quantity));
  const unit = String(input.unit ?? "units").trim() || "units";
  const priority = Object.values(PRIORITY).includes(input.priority as never)
    ? input.priority
    : "normal";
  const budget = input.budget != null && Number(input.budget) > 0 ? Number(input.budget) : null;
  const neededBy = input.neededBy ? new Date(String(input.neededBy)) : null;

  if (title.length < 3) return { ok: false, error: "Title must be at least 3 characters." };
  if (itemDescription.length < 3) return { ok: false, error: "Describe the item you need." };
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1_000_000)
    return { ok: false, error: "Quantity must be between 1 and 1,000,000." };
  if (budget != null && (budget < 0 || !Number.isFinite(budget)))
    return { ok: false, error: "Budget must be a positive number." };
  if (neededBy && isNaN(neededBy.getTime()))
    return { ok: false, error: "Invalid delivery date." };

  const request = await db.purchaseRequest.create({
    data: {
      companyId: session.companyId,
      createdById: session.id,
      title,
      itemDescription,
      category: "Unspecified",
      quantity,
      unit,
      neededBy,
      budget,
      priority,
      notes: input.notes?.toString().slice(0, 2000) || null,
      status: "processing",
    },
  });

  await db.workflowStage.create({
    data: {
      requestId: request.id,
      key: "created",
      label: "Request Created",
      sortOrder: 0,
      status: "done",
      summary: `Request submitted by ${session.name}: ${quantity.toLocaleString()} × ${itemDescription}.`,
    },
  });
  await logActivity({
    companyId: session.companyId,
    agentKey: "user",
    actor: session.name,
    action: "request_created",
    message: `New purchase request: ${quantity.toLocaleString()} × ${itemDescription}`,
    requestId: request.id,
  });
  await setAgentStatus("orchestrator", "working", `Dispatching procurement workflow — ${title}`);
  await bumpAgentTasks("orchestrator");

  revalidatePath("/procurement/requests");
  revalidatePath("/dashboard");

  // Fire the pipeline. Awaited so the user lands on a fully-processed
  // timeline; stage timestamps + UI animation convey the agent sequence.
  await runProcurementPipeline(request.id);

  revalidatePath("/ai/approvals");
  revalidatePath("/ai/activity");
  return { ok: true, id: request.id };
}

export async function resolveApprovalAction(
  approvalId: string,
  decision: "approved" | "rejected" | "changes_requested",
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (!["approved", "rejected", "changes_requested"].includes(decision))
    return { ok: false, error: "Invalid decision." };

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: { request: true },
  });
  if (!approval) return { ok: false, error: "Approval not found." };
  if (approval.companyId !== session.companyId)
    return { ok: false, error: "Not authorized." };
  if (approval.status !== APPROVAL_STATUS.pending)
    return { ok: false, error: "This approval was already decided." };

  await resolveApproval({
    approvalId,
    decision,
    userId: session.id,
    note: note?.slice(0, 500),
  });

  revalidatePath("/ai/approvals");
  revalidatePath(`/procurement/requests/${approval.requestId}`);
  revalidatePath("/procurement/orders");
  revalidatePath("/finance/overview");
  revalidatePath("/finance/cashflow");
  revalidatePath("/dashboard");
  revalidatePath("/ai/activity");
  return { ok: true };
}
