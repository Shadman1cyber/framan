# FARMAN — Product

## Vision

Businesses drown in coordination: procurement back-and-forth, supplier
evaluation, financial sanity checks, approval chases, data entry across ERP /
Excel / email / WhatsApp. FARMAN is an **AI Business Operating System** that
understands business context, makes operational decisions, coordinates
specialized agents, and executes those decisions through existing systems —
with human authority as the control plane.

**Not:** ChatGPT with a dashboard.
**Yes:** Intent → Understanding → Decision → Approval → Execution → Result.

Positioning: *we don't replace the business software — we make it act.*

## MVP scope

### P0 — shipped in this prototype
1. Command Center dashboard (health, live agent activity, attention queue)
2. Purchase requests (create → auto-processing)
3. Supplier database (12 suppliers, 26 products, 52 catalog lines, price history)
4. Supplier comparison (weighted, explainable scoring)
5. AI recommendation with reasoning ("why", risks, rejected alternatives)
6. Human-in-the-loop approvals (high-value / new supplier / risk / unusual price)
7. Purchase order generation (+ simulated supplier confirmation)
8. Finance impact (pending payable, cash flow update)
9. Activity / audit log for every agent action
10. End-to-end demo flow — reproducible in under 3 minutes

### P1 — shipped
11. AI CFO (cash position, forecast, affordability verdicts, overspend detection,
    supplier cost ranking, Q&A console grounded in the ledger)
12. Command interface (⌘K natural-language commands mapped to real workflows)
13. Business setup ("describe an idea → executable workspace")
14. Business tasks (phased execution plan with persistent progress)
15. Agent dashboard (orchestrator + 3 specialized agents, task queue)

### P2 — future
16. Advanced analytics (spend trends, supplier benchmarking over time)
17. Knowledge-graph visualization
18. Real integrations (email/WhatsApp PO delivery, ERP/accounting sync)
19. Real LLM providers behind the `AIProvider` seam (negotiation language,
    unstructured-document understanding)
20. Marketplace evolution (buyer ↔ FARMAN ↔ supplier network: discovery,
    matching, negotiation, contract, payment, delivery, invoice)

## Core user journeys

**Ops lead (procurement)** — submits a need in one sentence; inspects what
FARMAN did stage by stage; approves once; the order exists, finance is updated,
the audit trail is complete. Time from intent to executed PO: ~2 minutes.

**Founder / SME owner (AI CFO)** — asks "can we afford this?" and gets a
verdict computed from their actual ledger, with buffer math and forecast —
not vibes.

**Aspiring entrepreneur (business mode)** — describes an idea; receives a
structured workspace (customers, offerings, operations, suppliers needed, cost
breakdown, assumptions) plus a phased checklist they can actually start
executing today.

## Principles

- **Controlled autonomy**: FARMAN acts alone only within policy limits; the
  policy is visible in Settings.
- **No fake buttons**: every action mutates state; unknown capabilities say so.
- **Explainability over magic**: every recommendation carries its score
  breakdown, reasons, risks and rejected alternatives.
- **Trust through transparency**: the activity log records everything.

## Roadmap after the prototype

1. LLM-backed reasoning layer (same interfaces) + negotiation simulation
2. Multi-company workspaces & roles-based approval chains
3. Live integration adapters (Gmail/Outlook, WhatsApp Business, QuickBooks/Xero)
4. Supplier-side portal → two-sided marketplace foundation
5. Persian locale completion + RTL rollout
