// ─────────────────────────────────────────────────────────────────────────────
// FARMAN AI Layer
//
// Every "intelligent" decision in FARMAN flows through an AIProvider. The
// prototype ships a deterministic MockProvider (rule-based reasoning over the
// business knowledge graph) so demos never depend on an external API.
// Swapping in OpenAI / Anthropic / DeepSeek / a local LLM means implementing
// this interface — no call-site changes required.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedRequirement {
  category: string;
  itemType: string;
  quantity: number;
  unit: string;
  urgency: "low" | "normal" | "high";
  constraints: string[];
  summary: string;
}

export interface RecommendationReasoning {
  headline: string;
  reasons: string[];
  risks: string[];
}

export interface CfoAnswer {
  intent:
    | "affordability"
    | "cashflow"
    | "expenses"
    | "suppliers_cost"
    | "attention"
    | "unknown";
  title: string;
  answer: string;
  bullets: string[];
  metrics?: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
  link?: { label: string; href: string };
}

export type BusinessPlan = {
  name: string;
  concept: string;
  targetCustomers: string;
  revenueModel: string;
  products: { name: string; description: string; priceRange: string }[];
  operations: string[];
  suppliersNeeded: { category: string; notes: string }[];
  costBreakdown: { item: string; amount: number; note: string }[];
  assumptions: { label: string; value: string }[];
  projectedMonthlyRevenue: number;
  projectedMonthlyCost: number;
};

export type CommandIntentResult =
  | { intent: "procurement"; quantity: number; itemType: string; confidence: number }
  | { intent: "affordability"; amount?: number; confidence: number }
  | { intent: "expenses"; confidence: number }
  | { intent: "cashflow"; confidence: number }
  | { intent: "attention"; confidence: number }
  | { intent: "business_setup"; idea: string; confidence: number }
  | { intent: "unknown"; confidence: 0 };

export interface AIProvider {
  readonly name: string;

  parsePurchaseRequest(input: {
    title: string;
    itemDescription: string;
    quantity: number;
    unit: string;
    priority: string;
    neededBy: Date | null;
    notes?: string | null;
  }): Promise<ParsedRequirement>;

  recommend(input: {
    supplierName: string;
    score: number;
    unitPrice: number;
    totalPrice: number;
    leadTimeDays: number;
    fitsDeadline: boolean;
    reliability: number;
    riskLevel: string;
    avgCategoryPrice: number;
    completedOrders: number;
    rejectedAlternatives: { name: string; reason: string }[];
  }): Promise<RecommendationReasoning>;

  answerFinanceQuestion(
    question: string,
    context: Record<string, unknown>
  ): Promise<CfoAnswer>;

  setupBusiness(idea: string): Promise<BusinessPlan>;
}

import { formatMoney } from "@/lib/format";

// ── Mock implementation (deterministic, rule-based) ──────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Packaging: [
    "packaging", "box", "boxes", "carton", "cartons", "corrugated", "stretch film",
    "wrap", "pallet", "pallets", "sack", "sacks", "label", "labels", "tape",
    "strapping", "kraft", "shrink", "container", "bag", "bags",
  ],
  "Raw Materials": [
    "granules", "hdpe", "ldpe", "pp", "polymer", "resin", "masterbatch", "ink",
    "additive", "chemical", "pellets",
  ],
  Components: ["metal", "steel", "ceramic", "fitting", "valve", "component", "part", "parts"],
  Logistics: ["freight", "shipping", "transport", "customs", "warehousing"],
};

function detectCategory(text: string): string {
  const t = text.toLowerCase();
  let best: { cat: string; hits: number } = { cat: "", hits: 0 };
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > best.hits) best = { cat, hits };
  }
  return best.cat || "Packaging";
}

