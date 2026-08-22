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
  id: "co-meridian",
  name: "Meridian Roasters",
  workspace: "Operations",
  cashPosition: 412800,
};

export const roles: Role[] = [
  {
    id: "role-director",
    title: "Operations director",
    approvalLimit: 25000,
    canApprove: [
      "Purchase orders up to $25,000",
      "Supplier selection within policy",
    ],
    cannotApprove: [
      "New-supplier awards of $5,000 or more (needs compliance verification first)",
      "Contracts longer than 12 months",
    ],
  },
  {
    id: "role-procurement-lead",
    title: "Procurement lead",
    approvalLimit: 5000,
    canApprove: ["Purchase orders up to $5,000"],
    cannotApprove: ["Any award to a new supplier", "Off-contract spend above $5,000"],
  },
  {
    id: "role-finance-partner",
    title: "Finance partner",
    approvalLimit: 50000,
    canApprove: [
      "Purchase orders up to $50,000",
      "Budget cap exceptions up to 10%",
    ],
    cannotApprove: ["Changes to supplier payment terms"],
  },
];

export const users: User[] = [
  {
    id: "u-alex",
    name: "Alex Chen",
    roleId: "role-director",
    title: "Operations director",
  },
  {
    id: "u-priya",
    name: "Priya Patel",
    roleId: "role-procurement-lead",
    title: "Procurement lead",
  },
  {
    id: "u-sam",
    name: "Sam Ortiz",
    roleId: "role-finance-partner",
    title: "Finance partner",
  },
];

export const policies: Policy[] = [
  {
    id: "pol-2",
    code: "POL-2",
    name: "Approval threshold",
    description:
      "Single purchase orders above $10,000 require sign-off from a director or above.",
    trigger: "Order total over $10,000",
  },
  {
    id: "pol-3",
    code: "POL-3",
    name: "Category budget caps",
    description:
      "Monthly committed spend per category may not exceed its budget cap without finance sign-off.",
    trigger: "Committed spend would exceed the category cap",
  },
  {
    id: "pol-5",
    code: "POL-5",
    name: "New-supplier verification",
    description:
      "A first purchase order of $5,000 or more with a new supplier requires identity and compliance verification before an award.",
    trigger: "Award to a new supplier at $5,000 or more",
  },
  {
    id: "pol-7",
    code: "POL-7",
    name: "Two-quote rule",
    description:
      "Purchases from vendors on the preferred list require two quotes; off-list vendors require three.",
    trigger: "Fewer quotes received than the rule requires",
  },
  {
    id: "pol-8",
    code: "POL-8",
    name: "Payment terms",
    description:
      "Net 30 is the default terms. Early-payment discounts are accepted at 1% or better.",
    trigger: "Terms outside Net 30 with no qualifying discount",
  },
];

export const agents: Agent[] = [
  {
    id: "ag-orchestrator",
    name: "Farman orchestrator",
    purpose:
      "Plans workflows into stages, sequences the specialist agents, and enforces policy checkpoints.",
    status: "working",
    statusLine:
      "Sequencing the sourcing workflow for Safety gloves reorder — RFQ dispatch in progress.",
    worksOnWorkflowId: "wf-1045",
    doesAutonomously: [
      "Plan and re-order workflow stages",
      "Route work between agents",
      "Pause a workflow when a checkpoint is not met",
    ],
    escalatesWhen: [
      "A policy requires human approval",
      "Two agents disagree on a required input",
    ],
  },
  {
    id: "ag-sourcing",
    name: "Sourcing agent",
    purpose:
      "Finds suppliers, sends requests for quotes, collects offers, and chases responses.",
    status: "waiting_external",
    statusLine:
      "Waiting on supplier response — RFQ sent to 3 suppliers 26 minutes ago for Safety gloves reorder.",
    worksOnWorkflowId: "wf-1045",
    doesAutonomously: [
      "Search approved supplier directories",
      "Send RFQs to shortlisted suppliers",
      "Collect and timestamp incoming offers",
    ],
    escalatesWhen: [
      "A supplier falls outside the approved directory",
      "No responses by the deadline",
    ],
  },
  {
    id: "ag-evaluation",
    name: "Evaluation agent",
    purpose:
      "Scores offers against the specification and policies, and drafts recommendations with supporting evidence.",
    status: "idle",
    statusLine:
      "Idle since 11:07 — last action was recommending Packline Industries for PR-1042.",
    worksOnWorkflowId: "wf-1042",
    doesAutonomously: [
      "Compare offers factor by factor against the spec",
      "Flag offers with missing or low-confidence evidence",
      "Draft a recommendation with reasons per rejected option",
    ],
    escalatesWhen: [
      "The recommendation exceeds an approval threshold",
      "Evidence is insufficient to compare two offers fairly",
    ],
  },
  {
    id: "ag-finance",
    name: "Finance agent",
    purpose:
      "Checks budgets, schedules payments, posts financial updates, and reconciles receipts.",
    status: "retrying",
    statusLine:
      "Retrying ERP sync — the financial update for Monthly cleaning supplies failed with a connection timeout. Next attempt in 4 minutes.",
    worksOnWorkflowId: "wf-1044",
    doesAutonomously: [
      "Check affordability against cash position and category budgets",
      "Schedule payments within approved terms",
      "Post financial updates once an order is confirmed",
    ],
    escalatesWhen: [
      "A posting fails twice in a row",
      "A transaction would push a category over its cap",
    ],
  },
];

