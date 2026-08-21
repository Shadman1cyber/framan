import { db } from "@/lib/db";
import {
  AGENTS,
  REQUEST_STATUS,
  APPROVAL_STATUS,
  POLICY,
  type StageKey,
} from "@/lib/domain";
import { getAIProvider } from "@/lib/agents/ai/provider";
import { findCandidateOffers } from "@/lib/agents/procurement/supplier-search";
import {
  evaluateOffers,
  pickRecommendation,
  approvalRequirements,
  type EvaluatedOffer,
} from "@/lib/agents/procurement/evaluation";
import { logActivity, setAgentStatus, bumpAgentTasks } from "@/lib/agents/activity";
import { formatMoney } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// FARMAN Orchestrator — deterministic workflow engine
//
// Intent → Understanding → Decision → Approval → Execution → Result
// Every stage is persisted so the UI can replay exactly what FARMAN did and
// why. The approval gate is where controlled autonomy hands control to a human.
// ─────────────────────────────────────────────────────────────────────────────

type RequestRow = Awaited<ReturnType<typeof db.purchaseRequest.create>>;

async function setStage(
  requestId: string,
  key: StageKey,
  label: string,
  sortOrder: number,
  patch: { status: string; summary?: string; data?: unknown }
) {
  const now = new Date();
  const existing = await db.workflowStage.findUnique({
    where: { requestId_key: { requestId, key } },
  });
  if (!existing) {
    await db.workflowStage.create({
      data: {
        requestId,
        key,
        label,
        sortOrder,
        status: patch.status,
        summary: patch.summary,
        dataJson: (patch.data as never) ?? undefined,
        startedAt: now,
        completedAt: patch.status === "done" ? now : null,
      },
    });
  } else {
    await db.workflowStage.update({
      where: { id: existing.id },
      data: {
        status: patch.status,
        summary: patch.summary ?? existing.summary,
        dataJson: (patch.data as never) ?? existing.dataJson,
        completedAt: patch.status === "done" || patch.status === "waiting" ? now : existing.completedAt,
      },
    });
  }
}

function offerSnapshot(o: EvaluatedOffer) {
  return {
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    unitPrice: o.unitPrice,
    totalPrice: o.totalPrice,
    leadTimeDays: o.leadTimeDays,
    fitsDeadline: o.fitsDeadline,
    withinBudget: o.withinBudget,
    score: o.score,
    reliabilityScore: o.reliabilityScore,
    riskLevel: o.riskLevel,
    breakdown: o.breakdown,
    reasons: o.reasons,
    flags: o.flags,
  };
}

