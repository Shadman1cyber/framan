import { z } from "zod";

/* ── Tool proposal schemas ───────────────────────────────────────────────
 * Every tool is named, scoped and schema-validated. The model can only
 * propose; the server resolves identity, permission, scope and approval.  */

export const proposalSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("get_ai_status"), input: z.object({}).strict() }).strict(),
  z.object({ tool: z.literal("set_ai_enabled"), input: z.object({ enabled: z.boolean() }).strict() }).strict(),
  z.object({ tool: z.literal("calculate_sales_report"), input: z.object({
    from: z.string().datetime(), to: z.string().datetime(),
  }).strict().refine(v => Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000, "range must be positive and <=31 days") }).strict(),
  // Material-cost profit — honest insufficiency when recipes/costs are missing.
  z.object({ tool: z.literal("calculate_profit_report"), input: z.object({
    from: z.string().datetime(), to: z.string().datetime(),
  }).strict().refine(v => Date.parse(v.to) > Date.parse(v.from) && Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000, "range must be positive and <=31 days") }).strict(),
  // R07: generate a downloadable CSV/XLSX report or SVG chart from the same
  // shared source as the UI. Creates a private artifact; never mutates business data.
  z.object({ tool: z.literal("generate_sales_artifact"), input: z.object({
    kind: z.enum(["sales_report_csv", "sales_report_xlsx", "sales_chart_svg"]),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).strict().refine(v => Boolean(v.day) !== Boolean(v.from || v.to) && (!v.from || v.from !== v.to), "provide day OR from+to") }).strict(),
  z.object({ tool: z.literal("search_catalog"), input: z.object({ query: z.string().trim().min(2).max(200) }).strict() }).strict(),
  // R06: analyse the contents of one of the run's uploaded attachments.
  z.object({ tool: z.literal("analyze_attachment"), input: z.object({
    attachmentId: z.string().trim().min(1).max(64).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_lessons"), input: z.object({ topic: z.string().trim().min(2).max(60).optional() }).strict() }).strict(),
  // Scoped café reads (R05). Every output is source-backed; no free-form query.
  z.object({ tool: z.literal("get_order"), input: z.object({ orderId: z.string().trim().min(1).max(64) }).strict() }).strict(),
  z.object({ tool: z.literal("list_orders"), input: z.object({
    status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]).optional(),
    take: z.number().int().min(1).max(20).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("get_product"), input: z.object({ productId: z.string().trim().min(1).max(64) }).strict() }).strict(),
  z.object({ tool: z.literal("list_inventory"), input: z.object({
    lowOnly: z.boolean().optional(),
    take: z.number().int().min(1).max(30).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_staff"), input: z.object({}).strict() }).strict(),
  z.object({ tool: z.literal("suggest_staff_per_hour"), input: z.object({
    days: z.number().int().min(7).max(31).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_reservations"), input: z.object({
    take: z.number().int().min(1).max(20).optional(),
  }).strict() }).strict(),
  // Full admin-section coverage (R05 extension): every remaining section is
  // reachable read-only, bounded, no free-form SQL and no secrets exposed.
  z.object({ tool: z.literal("list_products"), input: z.object({
    take: z.number().int().min(1).max(30).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_categories"), input: z.object({}).strict() }).strict(),
  z.object({ tool: z.literal("list_tables"), input: z.object({}).strict() }).strict(),
  z.object({ tool: z.literal("list_qr_codes"), input: z.object({
    take: z.number().int().min(1).max(20).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_users"), input: z.object({
    take: z.number().int().min(1).max(20).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_ratings"), input: z.object({
    take: z.number().int().min(1).max(20).optional(),
  }).strict() }).strict(),
  z.object({ tool: z.literal("list_allergens"), input: z.object({}).strict() }).strict(),
  // Business writes (R05) — each requires an exact approval bound to the
  // target, its observed version, the approving user and a 10-minute expiry.
  z.object({ tool: z.literal("change_order_status"), input: z.object({
    orderId: z.string().trim().min(1).max(64),
    status: z.enum(["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]),
    reason: z.string().trim().min(3).max(300),
  }).strict() }).strict(),
  z.object({ tool: z.literal("update_price"), input: z.object({
    productId: z.string().trim().min(1).max(64),
    coffeeLineId: z.string().trim().min(1).max(64).optional(),
    price: z.number().int().positive(),
    reason: z.string().trim().min(3).max(300),
  }).strict() }).strict(),
  z.object({ tool: z.literal("adjust_inventory"), input: z.object({
    ingredientId: z.string().trim().min(1).max(64),
    delta: z.number().refine(v => Number.isFinite(v) && v !== 0),
    reason: z.string().trim().min(3).max(300),
    allowNegativeDelta: z.boolean().optional(),
  }).strict() }).strict(),
]);
export type Proposal = z.infer<typeof proposalSchema>;

/** Bounded multi-step plan (R04): 1–3 sequential, independently verified steps. */
export const planSchema = z.object({
  steps: z.array(proposalSchema).min(1).max(3),
}).strict().refine(p => p.steps.filter(s => WRITE_TOOLS.has(s.tool)).length <= 1,
  "Each plan supports at most one write; submit further writes as separate approved requests");
export type Plan = z.infer<typeof planSchema>;

export const requestSchema = z.object({
  key: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  question: z.string().trim().min(2).max(1000).optional(),
  proposal: proposalSchema.optional(),
  // Conversation linkage; validated (existence + ownership) in the runtime.
  sessionId: z.string().trim().min(1).max(64).optional(),
  attachmentIds: z.array(z.string().trim().min(1).max(64)).max(5).optional(),
}).strict().refine(v => Boolean(v.question) !== Boolean(v.proposal), "provide question OR proposal");

export const controlSchema = z.object({
  action: z.enum(["execute", "approve", "reject", "pause", "resume", "cancel", "correct", "spawn"]),
  inputHash: z.string().length(64).optional(),
  note: z.string().trim().min(2).max(500).optional(),
  subtask: z.object({
    task: z.string().trim().min(5).max(300),
    role: z.enum(["data_research", "finance"]),
    proposal: proposalSchema,
  }).strict().optional(),
}).strict().refine(v => v.action !== "correct" || Boolean(v.note), "correct requires note").refine(v => v.action !== "spawn" || Boolean(v.subtask), "spawn requires subtask");

/** Phase 6 subagent roles: fixed, read-only tool sets — subsets of supervisor capability. */
export const SUBAGENT_ROLES = {
  data_research: ["get_ai_status", "search_catalog", "list_lessons"],
  finance: ["calculate_sales_report"],
} as const;
export const SUBAGENT_LIMITS = { maxConcurrentChildren: 3, maxTotalToolCalls: 12, maxDepth: 1 } as const;
export const lessonProposalSchema = z.object({
  topic: z.string().trim().min(3).max(60),
  statement: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().min(1).max(64)).min(1).max(10),
}).strict();
export const lessonControlSchema = z.object({ action: z.enum(["activate", "reject", "expire"]) }).strict();

/** Phase 5 skill contract. successCriteria must now be STRUCTURED and
 *  deterministically evaluable (R08): free-text criteria are accepted for
 *  legacy drafts but marked visibly unverified and block activation. */
export const successCriterionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step_succeeded"), step: z.number().int().min(0) }).strict(),
  z.object({ type: z.literal("result_field_equals"), step: z.number().int().min(0), field: z.string().trim().min(1).max(60), value: z.union([z.string(), z.number(), z.boolean()]) }).strict(),
  z.object({ type: z.literal("result_count_at_least"), step: z.number().int().min(0), value: z.number().int().min(0) }).strict(),
]);
export type SuccessCriterion = z.infer<typeof successCriterionSchema>;

export const skillStepSchema = z.object({ tool: z.string().min(1), input: z.record(z.unknown()) }).strict();
export const skillDefinitionSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{3,40}$/),
  version: z.string().trim().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().trim().min(5).max(300),
  triggers: z.array(z.string().trim().min(2).max(40)).min(1).max(5),
  allowedTools: z.array(z.string()).min(1).max(5),
  steps: z.array(skillStepSchema).min(1).max(10),
  // Structured criteria (new). Plain strings are accepted as LEGACY criteria:
  // such versions are marked unevaluable and stay visibly unverified until
  // migrated (activation is blocked by CRITERIA_UNEVALUABLE in the runtime).
  successCriteria: z.array(z.union([successCriterionSchema, z.object({ description: z.string().trim().min(2).max(200) }).strict(), z.string().trim().min(2).max(200)])).min(1).max(5),
}).strict().superRefine((v, ctx) => {
  const allowed = new Set(Object.keys(TOOL_CONTRACTS));
  for (const t of v.allowedTools) if (!allowed.has(t)) ctx.addIssue({ code: "custom", message: `unknown tool ${t}` });
  const allowedSet = new Set(v.allowedTools);
  for (const step of v.steps) {
    if (!allowedSet.has(step.tool)) ctx.addIssue({ code: "custom", message: `step tool ${step.tool} not in allowedTools` });
    const parsed = proposalSchema.safeParse({ tool: step.tool, input: step.input });
    if (!parsed.success) ctx.addIssue({ code: "custom", message: `invalid input for ${step.tool}` });
  }
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

export const TOOL_CONTRACTS = {
  get_ai_status: { permission: "ai.use", risk: "read", timeoutMs: 5000, verification: "live Setting read" },
  set_ai_enabled: { permission: "ai.configure", risk: "reversible_write", timeoutMs: 5000, verification: "transactional Setting read-back", approval: "exact input hash + setting version + 10 minute expiry" },
  calculate_sales_report: { permission: "finance.view", risk: "read", timeoutMs: 5000, verification: "COMPLETED Order SQL aggregate; integer tomans; UTC [from,to)" },
  calculate_profit_report: { permission: "finance.view", risk: "read", timeoutMs: 5000, verification: "revenue from COMPLETED orders minus recorded recipe ingredient costs; when any sold product lacks a recipe, a matching unit or a recorded costPerUnit the receipt reports insufficient data instead of an estimate" },
  generate_sales_artifact: { permission: "finance.view", risk: "read", timeoutMs: 5000, verification: "same shared completedSalesSummary source as chat/UI; private artifact bytes + AgentArtifact row recorded with the source interval; no business mutation" },
  search_catalog: { permission: "ai.use", risk: "read", timeoutMs: 5000, verification: "provenance + watermark freshness; may sync derived Graph* tables only, never business data" },
  analyze_attachment: { permission: "ai.use", risk: "read", timeoutMs: 5000, verification: "stored attachment bytes re-read and aggregated deterministically; totals never model-invented" },
  list_lessons: { permission: "ai.use", risk: "read", timeoutMs: 5000, verification: "active valid lessons only, each with run-evidence refs resolved live from AgentRun" },
  get_order: { permission: "orders.view", risk: "read", timeoutMs: 5000, verification: "live Order + items read; historical item prices preserved" },
  list_orders: { permission: "orders.view", risk: "read", timeoutMs: 5000, verification: "bounded live Order list; status filter only, no free-form SQL" },
  get_product: { permission: "products.manage", risk: "read", timeoutMs: 5000, verification: "live Product read with current price and coffee-line prices" },
  list_inventory: { permission: "ingredients.manage", risk: "read", timeoutMs: 5000, verification: "live Ingredient quantities with unit and thresholds" },
  list_staff: { permission: "staff.manage", risk: "read", timeoutMs: 5000, verification: "live Staff read; no personal secrets exposed" },
  suggest_staff_per_hour: { permission: "staff.manage", risk: "read", timeoutMs: 5000, verification: "Tehran-hour order counts over a bounded recent window; deterministic staffing heuristic" },
  list_reservations: { permission: "tables.manage", risk: "read", timeoutMs: 5000, verification: "live TableReservation read, upcoming first" },
  list_products: { permission: "products.manage", risk: "read", timeoutMs: 5000, verification: "bounded live Product list; no secrets" },
  list_categories: { permission: "categories.manage", risk: "read", timeoutMs: 5000, verification: "live Category list with product counts" },
  list_tables: { permission: "tables.manage", risk: "read", timeoutMs: 5000, verification: "live CafeTable list with occupancy; no codes" },
  list_qr_codes: { permission: "qr.manage", risk: "read", timeoutMs: 5000, verification: "bounded live QRCode list (owner-only surface)" },
  list_users: { permission: "users.manage", risk: "read", timeoutMs: 5000, verification: "bounded live User list; passwordHash/phone never exposed" },
  list_ratings: { permission: "ratings.moderate", risk: "read", timeoutMs: 5000, verification: "bounded live Rating list with product names" },
  list_allergens: { permission: "allergens.manage", risk: "read", timeoutMs: 5000, verification: "live Allergen list" },
  change_order_status: { permission: "orders.status", risk: "business_write", timeoutMs: 5000, verification: "state machine + atomic order/table/receipt transaction", approval: "exact input hash + order version + before/after status + 10 minute expiry" },
  update_price: { permission: "products.manage", risk: "business_write", timeoutMs: 5000, verification: "narrow price service read-back; historical order items untouched", approval: "exact input hash + target version + before/after price + 10 minute expiry" },
  adjust_inventory: { permission: "ingredients.manage", risk: "business_write", timeoutMs: 5000, verification: "delta applied with before/after/delta/unit audited; negative result rejected", approval: "exact input hash + ingredient version + before/after quantity + 10 minute expiry" },
} as const;

export type ToolName = keyof typeof TOOL_CONTRACTS;

/** Tools that mutate business state and therefore always require an approval card. */
export const WRITE_TOOLS = new Set<string>(["set_ai_enabled", "change_order_status", "update_price", "adjust_inventory"]);

export class AgentError extends Error {
  /** policy: rejected before any effect; run stays retryable. execution: deterministic failure after the tool started; run becomes terminal `failed`. */
  constructor(public code: string, public status = 409, public phase: "policy" | "execution" = "policy") { super(code); }
}