export const suppliers: Supplier[] = [
  {
    id: "sup-packline",
    name: "Packline Industries",
    status: "incumbent",
    location: "Portland, OR",
    onTimeRate: 98,
    ordersLast12m: 24,
    historyNote: "24 orders with us in the last 12 months, 98% delivered on time.",
  },
  {
    id: "sup-verdepack",
    name: "VerdePack Co.",
    status: "new",
    location: "Sacramento, CA",
    historyNote: "New supplier — first contact through this request.",
  },
  {
    id: "sup-summit",
    name: "Summit Flexible Packaging",
    status: "verified",
    location: "Denver, CO",
    onTimeRate: 89,
    ordersLast12m: 6,
    historyNote: "6 orders in the last 6 months; 3 were delivered late.",
  },
];

export const purchaseRequest: PurchaseRequest = {
  id: "pr-1042",
  workflowId: "wf-1042",
  title: "Q4 retail packaging — 50,000 kraft stand-up pouches",
  description:
    "8 oz kraft stand-up pouches with one-way degassing valves, single-color print, for the Q4 retail launch. Stock must arrive by Sep 28 so launch prep can start Oct 1.",
  requestedByName: "Alex Chen",
  quantity: 50000,
  unitLabel: "pouches",
  category: "Packaging supplies",
  neededBy: "Sep 28",
  createdAt: "Today · 09:12",
};

export const rfq: RFQ = {
  id: "rfq-1042",
  purchaseRequestId: "pr-1042",
  sentToSupplierNames: [
    "Packline Industries",
    "VerdePack Co.",
    "Summit Flexible Packaging",
  ],
  sentAt: "Today · 09:24",
  responsesDue: "Today · 17:00",
  responsesReceived: 3,
  statusLine: "All 3 suppliers responded.",
};

export const offers: Offer[] = [
  {
    id: "off-packline",
    supplierId: "sup-packline",
    unitPrice: 0.31,
    total: 15500,
    leadTimeDays: 21,
    arrivalLabel: "Arrives Sep 22 — 6 days before your Sep 28 deadline",
    meetsDeadline: true,
    paymentTerms: "Net 30",
    policyCheck: {
      state: "pass",
      policyCode: "POL-5",
      note: "Verified incumbent supplier",
    },
    receivedAt: "Today · 10:40",
    evidenceId: "EV-110",
    reliabilityDisplay: "98% on time across 24 orders",
  },
  {
    id: "off-verdepack",
    supplierId: "sup-verdepack",
    unitPrice: 0.26,
    total: 13000,
    leadTimeDays: 35,
    arrivalLabel: "Arrives Oct 6 — after your Sep 28 deadline",
    meetsDeadline: false,
    paymentTerms: "Net 45",
    policyCheck: {
      state: "flagged",
      policyCode: "POL-5",
      note: "New supplier — identity and compliance verification required before any award of $5,000 or more",
    },
    receivedAt: "Today · 10:52",
    evidenceId: "EV-111",
    reliabilityDisplay: "No delivery history",
    reliabilityConfidence: "unproven",
    uncertaintyNote:
      "No delivery history — Farman cannot verify their reliability claims yet.",
  },
  {
    id: "off-summit",
    supplierId: "sup-summit",
    unitPrice: 0.36,
    total: 18000,
    leadTimeDays: 12,
    arrivalLabel: "Arrives Sep 13 — 15 days before your Sep 28 deadline",
    meetsDeadline: true,
    paymentTerms: "Net 30",
    paymentTermsNote: "2% discount if paid within 10 days",
    policyCheck: {
      state: "pass",
      policyCode: "POL-5",
      note: "Verified supplier",
    },
    receivedAt: "Today · 11:05",
    evidenceId: "EV-112",
    reliabilityDisplay: "89% on time across last 6 orders",
    reliabilityConfidence: "low",
    uncertaintyNote: "Based on only 6 recent orders — small sample.",
  },
];