class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async parsePurchaseRequest(input: {
    title: string;
    itemDescription: string;
    quantity: number;
    unit: string;
    priority: string;
    neededBy: Date | null;
    notes?: string | null;
  }): Promise<ParsedRequirement> {
    const text = `${input.title} ${input.itemDescription} ${input.notes ?? ""}`;
    const category = detectCategory(text);
    const daysUntil = input.neededBy
      ? Math.ceil((input.neededBy.getTime() - Date.now()) / 86400000)
      : null;
    const urgency =
      input.priority === "urgent" || input.priority === "high" || (daysUntil !== null && daysUntil <= 10)
        ? "high"
        : "normal";

    const constraints: string[] = [];
    if (daysUntil !== null)
      constraints.push(`Delivery required within ~${Math.max(daysUntil, 1)} days`);
    if (/food|export|pharma|medical/i.test(text))
      constraints.push("Export-grade quality documentation expected");
    if (input.notes && /recycl|eco|green/i.test(input.notes))
      constraints.push("Recyclable materials preferred");

    const itemType = input.itemDescription.trim().replace(/\s+/g, " ");
    return {
      category,
      itemType,
      quantity: input.quantity,
      unit: input.unit,
      urgency,
      constraints,
      summary:
        `Requirement understood: ${input.quantity.toLocaleString()} × ${itemType} ` +
        `(category: ${category}${daysUntil !== null ? `, needed in ~${Math.max(daysUntil, 1)} days` : ""}). ` +
        `FARMAN will source qualified suppliers in ${category}, request indicative offers and evaluate price, delivery and reliability.`,
    };
  }

  async recommend(input: {
    supplierName: string;
    score: number;
    unitPrice: number;
    totalPrice: number;
    leadTimeDays: number;
    fitsDeadline: boolean;
    reliability: number;
    riskLevel: string;
    avgCategoryPrice: number;
    completedOrders: number;
    rejectedAlternatives: { name: string; reason: string }[];
  }): Promise<RecommendationReasoning> {
    const deltaPct = ((input.avgCategoryPrice - input.unitPrice) / input.avgCategoryPrice) * 100;
    const cheapest = input.rejectedAlternatives.length > 0 ? undefined : undefined;
    void cheapest;
    const reasons: string[] = [];
    if (deltaPct >= 2)
      reasons.push(`${deltaPct.toFixed(1)}% below category average price`);
    else if (input.fitsDeadline && input.leadTimeDays <= 5)
      reasons.push(`Fastest dependable delivery (${input.leadTimeDays} days) that fits your deadline`);
    else
      reasons.push("Best overall balance of cost and terms");
    reasons.push(`${input.reliability.toFixed(0)}% supplier reliability score`);
    if (input.completedOrders > 0)
      reasons.push(`${input.completedOrders} previous completed orders without disputes`);
    if (!input.fitsDeadline)
      reasons.push(`Closest viable delivery found (${input.leadTimeDays} days)`);

    // Make the trade-off explicit when a cheaper alternative lost on other factors.
    const cheaperLost = input.rejectedAlternatives.find((r) => r.reason.includes("% more expensive"));
    if (cheaperLost && input.reliability >= 85 && input.riskLevel === "low")
      reasons.push(
        `Chosen over ${cheaperLost.name} despite higher unit cost — delivery speed and track record reduce execution risk`
      );

    const risks: string[] = [];
    if (input.riskLevel === "medium") risks.push(`${input.supplierName} carries medium operational risk — monitor first shipment closely`);
    if (input.riskLevel === "high") risks.push(`${input.supplierName} is high-risk; FARMAN suggests a partial first order`);
    if (!input.fitsDeadline) risks.push("No supplier fully meets the requested deadline — closest option selected");
    for (const alt of input.rejectedAlternatives.slice(0, 2)) risks.push(alt.reason);

    return {
      headline: `${input.supplierName} offers the best balance of price (${input.score.toFixed(0)}/100 evaluation score), delivery and reliability.`,
      reasons,
      risks,
    };
  }

  async answerFinanceQuestion(q: string, ctx: Record<string, unknown>): Promise<CfoAnswer> {
    // Real computation happens in finance/analytics.ts; the provider only
    // shapes narrative language around computed facts.
    return ctx.__answer as CfoAnswer;
  }

  async setupBusiness(idea: string): Promise<BusinessPlan> {
    // Deterministic planner: keyword templates with sensible financial math.
    const t = idea.toLowerCase();
    const intl = /internationally|international|export|global|abroad|overseas/.test(t);
    const handmade = /handmade|handcraft|craft|artisan/.test(t);
    const food = /food|snack|saffron|tea|sweet|date/.test(t);
    const software = /saas|software|app|platform|digital/.test(t);
    const services = /service|consult|agency|freelance/.test(t);

    if (services) return planServices(idea);
    if (software) return planSoftware(idea);
    return planGoods(idea, { intl, handmade, food });
  }

  interpretCommand(text: string): CommandIntentResult {
    return interpretCommandText(text);
  }
}

