import type { Decision, ExecutionStep, QueueItem, StatusKind, Workflow } from "./types";
import type { ChatJob } from "./store";
import {
  activityEvents,
  decisionEvents,
  mainWorkflowId,
  purchaseOrder,
  workflows,
} from "./mock-data";

export interface DemoState {
  decision: Decision;
}

export function getWorkflow(id: string, decision: Decision): Workflow {
  const base = workflows.find((w) => w.id === id);
  if (!base) return workflows[0];
  if (id !== mainWorkflowId) return base;

  const stages = base.stages.map((s) => ({ ...s }));

  if (decision === "approved") {
    const approve = stages.find((s) => s.id === "approve");
    const execute = stages.find((s) => s.id === "execute");
    if (approve) {
      approve.state = "completed";
      approve.completedAt = "Just now";
      delete approve.enteredAt;
    }
    if (execute) {
      execute.state = "active";
      execute.enteredAt = "just now";
    }
    return {
      ...base,
      stages,
      currentStageId: "execute",
      statusKind: "waiting_external",
      statusLine:
        "Executing — PO-5521 sent to Packline Industries. Waiting on supplier confirmation.",
    };
  }

  if (decision === "rejected") {
    const approve = stages.find((s) => s.id === "approve");
    if (approve) {
      approve.state = "blocked";
      delete approve.enteredAt;
    }
    return {
      ...base,
      stages,
      statusKind: "blocked",
      statusLine:
        "Stopped by your decision — nothing ordered, nothing spent. Suppliers notified of closure.",
    };
  }

  if (decision === "change_requested") {
    return {
      ...base,
      statusKind: "running",
      statusLine:
        "Revising the recommendation — pulling updated lead times from all three suppliers before you decide.",
    };
  }

  if (decision === "evidence_requested") {
    return {
      ...base,
      statusKind: "running",
      statusLine:
        "Collecting more evidence — requesting delivery records for Summit Flexible Packaging references.",
    };
  }

  return base;
}

export function getExecutionSteps(decision: Decision): ExecutionStep[] {
  if (decision === "rejected") return [];

  if (decision === "approved") {
    return [
      {
        key: "approved",
        label: "Approval granted",
        state: "done",
        detail: "Recorded by Alex Chen — just now.",
      },
      {
        key: "po-created",
        label: `Purchase order created — ${purchaseOrder.id}`,
        state: "done",
        detail: "Drafted from the accepted Packline quote (EV-110).",
      },
      {
        key: "po-sent",
        label: "Sent to Packline Industries",
        state: "done",
        detail: "Delivered to their ordering portal — receipt EV-131.",
      },
      {
        key: "confirmation",
        label: "Supplier confirmation",
        state: "waiting_external",
        detail: "Waiting on supplier response — order sent moments ago. Packline typically confirms within 4 business hours.",
      },
      {
        key: "financial-update",
        label: "Financial update",
        state: "pending",
        detail: "Net 30 payment scheduled for Oct 1 once Packline confirms.",
      },
      {
        key: "complete",
        label: "Completed",
        state: "pending",
        detail: "Closes when goods arrive — expected Sep 22.",
      },
    ];
  }

  const queuedNote =
    decision === "change_requested"
      ? "Queued — runs after the revised recommendation is approved."
      : decision === "evidence_requested"
        ? "Queued — runs after you decide with the new evidence."
        : "Queued until this approval is granted.";

  return [
    {
      key: "approved",
      label: "Approval granted",
      state: "active",
      detail:
        decision === "pending"
          ? "Waiting on your approval — entered this stage 6 minutes ago."
          : queuedNote,
    },
    { key: "po-created", label: `Purchase order created — ${purchaseOrder.id}`, state: "pending", detail: queuedNote },
    { key: "po-sent", label: "Sent to Packline Industries", state: "pending", detail: queuedNote },
    { key: "confirmation", label: "Supplier confirmation", state: "pending", detail: queuedNote },
    { key: "financial-update", label: "Financial update", state: "pending", detail: queuedNote },
    { key: "complete", label: "Completed", state: "pending", detail: queuedNote },
  ];
}

export function getExecutionStepsFor(
  workflowId: string,
  decision: Decision,
): ExecutionStep[] {
  if (workflowId === mainWorkflowId) return getExecutionSteps(decision);

  if (workflowId === "wf-1038") {
    return [
      { key: "approved", label: "Approval granted", state: "done", detail: "Priya Patel — Yesterday · 17:02." },
      { key: "po", label: "Purchase order created", state: "done", detail: "Card order placed with the roastery's online account." },
      { key: "sent", label: "Sent to supplier", state: "done", detail: "Order confirmed by the supplier's checkout." },
      { key: "confirm", label: "Supplier confirmation", state: "done", detail: "Delivery window received — today before noon." },
      { key: "fin", label: "Financial update", state: "done", detail: "$340 card charge settled and reconciled (EV-090)." },
      { key: "complete", label: "Completed", state: "done", detail: "Goods received at the breakroom · Today 9:41." },
    ];
  }

  if (workflowId === "wf-1044") {
    return [
      { key: "approved", label: "Approval granted", state: "done", detail: "Standing order — within policy limits, no human approval needed." },
      { key: "po", label: "Purchase order created", state: "done", detail: "PO-5514 created from the standing-order contract price." },
      { key: "sent", label: "Sent to supplier", state: "done", detail: "Delivered to the supplier portal · Today · 10:02." },
      { key: "confirm", label: "Supplier confirmation", state: "done", detail: "Confirmed · Today · 10:47. Delivery scheduled Aug 26." },
      {
        key: "fin",
        label: "Financial update",
        state: "failed_retry",
        detail:
          "Failed — ERP sync timed out at 11:42 (EV-150). Retry runs every 4 minutes; Farman escalates to Sam Ortiz after three failures.",
      },
      { key: "complete", label: "Completed", state: "pending", detail: "Closes when goods arrive Aug 26 and the ledger posting succeeds." },
    ];
  }

  if (workflowId === "wf-1045") {
    return [
      { key: "approved", label: "Approval granted", state: "pending", detail: "Queued — not yet reached; sourcing is still collecting quotes." },
      { key: "po", label: "Purchase order created", state: "pending", detail: "Starts after a recommendation is approved." },
    ];
  }

  return [];
}

