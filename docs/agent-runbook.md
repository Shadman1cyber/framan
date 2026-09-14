# Agent development runbook

This is the bounded execution slice plus the unified workspace, not a completed autonomous accountant. Primary database remains SQLite. Flags default off. Never use `run.sh`, `db:reset` or production data for these checks. Final consolidated implementation report: `docs/agent-workspace-result.md`.

## Unified workspace (R01/R02/R03)

`AGENT_WORKSPACE=true` enables `/admin/workspace`: conversations sidebar (right), chat (center), collapsible output/preview panel (left), one composer, attachment upload, approval cards, skills/lessons management and technical details in expandable areas. Sessions live in `AIChatSession` with explicit `ownerId`; ownerless pre-ownership sessions are a **read-only legacy archive** (`GET /api/admin/ai/chats/legacy`, OWNER holders only) and can never be claimed or mutated. Chat context now loads the LAST 50 messages in chronological order (bounded recent window), not the outdated "first 50" slice. SSE events (`GET /api/admin/agent/events?cursor=`) are durable, user-scoped and resumable via the last event id.

## Durable queue worker (R04)

`npm run worker` (or `node worker/dist.cjs`) starts the independently supervised worker: it atomically claims queued runs with a lease (`claimNext`), heartbeats during execution, `reclaimExpired()` recovers runs left by a dead worker (their transaction rolled back, so no effect duplicates), and delivers telemetry periodically. Runs can also be executed on demand from the app (`execute` action) when no worker is running. Model calls stay outside transactions; business mutations commit with their durable receipts in one short transaction.

## Business tools and approvals (R05)

Read tools: `get_order`, `list_orders`, `get_product`, `list_products`, `list_categories`, `list_inventory`, `list_staff`, `list_reservations`, `list_tables`, `list_qr_codes`, `list_users`, `list_ratings`, `list_allergens`, `search_catalog`, `calculate_sales_report` — full read coverage of every admin section, all source-backed, bounded, no free-form SQL, no secrets (`list_users` never exposes passwordHash/phone). Write tools: `change_order_status`, `update_price`, `adjust_inventory` — each pauses the run at `waiting_approval` with a card binding the exact target, observed source version, before/after values, reason and a 10-minute expiry; permissions and data versions are revalidated immediately before execution. The shared services in `src/lib/business/` (`transitionOrderAtomic`, `updatePrice`, `adjustInventory`) are used by BOTH the admin UI routes and the agent, so validation cannot diverge; the section read tools share one `sectionRead` implementation between the run path and the skill sandbox for the same reason. Terminal orders never reopen; historical order-item prices are never modified; inventory adjustments record before/after/delta/unit/reason and reject negative results.

## Files and artifacts (R06)

`POST /api/admin/agent/files` accepts CSV/XLSX/text-PDF ≤ 10 MB into PRIVATE storage (`uploads/private-artifacts/`, never the public image path). Scanned PDFs (no fonts + image XObject) are rejected with `OCR_UNAVAILABLE` — OCR is honestly unavailable in this version. Generated reports: `POST /api/admin/agent/artifacts` builds sales CSV, XLSX (SpreadsheetML, RTL sheet) and SVG charts from the deterministic reporting service; every artifact records its generation inputs and sources. Downloads are authenticated and ownership-checked (`GET /api/admin/agent/artifacts/[id]`). Generated PDF output is NOT available (Persian RTL PDF requires font embedding); CSV/XLSX/SVG are the delivered formats.

## Reporting accuracy (R07)

`src/lib/reporting.ts` interprets Tehran business days via `Intl` and converts them to explicit half-open UTC intervals; totals are integer tomans from `status=COMPLETED` orders only, labelled as order value — never collected payments or profit. Chat answers and generated files render from the same summary object, so displayed values, exports and sources agree. Missing data is reported as absent.

## Lessons and skills in the loop (R08)