// ── Business plan templates ───────────────────────────────────────────────────

function planGoods(
  idea: string,
  opts: { intl: boolean; handmade: boolean; food: boolean }
): BusinessPlan {
  const M = 1_000_000; // 1 million IRR
  const niche = opts.handmade ? "Handmade Products" : opts.food ? "Specialty Food Products" : "Curated Goods";
  const name = deriveName(idea, niche);
  const channel = opts.intl ? "cross-border e-commerce" : "local retail & online";
  const unitsPerMonth = opts.handmade ? 220 : 900;
  const avgPrice = (opts.handmade ? 46 : 14) * M;
  const unitCost = (opts.handmade ? 18 : 6) * M;

  return {
    name,
    concept: `${niche} business${opts.intl ? " selling internationally from Iran, positioned on authenticity and craft heritage" : ""}: curated sourcing, quality control and direct-to-consumer sales via ${channel}.`,
    targetCustomers: opts.intl
      ? "International consumers (US/EU/GCC) interested in authentic artisan goods, 25–55, discovered via Instagram, Etsy-style marketplaces and craft-market SEO"
      : "Local consumers seeking quality specialty goods",
    revenueModel: `Direct-to-consumer sales at ${fmt(avgPrice)} average order value; ~${unitsPerMonth} units/month at steady state after month 4`,
    products: opts.handmade
      ? [
          { name: "Persian kilim & textile pieces", description: "Small-batch woven textiles from Tabriz and Kashan workshops", priceRange: `${fmt(35 * M)}–${fmt(120 * M)}` },
          { name: "Hand-painted ceramics", description: "Lalejin-minakari style tableware, export-safe packaging", priceRange: `${fmt(25 * M)}–${fmt(90 * M)}` },
          { name: "Copper & brass handicrafts", description: "Engraved homeware from Isfahan bazaar artisans", priceRange: `${fmt(30 * M)}–${fmt(150 * M)}` },
          { name: "Gift sets", description: "Curated 3-item boxes for seasonal gifting", priceRange: `${fmt(60 * M)}–${fmt(180 * M)}` },
        ]
      : [
          { name: "Core product line", description: "Initial assortment based on your description", priceRange: `${fmt(8 * M)}–${fmt(40 * M)}` },
          { name: "Seasonal collection", description: "Rotating limited items to drive repeat purchase", priceRange: `${fmt(10 * M)}–${fmt(60 * M)}` },
          { name: "Bundle offers", description: "Multi-item packs improving AOV", priceRange: `${fmt(25 * M)}–${fmt(80 * M)}` },
        ],
    operations: [
      "Supplier & artisan sourcing (3–5 partners initially)",
      "Quality control and consistent product photography",
      "Inventory storage and order fulfillment workflow",
      opts.intl ? "International shipping & customs documentation" : "Local delivery partner integration",
      "Customer support & returns handling",
    ],
    suppliersNeeded: [
      { category: opts.food ? "Food producers" : "Artisan workshops", notes: "2–4 reliable production partners with export experience" },
      { category: "Packaging", notes: "Protective export-grade packaging; branded boxes phase 2" },
      { category: "Logistics", notes: opts.intl ? "Freight forwarder + customs broker; compare air vs. sea per SKU weight" : "Last-mile courier contract" },
    ],
    costBreakdown: [
      { item: "Initial inventory (first batch)", amount: 6000 * M, note: "~350 units blended cost" },
      { item: "Export-grade packaging", amount: 900 * M, note: "Boxes, wrap, inserts" },
      { item: "Marketplace & site setup", amount: 700 * M, note: "Shopify/Etsy fees, domain, theme" },
      { item: "Product photography", amount: 600 * M, note: "First catalog shoot" },
      { item: "Initial freight & customs", amount: 1400 * M, note: "Air shipment trial batch" },
      { item: "Marketing launch budget", amount: 1200 * M, note: "Paid social + influencer seeding" },
      { item: "Working capital reserve", amount: 2000 * M, note: "Buffer for reorder cycles" },
    ],
    assumptions: [
      { label: "Units sold / month (month 4)", value: String(unitsPerMonth) },
      { label: "Average order value", value: fmt(avgPrice * 1.6) },
      { label: "Blended gross margin", value: `${Math.round(((avgPrice - unitCost) / avgPrice) * 100)}%` },
      { label: "Break-even", value: "Month 5–7" },
    ],
    projectedMonthlyRevenue: unitsPerMonth * avgPrice,
    projectedMonthlyCost: unitsPerMonth * unitCost + 2600 * M,
  };
}

