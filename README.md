# FARMAN — فرمان

**AI-native business execution platform.**
Command → Authority → Execution.

> We don't replace your business software. We make it act.

FARMAN sits above your ERP, spreadsheets and messaging tools. You give it intent
("we need 500 units of industrial packaging by next week"); specialized AI agents
understand the requirement, source suppliers from your network, compare offers,
evaluate risk, recommend a decision — and **execute** it across finance and
operations, pausing for your approval whenever policy requires a human.

---

## Quick start

```bash
npm install
npm run db:push        # create SQLite database (prisma/dev.db)
npm run db:seed        # realistic demo dataset (Zarin Industrial Group)
npm run dev            # → http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

### Demo credentials

| Email             | Password    | Role   |
| ----------------- | ----------- | ------ |
| `sara@farman.dev` | `farman123` | owner  |
| `reza@farman.dev` | `farman123` | operations |
| `nazanin@farman.dev` | `farman123` | finance |

### Currency

All amounts run in **Iranian Rial (IRR)** — ریال. Large values display compactly
(`IRR 2.1B` = 2.1 billion rials ≈ 21 میلیارد تومان… note 1 Toman = 10 Rial).
Seeded figures use a demo rate of **1 USD ≈ 1,000,000 IRR** so numbers stay
mentally convertible. The currency is a per-company setting (`Company.currency`)
and all formatting flows through one helper (`formatMoney` in `src/lib/format.ts`),
so multi-currency support only requires extending that module.

### Environment variables (`.env`)

| Variable              | Purpose                                        | Default |
| --------------------- | ---------------------------------------------- | ------- |
| `DATABASE_URL`        | Prisma/SQLite connection (`file:./dev.db`)     | —       |
| `SESSION_SECRET`      | HMAC secret for session cookies                | dev fallback |
| `FARMAN_AI_PROVIDER`  | `mock` \| `openai` \| `anthropic` \| `deepseek`| `mock`  |

No external API keys are required — the prototype runs fully offline with a
deterministic mock reasoning layer.

---

## The two demo flows

**1 — Procurement execution (the primary demo)**

1. Sign in → **Procurement → Requests → New Request**
2. Submit: *"Industrial packaging for export batch"*, item
   *"heavy-duty corrugated boxes"*, quantity **500**, delivery in ~1 week.
   (Budget is optional and expressed in IRR.)
3. Watch the workflow timeline execute:
   Request Created → Requirement Parsed → Suppliers Found → Offers Compared →
   Risk Evaluated → Recommendation Generated → **Waiting for Approval**.
4. Open the recommendation: supplier, unit price, total, delivery date, and
   FARMAN's reasoning ("why", risks, rejected alternatives).
5. Click **Approve & Execute** → purchase order is issued, the supplier channel
   confirms (simulated), the AI CFO records the payable, cash flow updates,
   and every step lands in **AI → Activity**.
6. Inspect results in **Purchase Orders**, **Finance → Overview/Cash Flow**.

You can also type commands into the ⌘K bar:
`find the best supplier for 500 packaging units`, `can we afford this purchase?`,
`show me our biggest expenses`, `what needs my attention today?`,
`start a business selling handmade products internationally`.

**2 — Start a business**

1. Go to **Business → Business Setup**
2. Enter: *"I want to start an online business selling Iranian handmade
   products internationally."*
3. The Business Agent generates a workspace: concept, target customers,
   offerings with price ranges, initial operations, suppliers needed,
   startup cost breakdown, financial assumptions — plus a phased, checkable
   task list (Research → Setup → Launch → Operate).
4. Continue in **Business → Tasks**; progress persists.

A pre-seeded request (*Export cartons for Anatolia order*) is already waiting
in **AI → Approvals** so the approval UI can be demonstrated instantly.

---

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm start          # serve production build
npm run typecheck  # tsc --noEmit
npm run db:push    # sync schema to SQLite
npm run db:seed    # reseed demo data (idempotent — wipes first)
npm run db:reset   # push --force-reset + seed
```

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
Prisma + SQLite · lucide-react. No other runtime dependencies.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system architecture, domain model, agent & workflow design, AI abstraction
- [PRODUCT.md](./PRODUCT.md) — vision, MVP scope (P0/P1/P2), roadmap, user journeys

---

FARMAN is Iranian in origin — *فرمان* means *command*, carrying the sense of
authority and its execution. The product is designed international-first.