export async function runProcurementPipeline(requestId: string) {
  const request = await db.purchaseRequest.findUnique({ where: { id: requestId } });
  if (!request) return;
  const ai = getAIProvider();

  await setAgentStatus("procurement", "working", `Processing “${request.title}”`);
  await db.purchaseRequest.update({ where: { id: requestId }, data: { status: REQUEST_STATUS.processing } });

  try {
    // ── Stage: Requirement parsed ──────────────────────────────────────────
    await setStage(requestId, "parsed", "Requirement Parsed", 1, { status: "running" });
    const parsed = await ai.parsePurchaseRequest({
      title: request.title,
      itemDescription: request.itemDescription,
      quantity: request.quantity,
      unit: request.unit,
      priority: request.priority,
      neededBy: request.neededBy,
      notes: request.notes,
    });
    await db.purchaseRequest.update({
      where: { id: requestId },
      data: { category: parsed.category, parsedSummary: parsed.summary },
    });
    await setStage(requestId, "parsed", "Requirement Parsed", 1, {
      status: "done",
      summary: parsed.summary,
      data: { category: parsed.category, urgency: parsed.urgency, constraints: parsed.constraints },
    });
    await logActivity({
      companyId: request.companyId,
      agentKey: "procurement",
      actor: AGENTS.procurement.name,
      action: "requirement_parsed",
      message: `Parsed requirement: ${request.quantity.toLocaleString()} × ${parsed.itemType} (${parsed.category})`,
      requestId,
      meta: { constraints: parsed.constraints },
    });

    // ── Stage: Suppliers found ────────────────────────────────────────────
    await setStage(requestId, "suppliers_found", "Suppliers Found", 2, { status: "running" });
    const candidates = await findCandidateOffers(
      request.companyId,
      parsed.category,
      request.quantity,
      `${request.title} ${request.itemDescription}`
    );
    if (candidates.length === 0) {
      await setStage(requestId, "suppliers_found", "Suppliers Found", 2, {
        status: "failed",
        summary: `No active suppliers found in category “${parsed.category}”.`,
      });
      await db.purchaseRequest.update({ where: { id: requestId }, data: { status: REQUEST_STATUS.failed } });
      await logActivity({
        companyId: request.companyId,
        agentKey: "procurement",
        actor: AGENTS.procurement.name,
        action: "no_suppliers",
        level: "error",
        message: `No suppliers available for category “${parsed.category}”`,
        requestId,
      });
      await setAgentStatus("procurement", "idle", null);
      return;
    }
    const primaryItem = candidates[0]?.productName ?? parsed.category;
    await setStage(requestId, "suppliers_found", "Suppliers Found", 2, {
      status: "done",
      summary: `Found ${candidates.length} qualified suppliers quoting “${primaryItem}” from the ${parsed.category} network.`,
      data: { item: primaryItem, suppliers: candidates.map((c) => ({ name: c.supplierName, location: c.location })) },
    });
    await logActivity({
      companyId: request.companyId,
      agentKey: "procurement",
      actor: AGENTS.procurement.name,
      action: "suppliers_found",
      message: `${AGENTS.procurement.name} found ${candidates.length} suppliers for ${parsed.category.toLowerCase()}`,
      requestId,
    });

    // ── Stage: Offers compared ────────────────────────────────────────────
    await setStage(requestId, "offers_compared", "Offers Compared", 3, { status: "running" });
    const evaluated = evaluateOffers(candidates, {
      quantity: request.quantity,
      budget: request.budget,
      neededBy: request.neededBy,
    });
    // Persist all offers (replace any previous set — supports "changes_requested" reruns)
    await db.supplierOffer.deleteMany({ where: { requestId } });
    let rank = 1;
    for (const e of evaluated) {
      await db.supplierOffer.create({
        data: {
          requestId,
          supplierId: e.supplierId,
          supplierProductId: e.supplierProductId,
          unitPrice: e.unitPrice,
          totalPrice: e.totalPrice,
          leadTimeDays: e.leadTimeDays,
          fitsDeadline: e.fitsDeadline,
          withinBudget: e.withinBudget,
          score: e.score,
          rank,
          reasonsJson: { reasons: e.reasons, flags: e.flags, breakdown: e.breakdown },
        },
      });
      rank++;
    }
    const avgTotal = evaluated.reduce((a, b) => a + b.totalPrice, 0) / evaluated.length;
    const spread = Math.max(...evaluated.map((e) => e.totalPrice)) - Math.min(...evaluated.map((e) => e.totalPrice));
    await setStage(requestId, "offers_compared", "Offers Compared", 3, {
      status: "done",
      summary: `Compared ${evaluated.length} offers for “${primaryItem}”. Average order value ${formatMoney(avgTotal, { compact: true })}; spread of ${formatMoney(spread, { compact: true })} between cheapest and most expensive.`,
      data: { count: evaluated.length, avgTotal, spread },
    });
    await logActivity({
      companyId: request.companyId,
      agentKey: "procurement",
      actor: AGENTS.procurement.name,
      action: "offers_compared",
      message: `${AGENTS.procurement.name} compared ${evaluated.length} offers across price, delivery and reliability`,
      requestId,
    });

    // ── Stage: Risk evaluated ─────────────────────────────────────────────
    await setStage(requestId, "risk_evaluated", "Risk Evaluated", 4, { status: "running" });
    const risky = evaluated.filter((e) => e.riskLevel !== "low");
    const riskSummary =
      risky.length === 0
        ? "No material supplier risks detected in this candidate set."
        : `${risky.length} of ${evaluated.length} suppliers carry elevated risk (${risky
            .map((r) => `${r.supplierName}: ${r.riskLevel}`)
            .join(", ")}). Risk-adjusted scoring applied.`;
    await setStage(requestId, "risk_evaluated", "Risk Evaluated", 4, {
      status: "done",
      summary: riskSummary,
      data: { flagged: risky.map((r) => ({ name: r.supplierName, level: r.riskLevel })) },
    });
    if (risky.length > 0)
      await logActivity({
        companyId: request.companyId,
        agentKey: "procurement",
        actor: "Risk Engine",
        action: "risk_flagged",
        level: "warning",
        message: `Risk Engine flagged ${risky.map((r) => r.supplierName).join(", ")} (${risky.map((r) => r.riskLevel).join("/")})`,
        requestId,
      });

    // ── Stage: Recommendation ─────────────────────────────────────────────
    await setStage(requestId, "recommendation_ready", "Recommendation Generated", 5, { status: "running" });
    const best = pickRecommendation(evaluated);
    if (!best) throw new Error("No viable offers");
    const rest = evaluated.filter((e) => e.supplierId !== best.supplierId);
    const avgCategoryPrice = candidates.reduce((a, b) => a + b.unitPrice, 0) / candidates.length;
    const reasoning = await ai.recommend({
      supplierName: best.supplierName,
      score: best.score,
      unitPrice: best.unitPrice,
      totalPrice: best.totalPrice,
      leadTimeDays: best.leadTimeDays,
      fitsDeadline: best.fitsDeadline,
      reliability: best.reliabilityScore,
      riskLevel: best.riskLevel,
      avgCategoryPrice,
      completedOrders: best.totalOrders,
      rejectedAlternatives: rest.slice(0, 3).map((r) => ({
        name: r.supplierName,
        reason:
          r.unitPrice > best.unitPrice
            ? `${((( r.unitPrice - best.unitPrice) / best.unitPrice) * 100).toFixed(1)}% more expensive (+${formatMoney(r.totalPrice - best.totalPrice, { compact: true })})`
            : `Delivery of ${r.leadTimeDays} days${r.fitsDeadline ? "" : " misses the deadline"} and reliability ${r.reliabilityScore.toFixed(0)}% vs ${best.reliabilityScore.toFixed(0)}%`,
      })),
    });

    await db.supplierOffer.updateMany({
      where: { requestId, supplierId: best.supplierId },
      data: { selected: true },
    });

    const requirements = approvalRequirements(best, evaluated);
    const recommendation = {
      ...offerSnapshot(best),
      headline: reasoning.headline,
      why: reasoning.reasons,
      risks: reasoning.risks,
      approvalRequirements: requirements,
      alternatives: rest.slice(0, 4).map((r) => ({
        supplierName: r.supplierName,
        totalPrice: r.totalPrice,
        leadTimeDays: r.leadTimeDays,
        reliabilityScore: r.reliabilityScore,
        riskLevel: r.riskLevel,
        score: r.score,
      })),
    };

    await db.purchaseRequest.update({
      where: { id: requestId },
      data: { recommendation: recommendation as never },
    });
    await setStage(requestId, "recommendation_ready", "Recommendation Generated", 5, {
      status: "done",
      summary: reasoning.headline,
      data: { recommendedSupplier: best.supplierName, total: best.totalPrice, score: best.score },
    });
    await logActivity({
      companyId: request.companyId,
      agentKey: "procurement",
      actor: AGENTS.procurement.name,
      action: "recommendation",
      level: "success",
      message: `FARMAN recommends ${best.supplierName} — ${formatMoney(best.totalPrice)}, delivery in ${best.leadTimeDays} days`,
      requestId,
      meta: { score: best.score, why: reasoning.reasons },
    });
    await bumpAgentTasks("procurement");

    // ── Approval gate (human-in-the-loop) ─────────────────────────────────
    if (requirements.length > 0) {
      const approval = await db.approval.upsert({
        where: { requestId },
        create: {
          companyId: request.companyId,
          requestId,
          type: requirements[0].type,
          title: `Approve supplier selection — ${best.supplierName}`,
          description: requirements.map((r) => r.description).join(" · "),
          payloadJson: recommendation as never,
        },
        update: {
          type: requirements[0].type,
          title: `Approve supplier selection — ${best.supplierName}`,
          description: requirements.map((r) => r.description).join(" · "),
          payloadJson: recommendation as never,
          status: APPROVAL_STATUS.pending,
          decidedById: null,
          decidedAt: null,
          decisionNote: null,
        },
      });
      await setStage(requestId, "approval", "Waiting for Approval", 6, {
        status: "waiting",
        summary: `Human approval required: ${requirements.map((r) => r.description).join("; ")}.`,
        data: { approvalId: approval.id, requirementTypes: requirements.map((r) => r.type) },
      });
      await db.purchaseRequest.update({
        where: { id: requestId },
        data: { status: REQUEST_STATUS.awaiting_approval },
      });
      await logActivity({
        companyId: request.companyId,
        agentKey: "orchestrator",
        actor: AGENTS.orchestrator.name,
        action: "approval_requested",
        level: "warning",
        message: `Waiting for human approval before issuing purchase order to ${best.supplierName}`,
        requestId,
      });
      await setAgentStatus("procurement", "waiting", `Awaiting approval — ${request.title}`);
      await setAgentStatus("orchestrator", "waiting", "Approval pending on procurement action");
      await bumpAgentTasks("orchestrator");
    } else {
      // Low-value policy path: execute autonomously.
      await executeApprovedOrder(requestId, request.createdById);
    }
  } catch (err) {
    console.error("[farman] pipeline error", err);
    await db.purchaseRequest.update({ where: { id: requestId }, data: { status: REQUEST_STATUS.failed } });
    await logActivity({
      companyId: request.companyId,
      agentKey: "orchestrator",
      actor: AGENTS.orchestrator.name,
      action: "pipeline_error",
      level: "error",
      message: "Workflow failed while processing this request",
      requestId,
    });
    await setAgentStatus("procurement", "error", "Pipeline error");
  }
}