export const recommendation: Recommendation = {
  id: "rec-1042",
  offerId: "off-packline",
  agentName: "Evaluation agent",
  headline: "Packline Industries — $15,500",
  because:
    "Farman recommends Packline Industries because it is the lowest-cost offer that meets your Sep 28 deadline, from the supplier with the strongest delivery record (98% on time across 24 orders).",
  notPickedNotes: {
    "sup-verdepack":
      "$2,500 cheaper, but the 35-day lead time arrives Oct 6 — after your deadline — and they are a new supplier with no delivery history.",
    "sup-summit":
      "Meets the deadline, but costs $2,500 (16%) more, and an 89% on-time rate (3 late deliveries in 6 months) adds schedule risk.",
  },
  evidenceIds: ["EV-110", "EV-111", "EV-112", "EV-120"],
};

export const approval: Approval = {
  id: "apr-1042",
  purchaseRequestId: "pr-1042",
  workflowId: "wf-1042",
  amount: 15500,
  assignedToName: "Alex Chen",
  requestedAt: "Today · 11:08",
  expiresIn: "expires in 48 hours",
  requiredBecause:
    "Approval required: policy POL-2 — purchase orders above $10,000 need director sign-off. This order is $15,500.",
  policyCode: "POL-2",
  ifApproved:
    "If you approve, Farman creates PO-5521, sends it to Packline Industries, schedules the Net 30 payment for Oct 1, and updates the packaging budget.",
};

export const purchaseOrder: PurchaseOrder = {
  id: "PO-5521",
  offerId: "off-packline",
  supplierName: "Packline Industries",
  amount: 15500,
  state: "drafted",
  note: "Drafted from the accepted quote (EV-110). Sent automatically once the approval is granted.",
};

export const budgetCategories: BudgetCategory[] = [
  { id: "cat-packaging", name: "Packaging supplies", monthlyCap: 60000, committed: 37600 },
  { id: "cat-ops", name: "Operations supplies", monthlyCap: 25000, committed: 9800 },
  { id: "cat-cafe", name: "Cafe & breakroom", monthlyCap: 12000, committed: 7450 },
];

