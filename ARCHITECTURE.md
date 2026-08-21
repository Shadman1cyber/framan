# FARMAN — Architecture

## System overview

```text
┌────────────────────────────────────────────────────────────┐
│ Frontend — Next.js App Router (React Server Components)    │
│   dashboard · procurement · finance · business · AI pages  │
│   Command Bar (⌘K) · workflow timeline · approval panels   │
└───────────────▲────────────────────────────────────────────┘
                │ server actions (typed RPC, session-guarded)
┌───────────────┴────────────────────────────────────────────┐
│ API / Server layer  src/server/actions/*                   │
│   auth · procurement · command · cfo · business            │
│   validation, authorization, revalidation                  │
└───────────────▲────────────────────────────────────────────┘
                │
┌───────────────┴────────────────────────────────────────────┐
│ Domain services & Agent Orchestrator  src/lib/agents/*     │
│                                                            │
│   orchestrator/engine.ts ─── deterministic workflow engine │
│        │            stages, approval gate, execution       │
│        ├── procurement/  parser · supplier-search ·        │
│        │                 evaluation · (purchase-order)     │
│        ├── finance/      cashflow · expense-analysis ·     │
│        │                 affordability · supplier costs    │
│        ├── business/     setup planner → tasks             │
│        ├── ai/provider.ts  ← ALL "intelligence" funnels    │
│        │    through the AIProvider interface               │
│        └── activity.ts   audit logging + agent status      │
└───────────────▲────────────────────────────────────────────┘
                │ Prisma
┌───────────────┴────────────────────────────────────────────┐
│ Business Knowledge Graph (SQLite via Prisma)               │
│   Company · User · Supplier · Product · SupplierProduct ·  │
│   PriceHistory · PurchaseRequest · WorkflowStage ·         │
│   SupplierOffer · Approval · PurchaseOrder(+Item) ·        │
│   Transaction · Expense · Customer · Agent · AgentTask ·   │
│   ActivityLog · Business · BusinessTask                    │
└────────────────────────────────────────────────────────────┘
```

The relational schema is deliberately shaped as a **business knowledge graph**:
everything hangs off `Company`, and relationships (supplier → catalog → price
history; request → offers → approval → order → transaction) are first-class.
Swapping in a graph database later means reimplementing `src/lib/db.ts` access
patterns, not restructuring the domain.

## Request lifecycle (procurement)

`runProcurementPipeline(requestId)` in `src/lib/agents/orchestrator/engine.ts`
executes deterministically and persists **every stage**:

1. **parsed** — `AIProvider.parsePurchaseRequest` extracts category, urgency,
   constraints; writes reasoning summary onto the request.
2. **suppliers_found** — `procurement/supplier-search` queries catalog items;
   guarantees like-for-like quotes (best textual match per product, or the
   category's primary item carried by most suppliers).
3. **offers_compared** — every offer persisted (`SupplierOffer`) with unit
   economics, lead time, deadline fit.
4. **risk_evaluated** — risk-adjusted notes; flagged suppliers logged.
5. **recommendation_ready** — weighted scoring:
   **price 40 + delivery fit ≤25 + reliability ≤20 − risk penalty ≤15**,
   fully explainable (per-offer breakdown stored).
6. **approval gate** — policy engine decides autonomy vs human:
   - total ≥ `IRR 500M` (auto-approve limit; ~$500 at the demo rate)
   - new supplier (zero completed orders)
   - reliability < 80%
   - unusual price deviation > 25% vs market
   If any trigger fires: `Approval` row created, request parked at
   `awaiting_approval`, agents flip to *waiting*.
7. On **Approve** → `executeApprovedOrder`: PO issued (+9% VAT), simulated
   supplier confirmation, pending payable `Transaction` created by the AI CFO,
   stages completed, audit trail written. On **Reject** / **Request changes**
   the workflow closes or re-runs sourcing excluding the rejected pick.

All mutations run inside server actions guarded by `requireSession()`
(signed HMAC httpOnly cookie); company-scoping is enforced on every query.

## AI abstraction

```ts
interface AIProvider {
  parsePurchaseRequest(...): Promise<ParsedRequirement>;
  recommend(...): Promise<RecommendationReasoning>;
  answerFinanceQuestion(q, ctx): Promise<CfoAnswer>;
  setupBusiness(idea): Promise<BusinessPlan>;
}
```

`MockAIProvider` implements rule-based, deterministic reasoning over live DB
facts (no external calls, reproducible demos). Real providers implement the
same interface in `src/lib/agents/ai/provider.ts`; selection via
`FARMAN_AI_PROVIDER`. Finance answers are computed from data in
`finance/analytics.ts`; the provider only shapes narrative — so an LLM swap
changes *wording*, never *numbers*. Command interpretation
(`interpretCommandText`) is honest NLU-lite: implemented intents execute;
unknown commands say so.

## Integration strategy (future)

FARMAN acts through systems rather than replacing them. The adapter seam is
where external actions happen today with simulators:

- supplier channel (PO send / confirm) → email/WhatsApp/API adapters
- ledger writes → ERP/accounting connectors
- notifications → email/push

Each simulator is isolated in the orchestrator/agent code and can be replaced
by an adapter implementing the same effect (persist state + write audit log).

## Auth

Lightweight demo auth: email+password against seeded users, httpOnly cookie
`farman_session = userId.HMAC-SHA256(userId, SESSION_SECRET)`. Passwords are
plain in the seed for demo ergonomics only — production would hash (argon2/bcrypt).
Middleware-level protection is provided by `requireSession()` in the app layout;
all mutating actions independently verify session + company ownership.

## Currency

Amounts are stored in the company currency — the demo company uses **Iranian
Rial (IRR)**. Formatting is centralized in `src/lib/format.ts#formatMoney`
(auto-compacts values ≥ 100M, e.g. `IRR 2.1B`). Policy thresholds
(`POLICY.autoApproveLimit = 500_000_000`) are expressed in the same currency.

## Internationalization

`src/lib/i18n/index.ts` exports `getDict(locale)` with `en` complete and `fa`
covering shell/navigation strings; `<html dir>` switching is supported for RTL.
UI strings in the prototype are English-first but the mechanism exists to route
all copy through the dictionary.
