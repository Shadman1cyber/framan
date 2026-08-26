export type ID = string;

export type StageId =
  | "specify"
  | "source"
  | "compare"
  | "approve"
  | "execute"
  | "complete";

export type StageState = "completed" | "active" | "upcoming" | "blocked";

export interface Stage {
  id: StageId;
  label: string;
  state: StageState;
  enteredAt?: string;
  completedAt?: string;
}

export type StatusKind =
  | "needs_user"
  | "running"
  | "waiting_external"
  | "blocked"
  | "completed"
  | "failed";

export interface Company {
  id: ID;
  name: string;
  cashPosition: number;
  workspace: string;
}

export interface Role {
  id: ID;
  title: string;
  approvalLimit: number;
  canApprove: string[];
  cannotApprove: string[];
}

export interface User {
  id: ID;
  name: string;
  roleId: ID;
  title: string;
}

export interface Policy {
  id: ID;
  code: string;
  name: string;
  description: string;
  trigger: string;
}

export interface Agent {
  id: ID;
  name: string;
  purpose: string;
  status:
    | "idle"
    | "working"
    | "waiting_for_user"
    | "waiting_external"
    | "retrying";
  statusLine: string;
  worksOnWorkflowId?: ID;
  doesAutonomously: string[];
  escalatesWhen: string[];
}

export interface Supplier {
  id: ID;
  name: string;
  status: "incumbent" | "verified" | "new";
  location: string;
  onTimeRate?: number;
  ordersLast12m?: number;
  historyNote: string;
}

export interface PurchaseRequest {
  id: ID;
  workflowId: ID;
  title: string;
  description: string;
  requestedByName: string;
  quantity: number;
  unitLabel: string;
  category: string;
  neededBy: string;
  createdAt: string;
}

export interface RFQ {
  id: ID;
  purchaseRequestId: ID;
  sentToSupplierNames: string[];
  sentAt: string;
  responsesDue: string;
  responsesReceived: number;
  statusLine: string;
}

export interface OfferPolicyCheck {
  state: "pass" | "flagged";
  policyCode: string;
  note: string;
}

export interface Offer {
  id: ID;
  supplierId: ID;
  onTimeRate?: number;
  unitPrice: number;
  total: number;
  leadTimeDays: number;
  arrivalLabel: string;
  meetsDeadline: boolean;
  paymentTerms: string;
  paymentTermsNote?: string;
  policyCheck: OfferPolicyCheck;
  receivedAt: string;
  evidenceId: string;
  reliabilityDisplay: string;
  reliabilityConfidence?: "unproven" | "low";
  uncertaintyNote?: string;
}

export interface Recommendation {
  id: ID;
  offerId: ID;
  agentName: string;
  headline: string;
  because: string;
  notPickedNotes: Record<ID, string>;
  evidenceIds: string[];
}

export type Decision =
  | "pending"
  | "approved"
  | "rejected"
  | "change_requested"
  | "evidence_requested";

export interface Approval {
  id: ID;
  purchaseRequestId: ID;
  workflowId: ID;
  amount: number;
  assignedToName: string;
  requestedAt: string;
  expiresIn: string;
  requiredBecause: string;
  policyCode: string;
  ifApproved: string;
}

export interface PurchaseOrder {
  id: ID;
  offerId: ID;
  supplierName: string;
  amount: number;
  state: "drafted" | "sent" | "confirmed";
  note: string;
}

export interface Transaction {
  id: ID;
  label: string;
  workflowId?: ID;
  amount: number;
  state: "posted" | "scheduled" | "held_pending_approval" | "retry_queued";
  timing: string;
}

export interface BudgetCategory {
  id: ID;
  name: string;
  monthlyCap: number;
  committed: number;
}

export interface Evidence {
  id: ID;
  label: string;
  kind: "quote" | "policy" | "record" | "message" | "receipt";
  source: string;
  capturedAt: string;
  detail: string;
}

export interface ActivityEvent {
  id: ID;
  seq: number;
  at: string;
  workflowId: ID;
  actorName: string;
  actorKind: "agent" | "user" | "system";
  action: string;
  policyCode?: string;
  evidenceIds: string[];
  outcome: string;
}

export interface Workflow {
  id: ID;
  purchaseRequestId: ID;
  title: string;
  amount?: number;
  stages: Stage[];
  currentStageId: StageId;
  statusKind: StatusKind;
  statusLine: string;
  initiatedByName: string;
  openedAt: string;
}

export interface ExecutionStep {
  key: string;
  label: string;
  state:
    | "done"
    | "active"
    | "waiting_external"
    | "failed_retry"
    | "pending"
    | "stopped";
  detail: string;
}

export interface QueueItem {
  workflowId: ID;
  title: string;
  context: string;
  statusLabel: string;
  statusTone: "neutral" | "attention" | "good" | "bad";
  amount?: number;
  needsYou: boolean;
}