export const evidenceRecords: Evidence[] = [
  {
    id: "EV-101",
    label: "Purchase request PR-1042",
    kind: "message",
    source: "Alex Chen",
    capturedAt: "Today · 09:12",
    detail:
      "\"We need 50k of our kraft pouches with valves ordered this week so stock lands before Q4 launch prep.\"",
  },
  {
    id: "EV-102",
    label: "Specification sheet — pouches rev B",
    kind: "record",
    source: "Evaluation agent",
    capturedAt: "Today · 09:15",
    detail:
      "50,000 units · 8 oz kraft stand-up · one-way degassing valve · 1-color print · food-grade liner. Deadline derived from launch date Oct 1.",
  },
  {
    id: "EV-103",
    label: "Supplier shortlist extract",
    kind: "record",
    source: "Sourcing agent",
    capturedAt: "Today · 09:20",
    detail:
      "6 suppliers matched 'kraft stand-up pouch, valve, ≤40 day lead'. Shortlisted Packline, VerdePack, Summit by capacity and certification match.",
  },
  {
    id: "EV-104",
    label: "RFQ-1042 dispatch record",
    kind: "record",
    source: "Sourcing agent",
    capturedAt: "Today · 09:24",
    detail: "Identical spec and response form sent to all 3 suppliers. Responses due 17:00 today.",
  },
  {
    id: "EV-110",
    label: "Quote — Packline Industries",
    kind: "quote",
    source: "Packline ordering portal",
    capturedAt: "Today · 10:40",
    detail:
      "$0.31/unit × 50,000 = $15,500 · 21-day lead · Net 30 · signed PDF attached to the offer record.",
  },
  {
    id: "EV-111",
    label: "Quote — VerdePack Co.",
    kind: "quote",
    source: "Email attachment",
    capturedAt: "Today · 10:52",
    detail:
      "$0.26/unit × 50,000 = $13,000 · 35-day lead · Net 45. No performance references provided.",
  },
  {
    id: "EV-112",
    label: "Quote — Summit Flexible Packaging",
    kind: "quote",
    source: "Summit customer portal",
    capturedAt: "Today · 11:05",
    detail:
      "$0.36/unit × 50,000 = $18,000 · 12-day lead · Net 30 with 2%/10 early-pay discount.",
  },
  {
    id: "EV-120",
    label: "Policy snapshot POL-2",
    kind: "policy",
    source: "Policies & permissions",
    capturedAt: "Today · 11:07",
    detail:
      "'Single purchase orders above $10,000 require director sign-off.' Applied to the recommended total of $15,500 → approval checkpoint inserted.",
  },
  {
    id: "EV-130",
    label: "PO-5521 record",
    kind: "record",
    source: "Farman orchestrator",
    capturedAt: "Just now",
    detail:
      "Created from accepted quote EV-110: Packline Industries, $15,500, terms Net 30, delivery window Sep 22.",
  },
  {
    id: "EV-131",
    label: "Portal delivery receipt",
    kind: "receipt",
    source: "Packline ordering portal",
    capturedAt: "Just now",
    detail: "PO-5521 accepted by the supplier portal. Confirmation pending from Packline.",
  },
  {
    id: "EV-140",
    label: "Budget ledger entry",
    kind: "record",
    source: "Finance agent",
    capturedAt: "Today · 11:07",
    detail:
      "Packaging supplies: $37,600 committed of $60,000 cap. Recommended award fits with $6,900 remaining after this order.",
  },
  {
    id: "EV-090",
    label: "Card receipt — coffee beans restock",
    kind: "receipt",
    source: "Corporate card feed",
    capturedAt: "Today · 09:41",
    detail: "$340 charged to Breakroom budget. Receipt filed against PR-1038.",
  },
  {
    id: "EV-150",
    label: "ERP error log — sync timeout",
    kind: "record",
    source: "Finance system integration",
    capturedAt: "Today · 11:42",
    detail:
      "Connection timeout while posting the cleaning-supplies accrual. Automatic retry queued every 4 minutes; no data lost.",
  },
];