function planServices(idea: string): BusinessPlan {
  const M = 1_000_000;
  return {
    name: deriveName(idea, "Services"),
    concept: `Professional services business: productized offerings delivered by a small team, sold on monthly retainers or per-project pricing.`,
    targetCustomers: "SMBs in your network and niche communities needing this expertise",
    revenueModel: `Retainers (${fmt(1.5 * M)}–${fmt(4 * M)}/mo) plus fixed-scope projects (${fmt(2 * M)}–${fmt(8 * M)})`,
    products: [
      { name: "Core service package", description: "Your primary offer, scoped and productized", priceRange: `${fmt(1.5 * M)}–${fmt(4 * M)}/mo` },
      { name: "Starter audit", description: "Low-friction entry engagement", priceRange: `${fmt(500 * M / 1000 * 1000)}–${fmt(900 * M)}` },
      { name: "Premium engagement", description: "Extended scope with dedicated capacity", priceRange: `${fmt(5 * M)}+` },
    ],
    operations: ["Client acquisition pipeline", "Delivery playbooks & templates", "Invoicing and contractor payments", "Weekly reporting cadence"],
    suppliersNeeded: [{ category: "Contractors", notes: "Vetted specialists to flex delivery capacity" }],
    costBreakdown: [
      { item: "Company registration & legal", amount: 800 * M, note: "One-time" },
      { item: "Tooling & software", amount: 250 * M, note: "Monthly stack" },
      { item: "Contractor pool retainer", amount: 3000 * M, note: "Scaled to demand" },
      { item: "Marketing & outbound", amount: 800 * M, note: "LinkedIn + content" },
    ],
    assumptions: [
      { label: "Clients by month 4", value: "4" },
      { label: "Avg retainer", value: `${fmt(2.4 * M)}/mo` },
      { label: "Gross margin", value: "65%" },
      { label: "Break-even", value: "Month 2–3" },
    ],
    projectedMonthlyRevenue: 9600 * M,
    projectedMonthlyCost: 4200 * M,
  };
}

function planSoftware(idea: string): BusinessPlan {
  const M = 1_000_000;
  return {
    name: deriveName(idea, "Platform"),
    concept: "Software product solving one painful workflow end-to-end, monetized via subscription.",
    targetCustomers: "Teams that currently solve this problem with spreadsheets and manual coordination",
    revenueModel: `SaaS subscription ${fmt(29 * M)}–${fmt(199 * M)}/mo tiers, annual prepay discount`,
    products: [
      { name: "MVP core workflow", description: "The single workflow done extremely well", priceRange: `${fmt(29 * M)}–${fmt(79 * M)}/mo` },
      { name: "Team tier", description: "Collaboration + roles", priceRange: `${fmt(99 * M)}–${fmt(199 * M)}/mo` },
    ],
    operations: ["Design & build MVP (8–12 wks)", "Beta cohort of 10 design partners", "Onboarding & support loop", "Usage analytics → roadmap"],
    suppliersNeeded: [{ category: "Infrastructure", notes: "Cloud hosting, email, payments" }],
    costBreakdown: [
      { item: "MVP build (contractor-assisted)", amount: 9000 * M, note: "12 weeks" },
      { item: "Hosting & tooling", amount: 300 * M, note: "Monthly" },
      { item: "Design partner program", amount: 1500 * M, note: "Incentives" },
      { item: "Launch marketing", amount: 1500 * M, note: "Content + communities" },
    ],
    assumptions: [
      { label: "Paying teams by month 6", value: "25" },
      { label: "ARPU", value: `${fmt(59 * M)}/mo` },
      { label: "Gross margin", value: "85%" },
      { label: "Break-even", value: "Month 9–12" },
    ],
    projectedMonthlyRevenue: 1475 * M,
    projectedMonthlyCost: 1100 * M,
  };
}

