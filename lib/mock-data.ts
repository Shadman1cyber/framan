import type {
  ActivityEvent,
  Agent,
  Approval,
  BudgetCategory,
  Company,
  Evidence,
  Offer,
  Policy,
  PurchaseOrder,
  PurchaseRequest,
  Recommendation,
  RFQ,
  Role,
  Supplier,
  User,
  Workflow,
} from "./types";

export const company: Company = {
  id: "",
  name: "",
  workspace: "",
  cashPosition: 0,
};

export const roles: Role[] = [];

export const users: User[] = [];

export const policies: Policy[] = [];

export const agents: Agent[] = [];

export const suppliers: Supplier[] = [];

export const purchaseRequest: PurchaseRequest = {
  id: "",
  workflowId: "",
  title: "",
  description: "",
  requestedByName: "",
  quantity: 0,
  unitLabel: "",
  category: "",
  neededBy: "",
  createdAt: "",
};

export const rfq: RFQ = {
  id: "",
  purchaseRequestId: "",
  sentToSupplierNames: [],
  sentAt: "",
  responsesDue: "",
  responsesReceived: 0,
  statusLine: "",
};

export const offers: Offer[] = [];

export const recommendation: Recommendation = {
  id: "",
  offerId: "",
  agentName: "",
  headline: "",
  because: "",
  notPickedNotes: {},
  evidenceIds: [],
};

export const approval: Approval = {
  id: "",
  purchaseRequestId: "",
  workflowId: "",
  amount: 0,
  assignedToName: "",
  requestedAt: "",
  expiresIn: "",
  requiredBecause: "",
  policyCode: "",
  ifApproved: "",
};

export const purchaseOrder: PurchaseOrder = {
  id: "",
  offerId: "",
  supplierName: "",
  amount: 0,
  state: "drafted",
  note: "",
};

export const budgetCategories: BudgetCategory[] = [];

export const evidenceRecords: Evidence[] = [];

export const workflows: Workflow[] = [];

export const mainWorkflowId = "wf-1042";
export const mainApprovalId = "apr-1042";

type EventSeed = Omit<ActivityEvent, "id">;

const eventSeeds: EventSeed[] = [];

export const activityEvents: ActivityEvent[] = eventSeeds.map((e, i) => ({
  ...e,
  id: `act-${String(i + 1).padStart(3, "0")}`,
}));

// Decision-time events appended by the demo store.
export const decisionEvents: Record<
  string,
  { seqBase: number; events: Array<Omit<EventSeed, "seq">> }
> = {
  approved: { seqBase: 100, events: [] },
  rejected: { seqBase: 200, events: [] },
  change_requested: { seqBase: 300, events: [] },
  evidence_requested: { seqBase: 400, events: [] },
};

// هزینهٔ روزانهٔ ۱۴ روز اخیر (ریال) — برای نمودار صفحهٔ مالی
export const spendLast14Days: Array<{ label: string; amount: number }> = [];

export const transactionsSeed = [];