// ── Execution after human decision ───────────────────────────────────────────

export async function executeApprovedOrder(requestId: string, userId: string) {
  const request = await db.purchaseRequest.findUnique({
    where: { id: requestId },
    include: { company: true },
  });
  if (!request || !request.recommendation) return;
  const rec = request.recommendation as Record<string, unknown>;

  await setAgentStatus("procurement", "working", `Executing approved order — ${request.title}`);

  // ── Stage: Purchase order created ────────────────────────────────────────
  await setStage(requestId, "po_created", "Purchase Order Created", 7, { status: "running" });
  const count = await db.purchaseOrder.count({ where: { companyId: request.companyId } });
  const poNumber = `PO-${new Date().getFullYear()}-${String(count + 101).padStart(4, "0")}`;
  const subtotal = Number(rec.totalPrice);
  const tax = Math.round(subtotal * 0.09 * 100) / 100;
  const expectedDelivery = new Date(Date.now() + Number(rec.leadTimeDays) * 86400000);

  const po = await db.purchaseOrder.create({
    data: {
      companyId: request.companyId,
      poNumber,
      requestId,
      supplierId: String(rec.supplierId),
      status: "issued",
      subtotal,
      tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      expectedDelivery,
      approvedById: userId,
      sentAt: new Date(),
      items: {
        create: [
          {
            description: `${request.quantity.toLocaleString()} × ${request.itemDescription}`,
            quantity: request.quantity,
            unitPrice: Number(rec.unitPrice),
            total: Math.round(request.quantity * Number(rec.unitPrice) * 100) / 100,
          },
        ],
      },
    },
  });
  await db.purchaseRequest.update({
    where: { id: requestId },
    data: { status: REQUEST_STATUS.completed },
  });
  await setStage(requestId, "po_created", "Purchase Order Created", 7, {
    status: "done",
    summary: `${poNumber} issued to ${String(rec.supplierName)} — ${formatMoney(po.total)} incl. 9% tax. Expected delivery ${expectedDelivery.toDateString().slice(4)}.`,
    data: { poNumber, poId: po.id, total: po.total },
  });
  await logActivity({
    companyId: request.companyId,
    agentKey: "procurement",
    actor: AGENTS.procurement.name,
    action: "po_created",
    level: "success",
    message: `Purchase order ${poNumber} issued to ${String(rec.supplierName)} (${formatMoney(po.total)})`,
    requestId,
    meta: { poNumber },
  });

  // Simulated supplier acknowledgment
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "confirmed" } });
  await logActivity({
    companyId: request.companyId,
    agentKey: "procurement",
    actor: "Supplier Channel (simulated)",
    action: "supplier_confirmed",
    message: `${String(rec.supplierName)} confirmed ${poNumber} — production slot booked`,
    requestId,
  });

  // ── Stage: Finance updated ───────────────────────────────────────────────
  await setStage(requestId, "finance_updated", "Finance Updated", 8, { status: "running" });
  await db.transaction.create({
    data: {
      companyId: request.companyId,
      type: "expense",
      category: "Procurement",
      description: `${poNumber} — ${String(rec.supplierName)} (${request.itemDescription})`,
      amount: po.total,
      date: new Date(),
      status: "pending",
      relatedType: "purchase_order",
      relatedId: po.id,
    },
  });
  const monthlyOpex = 138000;
  await setStage(requestId, "finance_updated", "Finance Updated", 8, {
    status: "done",
    summary: `Projected cash outflow of ${formatMoney(po.total)} recorded as pending payable. Cash position remains above the required ${(POLICY.cashBufferMonths * 100).toFixed(0)}% opex buffer.`,
    data: { payable: po.total },
  });
  await logActivity({
    companyId: request.companyId,
    agentKey: "finance_cfo",
    actor: AGENTS.finance_cfo.name,
    action: "finance_updated",
    message: `AI CFO recorded ${formatMoney(po.total)} pending payable against cash position`,
    requestId,
  });

  await db.approval.updateMany({
    where: { requestId, status: APPROVAL_STATUS.pending },
    data: { status: APPROVAL_STATUS.approved, decidedById: userId, decidedAt: new Date() },
  });
  await setStage(requestId, "approval", "Waiting for Approval", 6, { status: "done", summary: "Approved by human operator." });
  await setAgentStatus("procurement", "idle", null);
  await setAgentStatus("orchestrator", "idle", null);
}