Active valid lessons are retrieved into the planner context (labelled advisory). Skills with structured criteria (`step_succeeded`, `result_field_equals`, `result_count_at_least`) are deterministically evaluated; legacy free-text criteria keep the version visibly unverified (`evaluated:false`, activation blocked). `POST /api/admin/agent/skills/run {slug}` executes an ACTIVE version through the governed run path (approvals still apply). The model can select activated skills but can never create, activate, widen permissions or set flags.

## Knowledge graph (Phase 3) and retrieval correctness (R09)

Unchanged from the audited interim design, with two correctness fixes: freshness is judged by the last successful sync (`GraphSync.syncedAt`), so an unchanged or empty catalog no longer makes a freshly synchronized graph immediately stale; and neighbor nodes now receive the same scope/validity/status filters as primary results. The SQLite graph/lexical retrieval is deliberately NOT semantic/vector GraphRAG — every result carries source provenance for live verification.

## OpenObserve (R10) — VERIFIED against a real instance (2026-09-10)

Compose service `openobserve` (pinned `v0.92.2`, `ZO_QUERY_ON_WAL=true` required — without it fresh WAL spans are not queryable) persists to the `openobserve-data` volume and binds the UI to `127.0.0.1:5080`. The app and worker post OTLP/HTTP to `http://openobserve:5080/api/default/v1/traces` (credentials via `OPENOBSERVE_AUTHORIZATION`; login values via `ZO_ROOT_USER_EMAIL`/`ZO_ROOT_USER_PASSWORD`). The insecure-transport exception applies ONLY to localhost and the explicitly configured `OPENOBSERVE_INTERNAL_HOST` (the Compose hostname `openobserve`) — never arbitrary hosts. Spans carry measured durations (`agent.duration_ms`) and provider-reported token usage when available; unavailable usage is absent, never zero-fabricated. The owner-only status/link lives at `/admin/monitoring`. Local development without Compose: set `OPENOBSERVE_TRACES_URL=http://localhost:5080/api/default/v1/traces`.

Live verification evidence: 71 real AgentEvents from the dev DB were exported by `flushAllTelemetry` to a real OpenObserve container; spans are queryable via `POST /api/{org}/_search_stream?type=traces` (the `?type=traces` param is mandatory — a plain `_search` returns `Search stream not found` in v0.92.2) and return `service_name=farman-agent`, `operation_name` (`run.created`/`tool.started`/`tool.verified`/`run.completed`), `agent_run_id`, `agent_state`, `agent_tool`, `agent_duration_ms`; the UI Traces page renders Rate/Duration charts. Re-delivery after container recreation exercised the at-least-once outbox in practice (`scripts/oo-flush.mts` flush; `scripts/oo-requeue.mts` re-arms `exportedAt`). Note: the v0.92.2 UI lists the stream schema but its spans-table row rendering remains skeleton-labeled (charts and API are correct); stream-local UI quirk, not an ingestion failure.

## Development setup

