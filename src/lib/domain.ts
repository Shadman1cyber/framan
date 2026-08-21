// Shared domain vocabulary for FARMAN. Single source of truth for statuses,
// agent identities and policy thresholds. UI and agents both import from here.

export const AGENTS = {
  orchestrator: {
    key: "orchestrator",
    name: "AI Orchestrator",
    role: "Coordinates all FARMAN agents",
  },
  procurement: {
    key: "procurement",
    name: "Procurement Agent",
    role: "Sources, evaluates and executes purchasing",
  },
  finance_cfo: {
    key: "finance_cfo",
    name: "AI CFO",
    role: "Financial analysis, cash & budget guardrails",
  },
  business: {
    key: "business",
    name: "Business Agent",
    role: "Turns ideas into executable business plans",
  },
} as const;

export type AgentKey = keyof typeof AGENTS;

export const REQUEST_STATUS = {
  processing: "processing",
  awaiting_approval: "awaiting_approval",
  approved: "approved",
  rejected: "rejected",
  changes_requested: "changes_requested",
  completed: "completed",
  failed: "failed",
} as const;
export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export const STAGE_KEYS = [
  "created",
  "parsed",
  "suppliers_found",
  "offers_compared",
  "risk_evaluated",
  "recommendation_ready",
  "approval",
  "po_created",
  "finance_updated",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const APPROVAL_STATUS = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  changes_requested: "changes_requested",
} as const;

export const PO_STATUS = {
  issued: "issued",
  confirmed: "confirmed",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
} as const;

export const PRIORITY = {
  low: "low",
  normal: "normal",
  high: "high",
  urgent: "urgent",
} as const;

// ---- Currency --------------------------------------------------------------
// The demo company operates in Iranian Rial (IRR). All stored amounts and
// policy thresholds are expressed in this currency. 1 Toman = 10 Rial.
export const APP_CURRENCY = "IRR";
/** Demo conversion used for seeding realistic figures. */
export const USD_TO_IRR = 1_000_000;

// ---- Policy (human-in-the-loop thresholds) --------------------------------
// FARMAN acts autonomously below these limits; above them a human decides.
export const POLICY = {
  autoApproveLimit: 500_000_000, // 500M IRR (~$500) autonomous-execution ceiling
  newSupplierRequiresApproval: true,
  highRiskReliabilityBelow: 80, // reliability % that counts as risky
  unusualPriceDeviationPct: 25, // offer price deviation vs category median (%)
  cashBufferMonths: 0.5, // months of opex that must remain after any purchase
};

export const PRODUCT_CATEGORIES = [
  "Packaging",
  "Raw Materials",
  "Components",
  "Logistics",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function isAgentKey(v: string): v is AgentKey {
  return Object.prototype.hasOwnProperty.call(AGENTS, v);
}