export const workflows: Workflow[] = [
  {
    id: "wf-1042",
    purchaseRequestId: "pr-1042",
    title: "Q4 retail packaging — 50,000 kraft pouches",
    amount: 15500,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Today · 09:15" },
      { id: "source", label: "Source", state: "completed", completedAt: "Today · 11:05" },
      { id: "compare", label: "Compare", state: "completed", completedAt: "Today · 11:07" },
      { id: "approve", label: "Approve", state: "active", enteredAt: "6 minutes ago" },
      { id: "execute", label: "Execute", state: "upcoming" },
      { id: "complete", label: "Complete", state: "upcoming" },
    ],
    currentStageId: "approve",
    statusKind: "needs_user",
    statusLine: "Waiting on your approval — entered this stage 6 minutes ago.",
    initiatedByName: "Alex Chen",
    openedAt: "Today · 09:12",
  },
  {
    id: "wf-1038",
    purchaseRequestId: "pr-1038",
    title: "Restock breakroom coffee beans",
    amount: 340,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Yesterday · 16:20" },
      { id: "source", label: "Source", state: "completed", completedAt: "Yesterday · 16:35" },
      { id: "compare", label: "Compare", state: "completed", completedAt: "Yesterday · 16:44" },
      { id: "approve", label: "Approve", state: "completed", completedAt: "Yesterday · 17:02" },
      { id: "execute", label: "Execute", state: "completed", completedAt: "Today · 09:40" },
      { id: "complete", label: "Complete", state: "completed", completedAt: "Today · 09:41" },
    ],
    currentStageId: "complete",
    statusKind: "completed",
    statusLine: "Completed 9:41 today — card payment settled, receipt filed (EV-090).",
    initiatedByName: "Priya Patel",
    openedAt: "Yesterday · 16:18",
  },
  {
    id: "wf-1040",
    purchaseRequestId: "pr-1040",
    title: "Replace warehouse label printer",
    amount: 2300,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Today · 08:55" },
      { id: "source", label: "Source", state: "blocked", enteredAt: "Today · 09:02" },
      { id: "compare", label: "Compare", state: "upcoming" },
      { id: "approve", label: "Approve", state: "upcoming" },
      { id: "execute", label: "Execute", state: "upcoming" },
      { id: "complete", label: "Complete", state: "upcoming" },
    ],
    currentStageId: "source",
    statusKind: "blocked",
    statusLine:
      "Blocked by policy POL-7 — preferred-vendor purchases need 2 quotes; only 1 received. A second quote was requested at 10:15.",
    initiatedByName: "Sam Ortiz",
    openedAt: "Today · 08:54",
  },
  {
    id: "wf-1041",
    purchaseRequestId: "pr-1041",
    title: "Reprint sales team business cards",
    amount: 410,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Aug 29 · 14:10" },
      { id: "source", label: "Source", state: "completed", completedAt: "Aug 29 · 15:26" },
      { id: "compare", label: "Compare", state: "completed", completedAt: "Aug 29 · 15:31" },
      { id: "approve", label: "Approve", state: "active", enteredAt: "Aug 29 · 15:32" },
      { id: "execute", label: "Execute", state: "upcoming" },
      { id: "complete", label: "Complete", state: "upcoming" },
    ],
    currentStageId: "approve",
    statusKind: "needs_user",
    statusLine:
      "Approval expired — no decision within 48 hours. Farman will resubmit tomorrow at 9:00 unless you decide now.",
    initiatedByName: "Priya Patel",
    openedAt: "Aug 29 · 14:08",
  },
  {
    id: "wf-1044",
    purchaseRequestId: "pr-1044",
    title: "Monthly cleaning supplies restock",
    amount: 1150,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Today · 08:31" },
      { id: "source", label: "Source", state: "completed", completedAt: "Today · 09:48" },
      { id: "compare", label: "Compare", state: "completed", completedAt: "Today · 09:52" },
      { id: "approve", label: "Approve", state: "completed", completedAt: "Today · 10:01" },
      { id: "execute", label: "Execute", state: "active", enteredAt: "Today · 10:02" },
      { id: "complete", label: "Complete", state: "upcoming" },
    ],
    currentStageId: "execute",
    statusKind: "failed",
    statusLine:
      "Financial update failed — ERP sync timed out at 11:42. Retry queued every 4 minutes; the order itself is confirmed and unaffected.",
    initiatedByName: "Facilities standing order",
    openedAt: "Today · 08:30",
  },
  {
    id: "wf-1045",
    purchaseRequestId: "pr-1045",
    title: "Safety gloves reorder for floor staff",
    amount: 980,
    stages: [
      { id: "specify", label: "Specify", state: "completed", completedAt: "Today · 10:20" },
      { id: "source", label: "Source", state: "active", enteredAt: "Today · 10:26" },
      { id: "compare", label: "Compare", state: "upcoming" },
      { id: "approve", label: "Approve", state: "upcoming" },
      { id: "execute", label: "Execute", state: "upcoming" },
      { id: "complete", label: "Complete", state: "upcoming" },
    ],
    currentStageId: "source",
    statusKind: "waiting_external",
    statusLine:
      "Waiting on supplier response — RFQ sent to 3 suppliers 26 minutes ago; responses due 17:00.",
    initiatedByName: "Safety standing order",
    openedAt: "Today · 10:19",
  },
];

export const mainWorkflowId = "wf-1042";
export const mainApprovalId = "apr-1042";

type EventSeed = Omit<ActivityEvent, "id">;