1. Use a separate development database with fictional data. Back it up before schema changes. `env.example` lists all configuration names; fill secrets locally, never in version control.
2. Generate client with `npx prisma generate` (does not migrate data). For a **disposable** new development DB, set `DATABASE_URL=file:/absolute/path/to/disposable.db` explicitly before `npx prisma db push`. For an existing development schema, review/apply `prisma/agent-migrations/001_execution.up.sql` then `002_failure_recovery.up.sql` using SQLite tooling. There is no Prisma migration baseline; do not use `prisma migrate deploy` for these files.
3. Set `AGENT_CAFE_ID` to the sole Cafe ID in this database. Set `AGENT_ENABLED=true`; keep `AGENT_WRITES_ENABLED=false` initially. The runtime reloads User.role on every action. Only the existing OWNER/legacy ADMIN role has ai.use. No inferred tenant memberships: multiple cafes or a mismatched ID fail closed.
4. Set `NEXTAUTH_URL` to the actual development origin (default http://localhost:3080). Start `npm run dev`. Log in using a development owner. Open `/admin/ai`; execution controls appear only when AGENT_ENABLED is true. Structured status/on/off requests work without a model key. Natural-language proposals require the existing AI setting and provider credential.
5. Read status → execute → inspect receipt/source/trace. To test a reversible write, enable `AGENT_WRITES_ENABLED=true`, request a setting change, review old/new values and expiry, approve, then execute. To compensate, request the previous boolean as a **new** run and approve it. No hidden history deletion.

The existing legacy analytical chat remains separate and is not promoted to arbitrary execution. Its broader chat ownership/context limitations are documented in the audit; this slice does not certify that legacy path.

## Recovery and controls

- Retry an uncertain create with the identical key AND payload. A changed request with that key returns IDEMPOTENCY_CONFLICT. Keys are scoped to authenticated user and server cafe.
- After an uncertain execute response, GET the same run or execute that run ID again. A completed run returns its stored receipt. Never blindly create a replacement write. The local setting effect, verification event and receipt are in one SQLite transaction.
- Approvals bind exact tool/input, server scope, requester and observed Setting version; they expire after ten minutes. Source changes require a new proposal/approval. Revocation of the owner's role blocks later execution even if their JWT is stale.
- Pause only at queued boundary; resume returns to queued. Cancel prevents starting queued/waiting work. Initial local transactions finish atomically; controls cannot interrupt a transaction already holding the database write lock. Cancellation after completion cannot undo it. No claim of cancellation of an external in-flight write.
- Kill switch: set AGENT_WRITES_ENABLED=false in all app processes and restart/reload configuration; this prevents future writes. AGENT_ENABLED=false also blocks starting reads/proposals. Existing receipts remain accessible to authorized users. This is an environment kill switch, not yet a distributed UI kill switch.
- Policy/transaction errors return a stable error code; a rolled-back run remains queued/waiting so it can be cancelled or retried appropriately. Phase 2 records attempts durably: `attemptCount` and a bounded `lastError` code on AgentRun, with `run.attempt_failed` events for policy/infrastructure rejections. Deterministic verification failures (`VERIFICATION_FAILED`, `UNSAFE_MONEY_VALUE`) mark the run terminal `failed` (`run.failed` event); recovery is a new approved run. Transient infrastructure errors (SQLite busy/locked, Prisma P2024) are retried inside execute with bounded backoff (3 attempts) before recording `EXECUTION_ERROR`. A generic recovery worker and external-call reconciliation remain future work; local transactional tools reconcile via the durable receipt (GET/execute replay).
- Rollback schema only after disabling execution/draining requests and archiving AgentRun/AgentEvent. `002_failure_recovery.down.sql` removes `attemptCount` (SQLite >= 3.35) and `001_execution.down.sql` removes agent history, preserves operational tables and does not reverse a Setting change. `007_workspace.down.sql` removes only the workspace tables/columns; artifact bytes are business data and are NOT deleted by the down migration.
- Migration 007 (`007_workspace.up.sql`) adds: AIChatSession `ownerId`/`archived`, AgentRun `sessionId`/lease/provenance columns, AgentStep, AgentArtifact, and AgentEvent duration/usage columns. Fully additive; verified up→down→up on a disposable copy with a pre-existing sentinel row preserved.

## Control panel and gradual release (Phase 7)

`GET /api/admin/agent/status` returns the authoritative server state (enabled, writes, shadow, canary, approval queue, running count); AgentControls renders it as a banner — this is the kill-switch indicator (server env remains the actual switch). UI additions: approval queue summary, catalog/lessons shortcuts, `correct` note field on terminal runs, per-run attempt/error display, and the subagent children tree. Gradual release flags: `AGENT_SHADOW_MODE=true` runs the full loop but blocks writes with the observable `SHADOW_MODE` code (reads unaffected); `AGENT_CANARY_USERS=` (comma-separated user IDs, empty = all authorized) restricts the agent surface server-side via `CANARY_NOT_ENROLLED`. Both are environment flags — no client or model path can set them. Suggested rollout: enable agent (reads) → enroll canary users → shadow writes → enable writes for canary → full enable; disable with `AGENT_ENABLED=false` at any time; existing receipts stay readable.

## Subagents (Phase 6)

A supervisor run (any run, `parentRunId` null) spawns bounded children: `POST /api/admin/agent/runs/{id}` `{action:"spawn", subtask:{task, role, proposal}}`. Roles: `data_research` (status/catalog/lessons reads) and `finance` (sales reports). Server enforces: read-only proposals, depth 1, max 3 concurrent children, total ≤ parent's `toolCallBudget` (default 12, deducted per spawn). Children execute only via the normal governed path and appear in `GET /runs/{id}` as `children[]`. Cancelling the parent cancels non-terminal children atomically. Migration: `prisma/agent-migrations/006_subagents.up.sql` (down archives child audit history first).

## Skills (Phase 5)

Skills are versioned declarative workflows over the allowlisted tools (`src/lib/agent/contracts.ts` `skillDefinitionSchema`). Draft → sandbox test (reads real, writes mocked) → explicit activate (needs passing evaluation) → deactivate/rollback, all under `ai.use`/`ai.configure` respectively. Draft creation validates every step's input against the tool schema up front. Activation supersedes other active versions of the same slug; rollback re-activates the latest retired passing version. Skills never widen permissions: executing one still creates governed runs with normal approvals. Migration: `prisma/agent-migrations/005_skills.up.sql` (down removes only AgentSkill).

## Memory and lessons (Phase 4)

Every run outcome writes an `AgentEpisode` (tool, state, error code, optional correction). Users propose `AgentLesson` drafts citing real runs as evidence (must be caller-owned and terminal or carry a durably recorded error); an `ai.configure` holder explicitly activates, rejects or expires them. Activating over a same-topic active lesson supersedes it (kept for audit, never deleted). The `list_lessons` read tool and `GET /api/admin/agent/lessons` surface only active valid lessons with live evidence refs. Corrections: POST `/runs/{id}` `{action:"correct", note}` (2–500 chars). Lessons are advisory; they cannot change tools, permissions or policy. Migration: `prisma/agent-migrations/004_memory.up.sql` (down removes only the two memory tables).

## Knowledge graph (Phase 3)

The catalog graph (Category/Product/Ingredient/Allergen/DietaryTag + BELONGS_TO/CONTAINS/USES/TAGGED) is derived data in the same SQLite database, built by `src/lib/agent/graph/sync.ts`. It is never a business source of truth: volatile numbers are always read live (`calculate_sales_report`), and the graph only accelerates catalog lookup with provenance (`sourceId`, `sourceVersion`, `observedAt`, validity, status). Sync runs on demand inside `search_catalog` (incremental via per-entity watermarks plus full edge/deletion reconciliation) and is bounded to the 5s tool timeout at development scale. `GRAPH_MAX_STALE_SECONDS` (default 300) flags stale results; consumers must treat `stale: true` as "verify against the live source". No embeddings, no Neo4j/pgvector, no background sync worker yet — a missed deletion is caught by the next sync's reconciliation pass. Migration: apply `prisma/agent-migrations/003_graph.up.sql`; `003_graph.down.sql` removes only derived graph tables. Never migrate the primary database without explicit authorization.

## Validation

`npm run typecheck -- --incremental false`, `npm test -- --reporter=dot`, `CI=1 npm run lint`.

`src/lib/agent/runtime.test.ts` creates its own temporary SQLite file and overrides Prisma datasource; it never uses the configured app database. It verifies real effects/receipts, inverse write, permission revocation, scope rejection, approval expiry/hash/version, lost-reply replay, cancellation, finance date boundaries, transaction rollback via a failing receipt trigger, HTTP handlers (session lookup mocked only), and a real local HTTP telemetry sink. Live NextAuth browser login, model provider, abrupt OS process kill, concurrent workers and live OpenObserve must be tested separately before release.