export function getStatusTone(kind: StatusKind): QueueItem["statusTone"] {  switch (kind) {
    case "needs_user":
      return "attention";
    case "completed":
      return "good";
    case "blocked":
    case "failed":
      return "bad";
    default:
      return "neutral";
  }
}

export function needsYou(decision: Decision, jobs: ChatJob[] = []): QueueItem[] {
  const items: QueueItem[] = [];
  for (const job of jobs) {
    if (job.needsApproval) {
      items.push({
        workflowId: job.id,
        title: `${job.title} — approval required`,
        context:
          job.policyNote ??
          "Created from your chat request — Farman waits for sign-off before starting",
        statusLabel: "Approval required",
        statusTone: "attention",
        amount: job.amount,
        needsYou: true,
      });
    }
  }
  if (decision === "pending" || decision === "change_requested" || decision === "evidence_requested") {
    items.push({
      workflowId: "wf-1042",
      title: "Q4 retail packaging — approval required",
      context:
        decision === "pending"
          ? "Evaluation agent recommends Packline Industries at $15,500 — policy POL-2 requires your sign-off"
          : decision === "change_requested"
            ? "Evaluation agent is revising the recommendation with updated lead times — your review resumes when it returns"
            : "Sourcing agent is collecting delivery records for Summit Flexible Packaging — your review resumes shortly",
      statusLabel: decision === "pending" ? "Approval required" : "Revising",
      statusTone: "attention",
      amount: 15500,
      needsYou: true,
    });
  }
  if (decision !== "approved") {
    items.push({
      workflowId: "wf-1041",
      title: "Business cards reprint — approval expired",
      context: "No decision within 48 hours; Farman will resubmit tomorrow 9:00 unless you decide now",
      statusLabel: "Expired",
      statusTone: "bad",
      amount: 410,
      needsYou: true,
    });
  }
  return items;
}

export function runningItems(decision: Decision, jobs: ChatJob[] = []): QueueItem[] {
  const items: QueueItem[] = [];
  for (const job of jobs) {
    if (!job.needsApproval) {
      items.push({
        workflowId: job.id,
        title: job.title,
        context: "Queued by the orchestrator from your chat request — Specify stage assigned",
        statusLabel: "Queued",
        statusTone: "neutral",
        amount: job.amount,
        needsYou: false,
      });
    }
  }
  if (decision === "approved") {
    items.push({
      workflowId: "wf-1042",
      title: "Q4 retail packaging — executing",
      context:
        "Sourcing agent sent PO-5521 to Packline Industries — waiting on supplier confirmation",
      statusLabel: "On supplier",
      statusTone: "neutral",
      amount: 15500,
      needsYou: false,
    });
  }
  items.push(
    {
      workflowId: "wf-1045",
      title: "Safety gloves reorder",
      context:
        "Sourcing agent — RFQ sent to 3 suppliers 26 minutes ago, responses due 17:00",
      statusLabel: "On suppliers",
      statusTone: "neutral",
      amount: 980,
      needsYou: false,
    },
    {
      workflowId: "wf-1044",
      title: "Cleaning supplies restock",
      context:
        "Finance agent — ERP sync failing while posting the accrual; retry every 4 minutes",
      statusLabel: "Retrying",
      statusTone: "bad",
      amount: 1150,
      needsYou: false,
    },
    {
      workflowId: "wf-1040",
      title: "Warehouse label printer",
      context: "Blocked by POL-7 — second quote requested at 10:15, waiting on vendor",
      statusLabel: "Blocked",
      statusTone: "bad",
      amount: 2300,
      needsYou: false,
    },
  );
  return items;
}

export function completedToday(decision: Decision): QueueItem[] {
  const items: QueueItem[] = [
    {
      workflowId: "wf-1038",
      title: "Breakroom coffee beans restock",
      context: "Finance agent settled the card payment and filed the receipt",
      statusLabel: "Completed · 9:41",
      statusTone: "good",
      amount: 340,
      needsYou: false,
    },
  ];
  if (decision === "rejected") {
    items.unshift({
      workflowId: "wf-1042",
      title: "Q4 retail packaging — closed without purchase",
      context: "You rejected the recommendation; suppliers notified of closure",
      statusLabel: "Closed",
      statusTone: "neutral",
      amount: 0,
      needsYou: false,
    });
  }
  return items;
}

export function getActivityFeed(decision: Decision) {
  const extra = decisionEvents[decision];
  if (!extra) return activityEvents;
  const appended = extra.events.map((e, i) => ({
    ...e,
    seq: extra.seqBase + i,
    id: `act-d${i + 1}`,
  }));
  return [...appended, ...activityEvents].sort((a, b) => b.seq - a.seq);
}