const eventSeeds: EventSeed[] = [
  {
    seq: 1,
    at: "Today · 09:12",
    workflowId: "wf-1042",
    actorName: "Alex Chen",
    actorKind: "user",
    action: "Submitted purchase request PR-1042 — Q4 retail packaging.",
    evidenceIds: ["EV-101"],
    outcome: "Workflow wf-1042 created.",
  },
  {
    seq: 2,
    at: "Today · 09:13",
    workflowId: "wf-1042",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Planned a 6-stage workflow: Specify → Source → Compare → Approve → Execute → Complete.",
    evidenceIds: [],
    outcome: "Specification stage started.",
  },
  {
    seq: 3,
    at: "Today · 09:15",
    workflowId: "wf-1042",
    actorName: "Evaluation agent",
    actorKind: "agent",
    action: "Finalized the specification: 50,000 × 8 oz kraft pouches with degassing valve.",
    evidenceIds: ["EV-102"],
    outcome: "Deadline set to Sep 28 from the Oct 1 launch-prep requirement.",
  },
  {
    seq: 4,
    at: "Today · 09:20",
    workflowId: "wf-1042",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Shortlisted 3 suppliers from 6 directory matches.",
    evidenceIds: ["EV-103"],
    outcome: "Packline, VerdePack, Summit selected for quoting.",
  },
  {
    seq: 5,
    at: "Today · 09:21",
    workflowId: "wf-1042",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Applied policy POL-5 to VerdePack Co. (new supplier).",
    policyCode: "POL-5",
    evidenceIds: ["EV-103"],
    outcome: "VerdePack flagged: verification required before any award ≥ $5,000.",
  },
  {
    seq: 6,
    at: "Today · 09:24",
    workflowId: "wf-1042",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Sent identical RFQs to all 3 shortlisted suppliers.",
    evidenceIds: ["EV-104"],
    outcome: "Responses due 17:00 today.",
  },
  {
    seq: 7,
    at: "Today · 09:58",
    workflowId: "wf-1042",
    actorName: "System",
    actorKind: "system",
    action: "Supplier portal sync timed out during RFQ dispatch.",
    evidenceIds: [],
    outcome: "Automatic retry succeeded 4 minutes later; all 3 RFQs confirmed delivered.",
  },
  {
    seq: 8,
    at: "Today · 10:40",
    workflowId: "wf-1042",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Received offer from Packline Industries — $15,500, 21-day lead.",
    evidenceIds: ["EV-110"],
    outcome: "Offer 1 of 3 recorded.",
  },
  {
    seq: 9,
    at: "Today · 10:52",
    workflowId: "wf-1042",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Received offer from VerdePack Co. — $13,000, 35-day lead.",
    evidenceIds: ["EV-111"],
    outcome: "Offer 2 of 3 recorded. Reliability evidence missing — flagged.",
  },
  {
    seq: 10,
    at: "Today · 11:05",
    workflowId: "wf-1042",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Received offer from Summit Flexible Packaging — $18,000, 12-day lead.",
    evidenceIds: ["EV-112"],
    outcome: "Offer 3 of 3 recorded. Source stage complete.",
  },
  {
    seq: 11,
    at: "Today · 11:07",
    workflowId: "wf-1042",
    actorName: "Evaluation agent",
    actorKind: "agent",
    action: "Compared 3 offers on price, lead time, reliability, and terms.",
    evidenceIds: ["EV-110", "EV-111", "EV-112"],
    outcome: "Recommendation drafted: Packline Industries ($15,500) with reasons per rejected option.",
  },
  {
    seq: 12,
    at: "Today · 11:07",
    workflowId: "wf-1042",
    actorName: "Finance agent",
    actorKind: "agent",
    action: "Checked affordability: cash position $412,800; packaging budget $22,400 remaining of $60,000.",
    evidenceIds: ["EV-140"],
    outcome: "Affordable — payment lands Oct 1 under Net 30; category stays under cap.",
  },
  {
    seq: 13,
    at: "Today · 11:07",
    workflowId: "wf-1042",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Applied policy POL-2 to the recommended total of $15,500.",
    policyCode: "POL-2",
    evidenceIds: ["EV-120"],
    outcome: "Approval checkpoint inserted — director sign-off required.",
  },
  {
    seq: 14,
    at: "Today · 11:08",
    workflowId: "wf-1042",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Requested approval from Alex Chen (director, limit $25,000).",
    evidenceIds: ["EV-120"],
    outcome: "Waiting on Alex Chen — expires in 48 hours.",
  },
  {
    seq: 15,
    at: "Aug 29 · 15:32",
    workflowId: "wf-1041",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Requested approval from Priya Patel for business-card reprint ($410).",
    evidenceIds: [],
    outcome: "No decision within 48 hours.",
  },
  {
    seq: 16,
    at: "Aug 31 · 15:32",
    workflowId: "wf-1041",
    actorName: "System",
    actorKind: "system",
    action: "Approval request expired after 48 hours.",
    evidenceIds: [],
    outcome: "Farman scheduled a resubmission for tomorrow 9:00 unless decided sooner.",
  },
  {
    seq: 17,
    at: "Today · 09:40",
    workflowId: "wf-1038",
    actorName: "Finance agent",
    actorKind: "agent",
    action: "Settled $340 card payment for coffee-bean restock.",
    evidenceIds: ["EV-090"],
    outcome: "Receipt filed against PR-1038. Workflow complete.",
  },
  {
    seq: 18,
    at: "Today · 10:15",
    workflowId: "wf-1040",
    actorName: "Farman orchestrator",
    actorKind: "agent",
    action: "Blocked sourcing under policy POL-7 — only 1 quote for a preferred-list vendor.",
    policyCode: "POL-7",
    evidenceIds: [],
    outcome: "Second quote requested; workflow paused until it arrives.",
  },
  {
    seq: 19,
    at: "Today · 10:26",
    workflowId: "wf-1045",
    actorName: "Sourcing agent",
    actorKind: "agent",
    action: "Sent safety-gloves RFQ to 3 approved suppliers.",
    evidenceIds: [],
    outcome: "Waiting on first responses, due 17:00.",
  },
  {
    seq: 20,
    at: "Today · 11:42",
    workflowId: "wf-1044",
    actorName: "Finance agent",
    actorKind: "agent",
    action: "Attempted to post the cleaning-supplies accrual to the ERP.",
    evidenceIds: ["EV-150"],
    outcome: "Connection timeout — retry queued every 4 minutes. Order confirmation unaffected.",
  },
];