export async function resolveApproval(opts: {
  approvalId: string;
  decision: "approved" | "rejected" | "changes_requested";
  userId: string;
  note?: string;
}) {
  const approval = await db.approval.findUnique({
    where: { id: opts.approvalId },
    include: { request: true },
  });
  if (!approval || !approval.request || approval.status !== APPROVAL_STATUS.pending) return;

  const request = approval.request;

  if (opts.decision === "approved") {
    await logActivity({
      companyId: approval.companyId,
      agentKey: "user",
      actor: "You",
      action: "approval_granted",
      level: "success",
      message: `Approved: ${approval.title}`,
      requestId: request.id,
    });
    await executeApprovedOrder(request.id, opts.userId);
  } else if (opts.decision === "rejected") {
    await db.approval.update({
      where: { id: approval.id },
      data: { status: APPROVAL_STATUS.rejected, decidedById: opts.userId, decidedAt: new Date(), decisionNote: opts.note },
    });
    await db.purchaseRequest.update({ where: { id: request.id }, data: { status: REQUEST_STATUS.rejected } });
    await db.workflowStage.updateMany({
      where: { requestId: request.id, status: "waiting" },
      data: { status: "failed", summary: "Rejected by human operator." },
    });
    await logActivity({
      companyId: approval.companyId,
      agentKey: "user",
      actor: "You",
      action: "approval_rejected",
      level: "warning",
      message: `Rejected recommendation for “${request.title}”${opts.note ? ` — “${opts.note}”` : ""}`,
      requestId: request.id,
    });
    await setAgentStatus("procurement", "idle", null);
    await setAgentStatus("orchestrator", "idle", null);
  } else {
    await db.approval.update({
      where: { id: approval.id },
      data: { status: APPROVAL_STATUS.changes_requested, decidedById: opts.userId, decidedAt: new Date(), decisionNote: opts.note },
    });
    await db.purchaseRequest.update({ where: { id: request.id }, data: { status: REQUEST_STATUS.changes_requested } });
    await logActivity({
      companyId: approval.companyId,
      agentKey: "user",
      actor: "You",
      action: "changes_requested",
      level: "warning",
      message: `Changes requested on “${request.title}”${opts.note ? ` — “${opts.note}”` : ""}. Re-evaluating alternatives…`,
      requestId: request.id,
    });
    await setAgentStatus("procurement", "working", "Re-evaluating alternative suppliers");
    // Re-run pipeline excluding the previously selected supplier.
    await runPipelineExcludingSelected(request.id, request.createdById);
  }
}

async function runPipelineExcludingSelected(requestId: string, userId: string) {
  const request = await db.purchaseRequest.findUnique({ where: { id: requestId } });
  if (!request) return;
  const rec = request.recommendation as Record<string, unknown> | null;
  const excluded = rec?.["supplierId"];
  if (excluded && typeof excluded === "string") {
    // Mark previous selection as not selected so evaluation picks next best.
    await db.supplierOffer.updateMany({ where: { requestId, supplierId: excluded }, data: { selected: false } });
  }
  await runProcurementPipeline(requestId);
}
