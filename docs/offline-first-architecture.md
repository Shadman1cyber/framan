# Offline-First Accounting — Architecture & Migration Strategy

## Discovered architecture (audit)

- **Stack:** Next.js 14 App Router (React 18 + TypeScript), Prisma 5 + SQLite, next-auth v4 (JWT credentials), Capacitor 8 (Android/iOS), next-pwa, Vitest, esbuild worker.
- **Server state:** single cafe (no membership rows); scope is env `AGENT_CAFE_ID` (`src/lib/agent/runtime.ts` `identity()`, fail-closed when `cafes.length !== 1`).
- **Money:** mutable `Order.total` (Int tomans), `OrderItem.price`, `Product.price`, `ProductCoffeeLine.price`, `Ingredient.stockQuantity`/`costPerUnit` (Float). Financial figures are derived at read time (`src/lib/analytics.ts`, `src/lib/reporting.ts`).
- **Only append-only precedent:** historical `OrderItem.price` is never mutated (`src/lib/business/pricing.ts`). The only idempotent write path is the agent runtime (`AgentRun` unique `scopeId+userId+key`, approval hash, durable receipts in `AgentStep.result`).
- **Offline today:** IndexedDB action queue (`src/lib/offline/queue.ts`) + serial replay (`src/lib/offline/sync.ts`), actions: `PLACE_ORDER | UPDATE_PROFILE | SUBMIT_RATING`. Retry cap 5 → stranded (silent dead-letter gap). Record IDs are not stable business UUIDs.
- **Hazard:** `next.config.js` SWR caches `POST /api/orders` NetworkFirst — a mutation route with cache fallback (duplicate-creation hazard).
- **Migrations:** no Prisma migrate baseline; `prisma db push` + hand-written additive `prisma/agent-migrations/00*_*.up.sql` (up/down pairs, apply via sqlite3 tooling only).
- **Auth:** `guard(perm)` (`src/lib/api.ts`) → 401/403; roles CUSTOMER/CASHIER/OWNER; `finance.view` gates finance APIs. JWT credentials; middleware edge checks.
- **Testing:** Vitest; unit tests mock Prisma; agent runtime tests use real disposable temp SQLite (empty file + `prisma db push`), SIGKILL recovery tests exist for the worker.

## Principle: append-only financial ledger

Financial transactions are never `UPDATE`d or `DELETE`d. Corrections post reversal + replacement entries; balances are derived from the ledger. The server is authoritative for ordering (`server_sequence`); client timestamps are audit/display only.

Mutable non-financial state (products, profiles, settings) stays mutable. Stock movements prefer an append-only movement ledger (future phase).

## Migration strategy (incremental, no breakage)

- **Phase 1 — schema + repositories:** additive migration `008_offline_ledger` (up/down SQL), Prisma models `LedgerEntry` (immutable) + `SyncOperation` (outbox/idempotency), repository layer `src/data/`.
- **Phase 2 — server write path:** idempotent ledger ingestion endpoint with structured errors, server sequence assignment, scoped authorization (`guard("finance.view")` minimum; scope = env cafe when exactly one cafe, else 403).
- **Phase 3 — client engine:** IndexedDB outbox with stable UUID idempotency keys, exponential backoff with jitter, structured error contract, crash-safe replay (resend same key).
- **Phase 4 — UI:** sync status indicator (offlined/syncing/synced/error), failed-operation surfacing with retry; Persian strings consistent with existing offline banner.
- **Phase 5 — tests:** vitest integration tests on disposable SQLite (duplicates, retry, crash recovery, multi-device, invariants sum(debits)==sum(credits), reversal idempotency).

### Current slice implemented and tested

1. `docs/offline-first-architecture.md` (this document), `docs/sync-protocol.md`, `docs/accounting-ledger.md`.
2. `prisma/agent-migrations/008_offline_ledger.{up,down}.sql` — additive `LedgerEntry`, `SyncOperation`, `SyncDevice` tables, scoped uniqueness, immutability triggers (up/down cycle verified on disposable SQLite).
3. Prisma models: `LedgerEntry` (now with `accountId`, scoped idempotency/sequence uniqueness), `SyncOperation` (now with `requestHash`, `createdBy`), `SyncDevice`.
4. Server: `src/lib/ledger/service.ts` (hash-checked idempotency, true reversal+replacement corrections, `TOMAN` amounts within Prisma-Int bounds); `POST /api/sync/push` (batch, per-operation results, key-reuse rejection, `P2002` retry signal); `GET /api/sync/pull`; `GET /api/sync/status`.
5. Tests (all passing, disposable SQLite): `src/lib/ledger/service.test.ts` (11: create, duplicate-key, correction +100→+120, negative reversal, double-reversal, validation, SQL immutability, concurrent same-key, multi-device merge, cursor, hash, rollback); `src/lib/ledger/push-route.test.ts` (3: batch+replay+key-reuse, pull/status cursors, `finance.view` auth).

### Security / auth (as implemented)

- Server authorization: existing `guard("finance.view")` (OWNER) + scope = single-cafe env (`AGENT_CAFE_ID`), fail-closed 403 when ambiguous. `SyncOperation.createdBy` records the authenticated user; `device_id` is diagnostic only. No multi-tenant membership model exists; do not invent one silently.
- Reused idempotency key with a changed request is rejected (`IDEMPOTENCY_KEY_REUSE`, 409, non-retryable). Unknown failures and write conflicts are retryable with the same key.

## Client slice (implemented and tested)

- `src/lib/offline/ledger-outbox.ts` — framework-free outbox: `LedgerOutboxStore` interface with IndexedDB (`farmans-ledger-outbox`: operations/entries/meta) and in-memory adapters; stable UUID v4 keys generated once at enqueue; persistent device id (`localStorage`, memory fallback); exponential backoff with jitter (1s→60s cap); push→pull engine with single-flight caller, crash recovery (`processing`→`pending` on startup), cursor advanced atomically with pulled entries.
- `src/lib/offline/ledger-sync.ts` — client singleton: Capacitor Network / `navigator.onLine` detection, online/focus/visibility listeners, `useLedgerSync()` hook, `enqueueLedgerEntry()`, per-key and retry-all recovery.
- `src/components/offline/LedgerSyncBadge.tsx` — global non-intrusive pill (offline / syncing / error+retry / auth-required with login link), rendered in `src/app/layout.tsx` alongside the legacy banner.
- Tests: `src/lib/offline/ledger-outbox.test.ts` (12: offline retention, backoff+same-key retry, permanent-failure retention, 401 handling, lost-response replay, crash recovery, two-device merge, malformed-pull cursor safety, missing-op safety).

## Explicitly NOT done yet (gaps vs. full spec)

- Dashboard/financial pages still read the server directly; migrating them to the local entries mirror is the next slice.
- Legacy `src/lib/offline/queue.ts` (orders/profile/ratings) still has no idempotency keys and a silent retry cap — untouched by this change.
- SQLite-on-device (IndexedDB is the store on web + Capacitor WebView); network-simulation harness beyond injected engine fakes; full property tests; AI-boundary holds by construction (no AI path writes to the ledger).