function deriveName(idea: string, fallback: string): string {
  const quoted = idea.match(/[\u201c"']([\w\s&]{3,40})[\u201d"']/);
  if (quoted) return quoted[1].trim();
  if (/handmade/i.test(idea)) return "Iranian Handmade Collective";
  if (/saffron/i.test(idea)) return "Saffron House";
  return `${fallback.split(" ")[0]} Studio`;
}

function fmt(n: number): string {
  return formatMoney(n, { compact: true });
}

// ── Command interpretation (deterministic NLU-lite) ──────────────────────────

// ── Command interpretation (deterministic NLU-lite) ──────────────────────────

export function interpretCommandText(text: string): CommandIntentResult {
  const t = text.toLowerCase().trim();

  if (/(start|launch|create|set up|setup)\b.*(business|company|shop|store|brand)/.test(t))
    return { intent: "business_setup", idea: text, confidence: 0.9 };

  if (/(can we afford|afford|do we have enough)/.test(t))
    return { intent: "affordability", confidence: 0.85 };

  if (/(biggest|largest|top).*(expense|spend|cost)|where.*overspend/.test(t))
    return { intent: "expenses", confidence: 0.85 };

  if (/(cash flow|forecast|runway|cash position|burn)/.test(t))
    return { intent: "cashflow", confidence: 0.85 };

  if (/(what needs|needs my|attention|approve|pending approval|todo today)/.test(t))
    return { intent: "attention", confidence: 0.85 };

  // procurement: extract quantity + item
  const qtyMatch = t.match(/(\d[\d,.]*)\s*(k\b|thousand)?/);
  const qty = qtyMatch ? parseInt(qtyMatch[1].replace(/[,.]/g, "") || "0", 10) : 0;
  if (/(find|source|best supplier|supplier for|need|buy|order|purchase|quote)/.test(t)) {
    const cleaned = t
      .replace(/^(please\s+)?(find|source|get|buy|order|purchase)( me)?( the)?( best)?\s*/, "")
      .replace(/best supplier(s)? for/, "")
      .replace(/supplier(s)? for/, "")
      .replace(/\bfor me\b/, "")
      .trim();
    const itemWords = cleaned.replace(qtyMatch ? qtyMatch[0] : "", "").replace(/\b(units?|pcs?|pieces?|of)\b/g, "").trim();
    return { intent: "procurement", quantity: Math.max(qty, 1), itemType: itemWords || "packaging", confidence: 0.8 };
  }

  return { intent: "unknown", confidence: 0 };
}

// ── NVIDIA NIM provider (OpenAI-compatible) ──────────────────────────────────
// Uses the integrate.api.nvidia.com chat-completions endpoint. Structured
// tasks are prompted for JSON output; any failure (network, geo-block, bad
// model id, malformed JSON) degrades per-call to the deterministic mock so
// product workflows never break.

const NIM_BASE = process.env.FARMAN_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";

class NimProvider implements AIProvider {
  readonly name = "nim";
  private apiKey = process.env.NVAPI_KEY || "";
  private model: string | null = process.env.FARMAN_NIM_MODEL || null;
  private mock = new MockAIProvider();

  /** Discover a GLM model from /models (prefers newest = highest version). */
  private async resolveModel(): Promise<string> {
    if (this.model) return this.model;
    const res = await fetch(`${NIM_BASE}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`NIM /models ${res.status}`);
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? []).map((m) => m.id);
    const glm = ids
      .filter((id) => /glm/i.test(id))
      .sort((a, b) => Number(b.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0) - Number(a.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0));
    if (glm.length === 0) throw new Error("No GLM model found in NIM catalog");
    this.model = glm[0];
    console.warn(`[farman] NIM auto-discovered model: ${this.model}`);
    return this.model;
  }

  private async chat(system: string, user: string, maxTokens = 1200): Promise<string> {
    const model = await this.resolveModel();
    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(`NIM ${model} → HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private async json<T>(system: string, user: string, maxTokens = 1200): Promise<T> {
    const text = await this.chat(
      `${system}\nRespond with ONLY valid JSON. No markdown fences, no commentary.`,
      user,
      maxTokens
    );
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("NIM: no JSON in response");
    return JSON.parse(text.slice(start, end + 1)) as T;
  }

  async parsePurchaseRequest(input: Parameters<AIProvider["parsePurchaseRequest"]>[0]) {
    try {
      const out = await this.json<ParsedRequirement>(
        "You are FARMAN's procurement parser. Classify the purchase request.",
        JSON.stringify({
          task: "Parse into structured requirement",
          ...input,
          neededBy: input.neededBy?.toISOString() ?? null,
          categoryMustBeOneOf: ["Packaging", "Raw Materials", "Components", "Logistics"],
          schema: {
            category: "string", itemType: "string", quantity: "number", unit: "string",
            urgency: "low|normal|high", constraints: "string[]", summary: "string",
          },
        })
      );
      if (!out.category || !out.summary) throw new Error("bad shape");
      return out;
    } catch (err) {
      console.warn("[farman] NIM parse failed — using deterministic fallback:", (err as Error).message);
      return this.mock.parsePurchaseRequest(input);
    }
  }

  async recommend(input: Parameters<AIProvider["recommend"]>[0]) {
    try {
      const out = await this.json<RecommendationReasoning>(
        "You are FARMAN's procurement recommendation writer. Explain decisions crisply for an enterprise buyer.",
        JSON.stringify({ task: "Write recommendation rationale", ...input, schema: { headline: "string", reasons: "string[]", risks: "string[]" } })
      );
      if (!out.headline || !Array.isArray(out.reasons)) throw new Error("bad shape");
      return out;
    } catch (err) {
      console.warn("[farman] NIM recommend failed — using deterministic fallback:", (err as Error).message);
      return this.mock.recommend(input);
    }
  }

  async answerFinanceQuestion(question: string, ctx: Record<string, unknown>) {
    // Numbers are always computed by FARMAN's finance engine; the LLM only
    // rewrites narrative. If it fails, the computed answer stands as-is.
    const computed = ctx.__answer as CfoAnswer;
    try {
      const out = await this.json<{ answer: string }>(
        "You are FARMAN's AI CFO. Rewrite the given financial answer in one crisp paragraph using ONLY provided facts and figures. Never invent numbers or currency symbols other than IRR.",
        JSON.stringify({ question, facts: computed })
      );
      return { ...computed, answer: out.answer || computed.answer };
    } catch {
      return computed;
    }
  }

  async setupBusiness(idea: string) {
    try {
      const out = await this.json<BusinessPlan>(
        "You are FARMAN's Business Agent. Turn the idea into an executable business plan. All money amounts in Iranian Rial (IRR); realistic Iranian-market scale; startup costs typically 5–25 billion IRR for goods businesses.",
        JSON.stringify({
          idea,
          schema: {
            name: "string", concept: "string", targetCustomers: "string", revenueModel: "string",
            products: "[{name, description, priceRange}] x3-4", operations: "string[] x4-6",
            suppliersNeeded: "[{category, notes}] x2-3", costBreakdown: "[{item, amount(number IRR), note}] x5-7",
            assumptions: "[{label, value}] x4", projectedMonthlyRevenue: "number IRR", projectedMonthlyCost: "number IRR",
          },
        }),
        2000
      );
      if (!out.name || !Array.isArray(out.products) || !Array.isArray(out.costBreakdown)) throw new Error("bad shape");
      return out;
    } catch (err) {
      console.warn("[farman] NIM business setup failed — using deterministic fallback:", (err as Error).message);
      return this.mock.setupBusiness(idea);
    }
  }

  interpretCommand(text: string): CommandIntentResult {
    return interpretCommandText(text);
  }
}

export function getAIProvider(): AIProvider {
  const configured = process.env.FARMAN_AI_PROVIDER || "mock";
  switch (configured) {
    case "mock":
      return new MockAIProvider();
    case "nim":
      if (!process.env.NVAPI_KEY) {
        console.warn("[farman] FARMAN_AI_PROVIDER=nim but NVAPI_KEY missing; using mock.");
        return new MockAIProvider();
      }
      return new NimProvider();
    case "openai":
    case "anthropic":
    case "deepseek":
      // Real providers are a drop-in away; the prototype falls back to mock so
      // demos never break, while surfacing the intended configuration.
      console.warn(`[farman] FARMAN_AI_PROVIDER=${configured} not implemented yet; using mock.`);
      return new MockAIProvider();
    default:
      return new MockAIProvider();
  }
}