export const activityEvents: ActivityEvent[] = eventSeeds.map((e, i) => ({
  ...e,
  id: `act-${String(i + 1).padStart(3, "0")}`,
}));

// Decision-time events appended by the demo store.
export const decisionEvents: Record<
  string,
  { seqBase: number; events: Array<Omit<EventSeed, "seq">> }
> = {
  approved: {
    seqBase: 100,
    events: [
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Alex Chen",
        actorKind: "user",
        action: "Approved the recommendation: Packline Industries, $15,500 (PO-5521).",
        policyCode: "POL-2",
        evidenceIds: ["EV-110", "EV-120"],
        outcome: "Execution unlocked — orchestrator proceeding.",
      },
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Farman orchestrator",
        actorKind: "agent",
        action: "Created PO-5521 from the accepted Packline quote.",
        evidenceIds: ["EV-130"],
        outcome: "PO ready to send.",
      },
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Sourcing agent",
        actorKind: "agent",
        action: "Sent PO-5521 to the Packline ordering portal.",
        evidenceIds: ["EV-131"],
        outcome: "Portal accepted the order. Waiting on supplier confirmation.",
      },
    ],
  },
  rejected: {
    seqBase: 200,
    events: [
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Alex Chen",
        actorKind: "user",
        action: "Rejected the recommendation: Packline Industries, $15,500.",
        policyCode: "POL-2",
        evidenceIds: ["EV-110"],
        outcome: "Workflow stopped. Nothing ordered, nothing spent. Suppliers notified of closure.",
      },
    ],
  },
  change_requested: {
    seqBase: 300,
    events: [
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Alex Chen",
        actorKind: "user",
        action: "Requested changes to the recommendation.",
        evidenceIds: ["EV-110"],
        outcome: "Evaluation agent revising — pulling updated lead times from all three suppliers.",
      },
    ],
  },
  evidence_requested: {
    seqBase: 400,
    events: [
      {
        at: "Just now",
        workflowId: "wf-1042",
        actorName: "Alex Chen",
        actorKind: "user",
        action: "Asked for more evidence before deciding.",
        evidenceIds: ["EV-111"],
        outcome: "Requesting on-time delivery records for Summit Flexible Packaging references.",
      },
    ],
  },
};

export const transactionsSeed = [
  {
    id: "txn-901",
    label: "Coffee beans restock (PR-1038)",
    workflowId: "wf-1038",
    amount: -340,
    state: "posted" as const,
    timing: "Settled today · 09:41",
  },
  {
    id: "txn-884",
    label: "Packaging film top-up",
    amount: -2100,
    state: "posted" as const,
    timing: "Posted Aug 29",
  },
  {
    id: "txn-870",
    label: "Cafe equipment service",
    amount: -650,
    state: "posted" as const,
    timing: "Posted Aug 27",
  },
  {
    id: "txn-1044",
    label: "Cleaning supplies accrual (PR-1044)",
    workflowId: "wf-1044",
    amount: -1150,
    state: "retry_queued" as const,
    timing: "Retry every 4 min — ERP sync failing",
  },
];
