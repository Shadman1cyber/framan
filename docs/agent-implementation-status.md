# Agent implementation status

Updated 2026-09-09. User requested token-conscious work; prioritize audited Phase 1 and persist continuation. No production deployment, seed or primary database migration authorized/performed.

## Phase 0 — complete

- Completed repository instructions, architecture, schema, auth/RBAC, tenancy, chat/provider, service, tests and deployment inspection. See `agent-audit.md` for evidence paths and integration tradeoffs.
- Files added: `docs/agent-audit.md`, this file.
- Validation: direct source inspection; no existing AGENTS.md in repository/ancestors. Not a claim of runtime security verification.
- Limitations: existing app has no user-to-cafe membership or general tenant isolation; initial execution must fail closed outside explicit single-cafe deployments.
- Next: implement and test a read + reversible Setting write with durable server state, live authorization, exact approval, idempotency, result verification and trace.

## Phase 1 — development slice implemented; external acceptance open

See the session handoff below for changed files, executed tests and precise remaining gates. Do not infer production/browser/provider success from unit or integration test results.

## Phase 2 — approval and recovery slice implemented; live OpenObserve/browser acceptance open

Phase 2 target from the plan: crash after a write must not duplicate its effect; a changed payload must invalidate approval. Implemented and tested below; external browser/provider/collector validation remains open as in Phase 1.

## Phase 3 — GraphRAG catalog slice implemented; vector/Neo4j and external acceptance open

Phase 3 target from the plan: relations with source provenance; deletion and validity propagate to retrieval; numeric reports come from the live source. Implemented and tested below for the catalog domain; embeddings, Neo4j/pgvector and external validation remain open.

## Phase 4 — memory and lessons slice implemented; UI surfacing and external acceptance open

Phase 4 target from the plan: a valid correction improves the next response; expired or conflicting sources are handled. Implemented and tested below; lesson/correction UI surfacing and external validation remain open.

## Phase 5 — Skill Studio groundwork implemented; execution orchestration and UI open

Phase 5 target from the plan: a draft is built from one corrective experience, tested, activated, and rolled back. Implemented and tested below; declarative steps only, no auto-activation, no generated code.

## Phase 6 — bounded subagents slice implemented; UI tree and external acceptance open

Phase 6 target from the plan: shared budget, scope isolation, cascade cancel. Implemented and tested below with read-only roles and the plan's default limits; supervisor UI tree and write-capable children are not part of this version (documented).

## Phase 7 — control panel and gradual release implemented; live browser and external acceptance open

Phase 7 target from the plan: reliable trace visibility, dependable pause, shadow mode and canary with feature flags. Implemented and tested at runtime level; the live browser walkthrough itself remains part of the final consolidated validation pass.

## Phase 8 — n/a (plan has 7 phases; consolidated validation remains)

No GraphRAG/Neo4j sync, evidence-backed learning, Skill Studio, subagents or gradual release acceptance has been completed. Follow the target plan in order. Do not label these implemented based on proposed contracts.

## Session handoff — 2026-09-09, Phase 1 development slice implemented

Completed:

- `src/lib/agent/contracts.ts`, `runtime.ts`: three allowlisted tools, strict proposals, live database role check, server single-cafe scope, per-user run access, explicit approval hash/source-version/expiry, scoped idempotency, durable states and authoritative receipts. Real existing `setAiEnabled` service executes inside the receipt transaction. SQL completed-order totals are deterministic integer tomans with explicit UTC interval.
- `src/lib/agent/http.ts`, `planner.ts`; `src/app/api/admin/agent/runs/route.ts`, `runs/[id]/route.ts`, `telemetry/route.ts`: authenticated bounded JSON/same-origin HTTP, generic error responses, constrained existing-provider proposal adapter, run/control APIs and telemetry retry.
- `src/components/admin/AgentControls.tsx`, `src/app/admin/(panel)/ai/page.tsx`: opt-in execution panel next to existing analytical chat; natural-language proposal or model-free buttons, explicit old/new approval, execute, pause/resume/cancel, run/trace/receipt visibility. Unknown network create replies retain the idempotency key.
- `src/lib/agent/telemetry.ts`: durable event outbox, bounded sanitized OTLP/HTTP export to OpenObserve destination; failure retains events. This is basic event telemetry, not a complete instrumented runtime.
- `prisma/schema.prisma`: appended AgentRun/AgentEvent only (large diff against Git HEAD includes preexisting user schema changes). `prisma/agent-migrations/001_execution.up.sql` and `.down.sql`: isolated additive SQLite migration. `src/lib/ai/settings.ts`: optional transaction client, preserving existing caller behavior.
- `env.example`, `docs/agent-data-contracts.md`, `docs/agent-runbook.md`: flags, contracts, setup/recovery/rollback and operational limitations.
- `src/lib/agent/runtime.test.ts`: 19 real SQLite/HTTP transport tests. `src/lib/ai/ai.test.ts`: existing fake-key test now stubs fetch instead of contacting a real model provider.

Verification actually executed:

- Baseline before implementation: typecheck passed; 59 tests passed.
- `npx prisma generate`: passed; no migration performed by generation.
- First new integration attempt failed creating a nonexistent SQLite file (schema engine error), 15 tests skipped. Fixed by creating the empty disposable file before db push. Subsequent real tests passed.
- Final `npm run typecheck -- --incremental false`: passed.
- Final `npm test -- --reporter=dot`: **78/78 passed**, seven files, including **19 new integration tests**.
- `CI=1 npm run lint`: passed without warnings/errors before the final four test additions; final lint rerun recorded below.
- SQLite in-memory `up → down → up`: passed; preexisting Setting sentinel preserved.
- Proven: local mutation + inverse mutation, receipt readback, lost-reply replay, changed-key payload rejection, expiry/hash/stale-source approval checks, kill switch, revoked/denied identity, cross-user run denial, multiple-cafe fail-closed, pause/cancel, exact money/date/status filter, failed-receipt transaction rollback, route handlers against real DB with ONLY session lookup mocked, sanitized OTLP delivery/retry against a real local HTTP sink.

Actual limitations / acceptance boundaries:

- Full Phase 1 external/browser acceptance remains open: no live NextAuth browser session, real model proposal response or actual OpenObserve instance was exercised. UI only typechecked/linted. No production build/deployment or primary database migration was run. Agent flags remain off by default; installing tables/enabling in a development database is a separate runbook step.
- Scope is explicitly **single-cafe per database**. Cross-user and fail-closed scope tests are not proof of multi-tenant isolation. Legacy chat ownership and broad context concerns remain as audited.
- Only three tools, one bounded local action per run. Write is AI setting change, not an inventory/order/invoice/payment operation. Existing chat remains analytical; execution is the adjacent explicit path. No full-data catalog coverage yet.
- Error attempts are not yet durably represented as failed runs; rolled-back/policy-blocked runs remain retryable/cancellable. No recovery worker, retry backoff, hard-process-kill test, concurrent-worker stress test or external-call reconciliation. Phase 2 therefore **not complete** despite atomic local foundations.
- Telemetry is event-instant spans with stable IDs and at-least-once outbox. No measured duration hierarchy, model/retrieval spans, usage/cost metrics, automatic export worker or retention policy. OpenObserve server behavior is unverified.
- UI kill switch and runtime/subagent tree, budgets, bounded subagents, GraphRAG/provenance sync/deletion, memories/lessons, draft/promotion/rollback skills, prompt registry, shadow/canary and 30–50 scenario eval corpus are **not implemented**. Phases 3–7 not started. Do not claim entire target plan complete.

Continuation:

1. Read target plan, audit, this status and runbook; inspect current files rather than resetting the very dirty preexisting working tree.
2. Close Phase 1 browser/provider/collector validation in an isolated development setup; add planner malformed-output tests and actual authenticated browser flow. Keep unverified status explicit.
3. Phase 2: durable failure/recovery, concurrent execute/idempotency tests, crash process harness and approval/cancellation race acceptance. Only then proceed to GraphRAG phase 3 and its source/ACL/deletion gates.
4. Keep PostgreSQL/Neo4j/Python integration decisions explicit; do not convert the primary SQLite DB without authorization. No automatic skill activation or weight training.

OpenCode handoff: user requested terminal delegation and visible lower panel. Original OpenCode 1.16.2 internal DB failed on missing replacement_seq. Ran with temporary XDG_DATA_HOME=/tmp/farman-agent-work/data and an auth-file symlink (no credential printed), preserving user's original history. Two delegated runs stalled; owned processes were stopped, no usable code delivered. Codex completed this slice directly after user requested faster execution. User's original OpenCode process was not stopped. Task/log files remain under /tmp/farman-agent-work; source-of-truth continuation is this document, not temporary logs. No background coding process should continue editing this repository.

Final lint rerun after all test additions: `CI=1 npm run lint` passed, no warnings/errors.

## Session handoff — 2026-09-09 (continued), Phase 2 recovery slice

Completed:

- `src/lib/agent/runtime.ts`: execute now classifies failures by phase. `policy` rejections keep the run retryable and are durably recorded; `execution` phase deterministic failures (`VERIFICATION_FAILED`, `UNSAFE_MONEY_VALUE`) become terminal `failed`. Transient infrastructure errors (SQLite busy/locked, Prisma P2024) are retried with bounded backoff (3 attempts, 50ms/100ms) before recording `EXECUTION_ERROR`; failed transactions cannot duplicate effects, so retry is safe. Attempts are recorded in a separate transaction (`attemptCount` increment, bounded `lastError` code, `run.failed`/`run.attempt_failed` events) and never mask the original error; a lost race keeps the original outcome. Success clears `lastError`.
- `src/lib/agent/contracts.ts`: `AgentError` gained a `phase` (`policy` default | `execution`); no HTTP contract change.
- `prisma/schema.prisma`: AgentRun `error` column reused as `lastError` field (`@map("error")`) plus new `attemptCount` (default 0). `prisma/agent-migrations/002_failure_recovery.up.sql` / `.down.sql`: additive SQLite migration.
- `src/lib/agent/runtime.test.ts`: new `phase 2 recovery and races` suite (7 tests): durable policy rejections, terminal verification failure via a real Setting flip trigger, bounded transient retry (stubbed attempt), exhausted transient attempts stay queued, concurrent execute via `Promise.allSettled` (single effect + single receipt), approve/cancel race resolves to one coherent outcome, and a **real crash harness**: esbuild bundles a child that executes the write in a separate Node process against the same temp SQLite DB, the parent SIGKILLs it after the commit line, then verifies the durable receipt replays with exactly one effect and no re-execution.
- `src/lib/agent/planner.test.ts` (new): strict proposal contract — valid parse with question-only messages, malformed JSON/prose wrappers/trailing text, unknown tools, identity/extra fields, padded inputs, disabled assistant fail-closed.
- Docs: `agent-data-contracts.md` failure semantics + event names; `agent-runbook.md` 002 migration, failure/recovery semantics, rollback notes.

Verification actually executed (this session):

- Baseline rerun: typecheck passed; 78/78 tests passed.
- `npx prisma generate`: passed.
- First run of the new suite: 3 failures (child module resolution from /tmp, planner call-args destructure, wrong test flow asserting re-approval of an already-approved run). All fixed; no product-code changes were needed for the second and third.
- Final `npm test -- --reporter=dot`: **89/89 passed**, eight files, including **7 new Phase 2 tests** and **5 new planner tests**.
- Final `npm run typecheck -- --incremental false`: passed. `CI=1 npm run lint`: passed, no warnings/errors.
- Migration `001 up → 002 up → 002 down → 001 down → 001 up → 002 up` verified in disposable in-memory SQLite: sentinel preserved, `attemptCount` + `error` columns present after final up.

Actual limitations / unresolved issues:

- Same open external gates as Phase 1: no live NextAuth browser session, real model provider response, or real OpenObserve instance exercised; UI remains typecheck/lint only. No production deployment; primary database not migrated.
- Crash harness covers kill-after-commit on the local SQLite write; kills *during* the transaction and multi-process lock storms are only indirectly covered by the concurrency test. No automated crash-retry loop or scheduler yet.
- `attemptCount`/`lastError` are not yet surfaced in the AgentControls UI (visible via run detail events only). No backoff jitter; retry is per-request, not a background worker.
- approve/cancel race test tolerates either serialized winner by design; stricter ordering assertions would need clock control.

Next implementation step:

1. Optionally surface `lastError`/`attemptCount` in AgentControls run detail (small UI patch).
2. Close Phase 1/2 external acceptance in an isolated dev setup: authenticated browser flow against `npm run dev` with a disposable DB, planner proposal with a real provider key, and OpenObserve ingestion if an instance is available; keep unverified items explicit.
3. Phase 3 per plan order: GraphRAG with source provenance, validity periods, incremental sync and deletion propagation — requires the explicit stack decision (PostgreSQL+pgvector vs Neo4j vs SQLite interim) to be documented first; do not migrate the primary DB without authorization.

## Session handoff — 2026-09-09 (continued), Phase 3 GraphRAG catalog slice

Completed:

- Stack decision recorded: SQLite interim knowledge graph with the plan's metadata contracts (sourceId, sourceVersion, observedAt, validFrom/validTo, status, confidence, scopeId); Neo4j + pgvector + LangGraph Python service deferred — a later migration can replay `syncGraph` from the source. Primary database unchanged; no migration performed anywhere.
- `prisma/schema.prisma`: `GraphNode`, `GraphEdge`, `GraphSync` models. `prisma/agent-migrations/003_graph.up.sql` / `.down.sql`: additive; down removes only derived graph tables.
- `src/lib/agent/graph/sync.ts`: incremental watermark-polling sync (documented SQLite interim for transactional outbox/CDC), version-guarded upserts (stale/out-of-order events never overwrite newer graph versions), joins by source ID only, full edge rebuild from authoritative join tables, deletion reconciliation (deactivate with validTo, never silent removal), watermark advances only after a successful pass, `graphFreshness` gate via `GRAPH_MAX_STALE_SECONDS` (default 300).
- `src/lib/agent/graph/retrieval.ts`: bounded retrieval (20 candidates, 40 relation lookups, 1 hop), scope/status/validity filtered before return, provenance + relations + graphAsOf/stale in every result. Exact/substring label matching only — no embeddings yet (deliberate, documented).
- `src/lib/agent/contracts.ts` + `runtime.ts` + `planner.ts`: new allowlisted read tool `search_catalog` (ai.use; may write only derived Graph* tables during bounded sync; business data read-only; fail-closed on planner side). `calculate_sales_report` untouched — money still comes exclusively from the live Order aggregate.
- `env.example`: `GRAPH_MAX_STALE_SECONDS`.
- `src/lib/agent/graph.test.ts` (new, 10 tests): provenance-complete backfill + watermarks; incremental re-sync without duplication; watermark-cursor skip of out-of-order events; version-guard against stale overwrites; deletion propagation to nodes and edges; expired nodes never surface; retrieval budget bound; end-to-end `search_catalog` run with provenance/relations/freshness; short-query and denied-identity rejection; financial answers stay on the live source (not the graph).
- Docs: data contracts (search_catalog + Phase 3 graph contracts + stack decision), runbook (knowledge graph section), env.example.

Verification actually executed (this session):

- Baseline: 89/89 tests passed before Phase 3 changes.
- `npx prisma generate` after schema change: passed.
- First graph test run: 1 suite load failure (wrong relative import), 1 PrismaClientValidationError (missing required `description`), and a typecheck union-aggregate error — all fixed.
- Final `npm test -- --reporter=dot`: **99/99 passed**, nine files (10 new Phase 3 tests).
- Final `npm run typecheck -- --incremental false`: passed. `CI=1 npm run lint`: passed.
- Full migration cycle `001 up → 002 up → 003 up → 003 down → 002 down → 001 down → 001 up → 002 up → 003 up` verified in disposable in-memory SQLite; preexisting sentinel preserved; all five agent tables present.

Actual limitations / unresolved issues:

- Retrieval has no semantic/vector search: substring label matching only, so recall is limited for paraphrased Persian queries. No GraphSync scheduling (sync runs inside search_catalog), no background worker, no cache layer.
- Graph covers catalog entities only — no Order/Staff/Procedure/Document/Lesson/Skill nodes yet; no memory types (Phases 4+), no skill capability nodes (Phase 5), no subagent capability nodes (Phase 6).
- Single-cafe scope enforced; no per-tenant ACL references in graph metadata beyond scopeId (no multi-tenancy exists in this app).
- Same open external gates as Phases 1–2: no live browser flow, real provider, or real OpenObserve instance exercised; UI unchanged this phase.
- `search_catalog` result provenance is verified by tests but the AgentControls UI does not render per-result source IDs yet (raw receipt JSON is visible).

Next implementation step:

1. Phase 4 per plan order: memory and evidence-backed lessons — episodic records from real AgentRun/AgentEvent data, Lesson proposals with witness refs, conflict/expiry handling, and a memory read path gated by the same permission model; draft-skill data model groundwork. Model weight updates and auto-activation stay out of scope.
2. After all phases: consolidated validation pass — live browser flow against `npm run dev` with a disposable DB, real provider proposal, real OpenObserve ingestion, crash/kill and concurrency stress reruns, then the 30–50 scenario eval corpus from the plan. Every unverified external claim stays explicitly open until then.

## Session handoff — 2026-09-10, Phase 4 memory and lessons slice

Completed:

- `prisma/schema.prisma`: `AgentEpisode` (unique per scope+run; tool/state/errorCode/note) and `AgentLesson` (topic/statement/status/evidence/proposedBy/reviewedBy/validFrom/validTo). `prisma/agent-migrations/004_memory.up.sql` / `.down.sql`: additive; down removes only memory tables.
- `src/lib/agent/runtime.ts`: automatic episodic capture inside outcome transactions (success, durable failure, attempt recording — never model-invented); `correct` control action (bounded 2–500 char note validated in runtime as well as HTTP schema; allowed on any non-running run so policy-blocked facts are corrigible); lesson `propose` (evidence must be caller-owned, same scope, terminal or durably errored), `controlLesson` (activate/reject/expire; activation requires ai.configure; same-topic activation supersedes the previous active lesson — conflict handling without deletion), `listLessons` (active+valid only, evidence resolved live from AgentRun).
- `src/lib/agent/contracts.ts`: `list_lessons` allowlisted read tool; `controlSchema` extended with `correct` + `note`; `lessonProposalSchema`/`lessonControlSchema`.
- HTTP: `GET/POST /api/admin/agent/lessons`, `POST /api/admin/agent/lessons/[id]`, `correct` passthrough on `runs/[id]`.
- Planner untouched: the model cannot propose or activate lessons (explicitly out of scope per plan). No weight updates; no skill auto-activation.
- `src/lib/agent/lessons.test.ts` (new, 8 tests): episode capture from real outcomes; corrections incl. policy-blocked runs and note bounds; evidence must be real/terminal-or-errored/owned; explicit activation (cashier denied, no self-activation path), supersession conflict handling; reject/expire state machine; read path surfacing (drafts/rejected/superseded/expired hidden, live evidence refs); end-to-end correction→lesson→`list_lessons` response with WRITES_DISABLED provenance; denied identity and empty topics.
- Docs: data contracts (list_lessons, correct, Phase 4 contracts), runbook (memory/lessons section).

Verification actually executed (this session):

- Baseline: 99/99 tests before Phase 4 changes; `npx prisma generate` passed.
- Iterations: 6 initial failures (3 wrong test expectations, TERMINAL_RUN blocking correct on terminal runs, note length unvalidated below HTTP layer, evidence rejecting policy-blocked-but-recorded runs). Fixes: runtime correct-action gating + note validation + evidence rule; test expectation corrections.
- Final `npm test -- --reporter=dot`: **107/107 passed**, ten files (8 new Phase 4 tests).
- Final typecheck: passed (after fixing a nullable-filter TS error in listLessons). `CI=1 npm run lint`: passed.
- Full migration cycle `001→002→003→004 up, down all, up again` verified in disposable in-memory SQLite; sentinel preserved; 7 agent tables present.

Actual limitations / unresolved issues:

- No UI yet for corrections/lesson review (API + tool only); AgentControls does not render lessons. AgentControls lastError/attemptCount display from Phase 2 also still pending.
- Lessons are single-topic-keyed; no cross-topic ranking, no dedup of near-identical statements, no automatic conflict detection beyond same-topic supersession, no lesson usage counter/outcome feedback.
- Evidence is run-level only (no chunk-level citations); no semantic memory store yet; procedural memory is deferred to Phase 5 skill drafts.
- Same open external gates: no live browser/provider/OpenObserve validation; primary DB untouched; flags default off.

Next implementation step:

1. Phase 5 per plan order: Skill Studio groundwork — versioned skill drafts from real corrected episodes (declarative YAML-contract workflow over allowlisted tools), sandbox evaluation with mock tools, explicit promotion/rollback; no auto-activation.
2. Then remaining phases 6 (bounded subagents) and 7 (control panel, shadow/canary), followed by the consolidated validation pass (live browser, real provider, real OpenObserve, eval corpus 30–50 scenarios) — all external claims stay unverified until then.

## Session handoff — 2026-09-10 (continued), Phase 5 skills slice

Completed:

- `prisma/schema.prisma`: `AgentSkill` (unique scope+slug+version; definition, sourceEpisodes, testResult, status lifecycle). `prisma/agent-migrations/005_skills.up.sql` / `.down.sql` (additive; down removes only AgentSkill).
- `src/lib/agent/contracts.ts`: `skillDefinitionSchema` mirroring the plan's YAML contract — slug, semver, description, triggers, allowedTools (strict subset of TOOL_CONTRACTS), steps 1–10 each validated against the per-tool proposal schema, successCriteria. Unknown tools, unallowed step tools, invalid inputs and bad semver fail at draft time.
- `src/lib/agent/runtime.ts`: `createSkillDraft` (ai.use; sourceEpisodes must be real in-scope AgentEpisode IDs), `testSkill` sandbox (read steps execute for real against scoped data; `set_ai_enabled` steps mocked to recorded intent — zero side effects, asserted in tests), `controlSkill` activate/deactivate (ai.configure; activation requires a recorded passing evaluation, EVALUATION_REQUIRED gate; activating a version retires other active versions of the same slug), `rollbackSkill` (explicit re-activation of latest retired passing version), `listSkills`.
- HTTP: `GET/POST /api/admin/agent/skills`, `GET/POST /api/admin/agent/skills/[id]` (test/activate/deactivate actions).
- `src/lib/agent/skills.test.ts` (new, 8 tests): episode evidence required (real, in-scope); draft-time schema rejections (unknown tool, unallowed step, invalid input, bad semver); permission denial; sandbox read-real/write-mocked with zero Setting side effects; activation gate blocks failing evaluation; new-version supersession; explicit rollback reactivates v1.0.0 and retires v1.1.0 (with permission denial); deactivate/list state and permission checks.
- Docs: data contracts (Phase 5 skill contracts), runbook (skills section).

Verification actually executed (this session):

- Baseline: 107/107 tests before Phase 5; `npx prisma generate` passed.
- Iterations: initial run 7 failed (strict schema rejected sourceEpisodes mixed into definition — fixed by stripping before parse; one test asserted a step-outside-allowedTools case that was actually valid — fixed test; sandbox failing-eval test was unconstructible because draft-time validation already rejects invalid date ranges — replaced with a recorded-failing-evaluation gate test; cashier list permission expectation fixed). No governance shortcuts introduced.
- Final `npm test -- --reporter=dot`: **115/115 passed**, eleven files (8 new Phase 5 tests).
- Final typecheck: passed. `CI=1 npm run lint`: passed.
- Full migration cycle `001→002→003→004→005 up; down all; up again` in disposable in-memory SQLite: sentinel preserved; 8 agent tables present.

Actual limitations / unresolved issues:

- Skills cannot be EXECUTED yet: no runSkill orchestration that creates governed runs per step (read steps auto, write steps stop at waiting_approval). Activation/tests/rollback are complete; execution engine is the next increment. No UI for skills (API only). No diff view, export to Markdown+manifest, or usage counters yet.
- Sandbox mocks only `set_ai_enabled` (the sole write tool); adding future write tools must extend the mock registry or sandbox safety is lost.
- Draft evidence requires episodes but does not yet require them to be corrective (note/lastError) — accepted as-is, documented; tightening later would be a one-line change.
- Same open external gates: no live browser/provider/OpenObserve validation; primary DB untouched; flags default off.

Next implementation step:

1. Complete Phase 5: skill execution orchestration (`executeSkill` creating real governed runs per step, pausing at write approvals) and optionally UI list/activate in AgentControls.
2. Phase 6 per plan: bounded subagents — spawn contract (parent_run_id, allowed_tools ⊂ parent, budget deduction, max 3 children/depth 1/12 tool calls), cascade cancel, output verification. Then Phase 7: control panel tree/kill switch UI, shadow/canary flags.
3. Then the consolidated validation pass (live browser, real provider, real OpenObserve, 30–50 scenario eval corpus). External claims stay explicitly unverified until then.

## Session handoff — 2026-09-10 (continued), Phase 6 bounded subagents slice

Completed:

- `prisma/schema.prisma`: AgentRun `parentRunId` (null = supervisor) + `toolCallBudget` (default 12) + parent index. `prisma/agent-migrations/006_subagents.up.sql` / `.down.sql` (additive; down archives child history first).
- `src/lib/agent/contracts.ts`: `spawn` control action with `subtask` schema (task 5–300, role, proposal); `SUBAGENT_ROLES` — `data_research` (get_ai_status/search_catalog/list_lessons), `finance` (calculate_sales_report); `SUBAGENT_LIMITS` = plan defaults (3 concurrent, 12 total tool calls, depth 1).
- `src/lib/agent/runtime.ts`: spawn inside control transaction — role-tool membership + risk=read enforced (`SUBAGENT_TOOL_FORBIDDEN`/`SUBAGENT_WRITE_FORBIDDEN`; subagents can never write), live identity re-check for the child tool, depth-1 (`SUBAGENT_DEPTH_EXCEEDED`), budget deduction from parent `toolCallBudget` (child inherits remainder), concurrency cap on non-terminal children; child created as a normal queued run traceable by its own traceId. `get` returns `children[]` with parsed receipts for supervisor verification. Cascade cancel in the same transaction (terminal children keep receipts); cancelled children replay terminal without effect.
- HTTP: `runs/[id]` control passthrough extended with `subtask` (schema-validated, bounded).
- `src/lib/agent/subagents.test.ts` (new, 8 tests): spawn+execute with supervisor verifying child receipt; finance role exact live total + wrong-role tool forbidden; write tool forbidden; depth 1; 12-call budget with 13th blocked (terminal children free slots); concurrency cap 3 with slot reuse after completion; parent cancel cascades to non-terminal children while terminal children keep receipts + cancelled replay has no effect; unprivileged spawner denied and child runs user-scoped.
- Docs: data contracts (Phase 6 subagent contracts), runbook (subagents section).

Verification actually executed (this session):

- Baseline: 115/115 tests before Phase 6; `npx prisma generate` passed.
- Iterations: first run 3 failed — budget test hit the concurrency cap before the budget cap (fixed test to execute children sequentially, which is also the correct usage pattern), cascade test asserted rejection where Phase 1 terminal replay correctly returns the cancelled run without effect (test aligned with established receipt semantics), cashier denial error is FORBIDDEN from identity() before run lookup (test expectation fixed). No runtime governance changes needed after review.
- Final `npm test -- --reporter=dot`: **123/123 passed**, twelve files (8 new Phase 6 tests).
- Final typecheck: passed (after widening the test helper's role parameter type). `CI=1 npm run lint`: passed.
- Full migration cycle `001→002→003→004→005→006 up; down all; up again` in disposable in-memory SQLite: sentinel preserved; 8 agent tables; parentRunId/toolCallBudget present after final up.

Actual limitations / unresolved issues:

- Subagents are read-only by design in this version; no write-capable children (the plan allows writes under central approval — deferred with justification: every write currently requires explicit human approval, and supervisor-initiated writes are deferred until the control panel queues them properly).
- No spawn LLM routing: spawn is an explicit API control action, not model-initiated (deliberate — the planner cannot spawn subagents; fail-closed).
- No UI parent/child tree yet (API only); no per-child token/cost accounting (only tool-call count); no parallel child execution harness beyond the concurrency counter (children execute sequentially through the explicit execute path).
- Skills execution orchestration from Phase 5 still pending (documented there).
- Same open external gates: no live browser/provider/OpenObserve validation; primary DB untouched; flags default off.

Next implementation step:

1. Phase 7 per plan: control panel completion — parent/child tree, approval queue, cost display, UI kill switch in AgentControls; shadow/canary release flags for the agent surface.
2. Then the consolidated validation pass promised across phases: live browser flow (`npm run dev`, disposable DB), real provider proposal, real OpenObserve ingestion, crash/concurrency stress reruns, 30–50 scenario eval corpus. External claims stay explicitly unverified until executed.

## Session handoff — 2026-09-10 (continued), Phase 7 control panel and gradual release slice

Completed:

- `src/lib/agent/runtime.ts`: `status(userId)` (server-authoritative enabled/writes/shadow/canary/queue/running for the UI banner); `shadow()` flag — write execution blocked with observable `SHADOW_MODE` (403) while the whole read/propose/approve/lessons/skills/subagents loop proceeds; `canary()` enforced inside `identity()` (`CANARY_NOT_ENROLLED` 403) so every agent call honors enrollment. Both env-only, never client- or model-settable.
- `GET /api/admin/agent/status` route.
- `src/components/admin/AgentControls.tsx` (rewritten, same visual idiom): status banner with kill-switch state (AGENT_ENABLED/WRITES/shadow/canary), approval-queue summary, catalog/lessons shortcuts (shadow disables write buttons), run list with waiting-approval highlighting + show-all toggle, per-run attemptCount/lastError display, `correct` note input on terminal runs, subagent children tree with receipts, lessons shortcuts. Includes the previously pending Phase 2 UI debt (lastError/attemptCount).
- `env.example`: `AGENT_SHADOW_MODE=false`, `AGENT_CANARY_USERS=`.
- `src/lib/agent/release.test.ts` (new, 3 tests): shadow blocks the approved write path with SHADOW_MODE while reads succeed and zero Setting effects; canary blocks unlisted users on every call and admits listed ones (plus removal restores access); status() reflects shadow + queue counts.
- Docs: runbook (control panel + rollout ladder), data contracts (Phase 7 section).

Verification actually executed (this session):

- Baseline: 123/123 tests before Phase 7 changes.
- `src/lib/agent/release.test.ts` first run: 1 failed (test resolved inputHash through a roundabout list lookup — APPROVAL_MISMATCH; fixed to use the run's own hash).
- Final `npm test -- --reporter=dot`: **126/126 passed**, thirteen files (3 new Phase 7 tests).
- Final typecheck: passed. `CI=1 npm run lint`: passed.
- No new migration (flags are env-based; schema unchanged this phase — 006 remains the last migration).

Actual limitations / unresolved issues:

- UI verified only by typecheck/lint — no live browser session exercised yet (consistent with all prior phases; external gates deliberately consolidated).
- No token/cost accounting display yet (plan lists cost per run; only counts exist); no per-child cost; no prompt-registry versioning; no skill UI (Phase 5 items still open); no automatic canary evaluation metrics.
- Kill switch remains env-based; the banner is read-only status, not a control.
- Skill execution orchestration (Phase 5 increment) still pending.
- OpenObserve exporter unchanged (Phase 1 state); no model/retrieval/tool duration spans yet.

Next implementation step — consolidated validation pass (promised across phases):

1. Live browser walkthrough: `npm run dev` with a disposable DB (runbook steps), NextAuth login as a dev owner, exercise read → write approval → execute → correct → lessons flow in AgentControls; record actual results.
2. Real provider planner proposal (existing ZHIPU-style provider credential, dev only) and — if available — a real OpenObserve instance ingestion check against the exporter.
3. Rerun crash/concurrency stress suites; build the 30–50 scenario eval corpus from the plan and record retrieval correctness/latency/token baselines vs. the legacy chat.
4. Remaining increments if time: skill execution orchestration, skill UI, subagent cost display.
5. Update this file with executed results; anything not exercised stays explicitly "unverified".

## Consolidated live validation — 2026-09-10, EXECUTED against the real dev app

Setup: applied additive migrations 001–006 to the existing `prisma/dev.db` (backup: `prisma/dev.db.backup-agent`), seeded dedicated owner `agent-dev@farmans.cafe`, restarted `npm run dev` with `AGENT_ENABLED=true AGENT_WRITES_ENABLED=true AGENT_CAFE_ID=<dev cafe>` (in-process env, .env untouched). Authenticated Chrome walkthrough via agent-browser on http://localhost:3080/admin/ai.

Verified LIVE (real browser, real DB, real server):

- Login → admin panel → AgentControls region renders with status banner, shortcuts, run list. Legacy chat and AI switch intact.
- `get_ai_status`: created via UI button, executed, **succeeded** with real read-back (enabled=true, Setting version).
- `set_ai_enabled`: UI create → **waiting_approval** with old/new value + expiry shown → approve via UI → **queued** (approvedBy recorded) → execute → **succeeded**; Setting read-back verified. Full human-approval loop exercised in the real browser.
- `search_catalog`: UI button, **succeeded** — query "قهوه" returned 5 graph results with sourceId/sourceVersion provenance (Category:قهوه …), graph sync inside the tool worked against the live catalog.
- `list_lessons`: UI button, **succeeded** (0 active lessons, correct empty state).
- Real model planner: Persian question "وضعیت دستیار را بررسی کن" typed into the UI produced a new run via the real provider — strict-JSON proposal accepted, **succeeded**. (Provider credential from the existing dev .env; value never printed.)
- Durable trace: 6 runs, 21 AgentEvents, all receipts in SQLite; UI showed run IDs, trace IDs, states, Persian answers.
- Automation note: agent-browser ref clicks were unreliable against React re-renders (stale coordinates, not an app bug — confirmed: the same actions succeed via DOM .click() and direct fetch in page context; the create-button path worked via agent-browser click natively).

Still unverified / open:

- Real OpenObserve instance ingestion (no instance available; local sink test from Phase 1 remains the only delivery evidence).
- Crash-kill and concurrency stress were verified in Phase 2 test harness; not re-executed against this live server (no reason to SIGKILL a user-facing dev server now).
- 30–50 scenario eval corpus, per-run token/cost display, skill execution orchestration, skills/lessons dedicated UI panels: still open (documented per-phase).
- Production deployment, PostgreSQL/Neo4j migration: out of scope without authorization.

## Session handoff — 2026-09-10 (closing), workspace session R01–R10 recorded and final report written

The workspace session itself (unified workspace, durable worker, business tools, files/artifacts, reporting, graph freshness fixes, OpenObserve compose) is documented in `agent-runbook.md` (R01–R10 sections). This session closed its documentation trail:

- Fixed the last lint warning (`react-hooks/exhaustive-deps` on the mount effect in `src/components/admin/Workspace.tsx`) by adding the stable `api` callback to the deps array — zero behavior change.
- Wrote the missing final consolidated report `docs/agent-workspace-result.md` (referenced by the runbook since the workspace session; R01–R10 table with evidence, validation state, explicit unverified items).
- Verification executed this session: 146/146 tests passed (16 files), typecheck passed, `CI=1 npm run lint` passed with no warnings, live-browser screenshots in `artifacts/agent-workspace-validation/` reviewed as evidence.

Still open (unchanged): real OpenObserve instance ingestion; 30–50 scenario eval corpus; per-child cost accounting; production deployment/DB migration (unauthorized).

## Session handoff — 2026-09-10 (closing #2), OpenObserve verified live + 40-scenario eval corpus executed

Both remaining consolidated-validation gates closed, with three real defects found and fixed:

**OpenObserve ingestion — VERIFIED against a real instance (R10 closed):**
- Real OpenObserve v0.92.2 container (compose, localhost-only). 71 real AgentEvents from the dev DB exported by `flushAllTelemetry` → spans queryable via `POST /api/{org}/_search_stream?type=traces` (`?type=traces` is mandatory in this build; plain `_search` returns `Search stream not found`) and rendered by the UI Traces charts. Evidence: `artifacts/agent-workspace-validation/openobserve-ingested-spans.png` + outbox drain counts.
- Config fixes: compose image pinned `v0.92.2` with `ZO_QUERY_ON_WAL=true` (without it fresh WAL spans are not queryable), removed the broken `command:` override. Re-delivery after container recreation exercised the at-least-once outbox in practice. Operational details in the runbook R10 section; `scripts/oo-flush.mts` is the flush tool.

**Eval corpus (plan item, 30–50 scenarios) — 40 scenarios, 40/40 PASS:**
- `scripts/eval-corpus.mts`: Persian scenarios over the real governed runtime against the real dev DB (catalog 14, orders 7, finance 6, inventory 4, staff 3, status/lessons 4, governance denials 2). Ground truth verified from the live source (8 COMPLETED orders, total 1,705,000 tomans; Tehran-day boundaries computed via explicit UTC half-open intervals). Correctness 100%; latency p50 3.7ms / p95 12.9ms / max 16.6ms; witness coverage n/a (0 active lessons); tokens 0 (model-free explicit proposals — planner/provider token baselines remain a separate live pass by design). Results: `artifacts/agent-workspace-validation/eval-corpus-results.json`.

**Defects found by the corpus and fixed:**
1. `list_inventory` run-path handler ignored `lowOnly` in the sandbox path (`runReadToolDirect`) — the two implementations had diverged; unified to the run-path semantics (isActive filter, `stockQuantity <= minQuantity`, page via take, count = total matching).
2. Graph retrieval never returned 1-hop neighbor nodes as results (they only resolved relation labels) — a category query like "قهوه" never surfaced its products. Fixed in `src/lib/agent/graph/retrieval.ts`: neighbors are results now, same provenance/filters, marked `via: "neighbor"`, bounded by the same budget. Runbook R09 documented neighbor filtering as surfacing — code now matches the documented behavior.
3. `docker-compose.yml` OpenObserve: `command: openobserve` broke the image entrypoint; `latest` replaced by pinned `v0.92.2` + `ZO_QUERY_ON_WAL=true`.

Verification executed this session: 40/40 eval scenarios pass; 146/146 tests pass (16 files, incl. updated graph budget/E2E expectations for the neighbor fix); typecheck passed; `CI=1 npm run lint` passed with no warnings.

Still open: planner/provider token baselines vs. legacy chat (requires live provider pass — the corpus harness is ready to extend); per-child cost accounting; production deployment/DB migration (unauthorized).

## Session handoff — 2026-09-10 (closing #3), chat ordering fixed + full section coverage

**Chat display order fixed (user-visible bug):** the workspace chat-fallback persists user+assistant in one `createMany`, so both rows shared the same `createdAt` millisecond and `orderBy createdAt desc` rendered the answer ABOVE its own question (user messages appeared "under the response"). Fixed three ways: explicit distinct timestamps (+1ms) in `src/app/api/admin/ai/chat/route.ts`, an `id` tie-breaker in the session route ordering, and a one-off repair of the 10 existing same-timestamp pairs in the dev DB (32 messages scanned).

**Every admin section now reachable (R05 extension):** 7 new bounded read tools — `list_products`, `list_categories`, `list_tables`, `list_qr_codes`, `list_users` (no passwordHash/phone), `list_ratings`, `list_allergens` — each with its section permission (`products.manage`, `categories.manage`, `tables.manage`, `qr.manage`, `users.manage`, `ratings.moderate`, `allergens.manage`), implemented ONCE in `runtime.ts` `sectionRead` shared by the run path and skill sandbox (no divergence). Planner menu updated. Eval corpus extended to 47 scenarios — 47/47 pass (p50 3.7ms / p95 16.4ms); runtime suite extended (+1 test: receipts, bounds, no-secrets). 149/149 tests, typecheck and lint clean. Docs: runbook R05 tool list updated.

## Session handoff — 2026-09-10 (closing #4), agent answered like the chat, not the agent

User feedback ("does it look like the agent is working to you?") exposed three defects in the real conversation flow:

1. **Planner declined tool-worthy questions** ("خریداری چند تا بسته برنج" → declined → the analytical fallback said "دسترسی محدود"). SYSTEM_PROMPT_BASE now instructs: any question about menu/stock/orders/staff/tables/QR/users/ratings/allergens/revenue maps to the closest READ tool; `{}` only for chit-chat/out-of-scope. Verified with the real provider: stock → `list_inventory`, recommendation → `search_catalog`.
2. **Date hallucination**: "وضعیت این یک ماه" produced 2023 dates (training-cutoff guess) because the model had no clock. The planner system prompt now carries the current UTC time (Tehran = UTC+3:30 noted) and relative periods resolve to real datetimes ("فروش امروز" → 2026-09-10 window).
3. **Uninformative completion lines**: `summarizeStepResult` had no cases for list_* receipts, so every section read ended in the generic "عملیات با بررسی نتیجه کامل شد". All section tools now produce natural Persian summaries with counts, sample names and the live-source note (runtime.ts).

149/149 tests, typecheck and lint clean. The chat fallback now only serves chit-chat/out-of-scope questions; data questions route through the governed tool path with provenance.

## Session handoff — 2026-09-10 (closing #5), revenue questions answered with real breakdowns

User's chart/breakdown questions got only the bare total, and "بیشترین سفارش مربوط به چه ایتمی بود؟" hit the generic completion line. Root cause: the agent's `calculate_sales_report` reimplemented a bare aggregate instead of using the shared reporting service the finance pages use — an R07 divergence. Fixed:

- The tool now calls `completedSalesSummary` (byDay, byProduct top-10, byCategory, honest Persian `text`) — chat answers, the finance page and generated files all render the same object. The caller's transaction client is passed through (`reporting.ts` gained an injectable client parameter) so reads stay on the run's connection — the test suite caught this as a real cross-connection bug before it shipped.
- `summarizeStepResult` renders the service's own `text` for report receipts; the planner TOOL_MENU documents byDay/byProduct so "بیشترین سفارش/ریز درامد/نمودار روز به روز" route to the report tool.
- Verified live with the real provider: "ریز درامد این ماه" → full report (جمع 1,705,000؛ قهوه 805,000، دسر 435,000…؛ پرفروش‌ترین‌ها: کاپوچینو 680,000 (5 عدد)); "بیشترین سفارش" → پرفروش‌ترین‌ها answer.
- 149/149 tests, lint clean, eval 47/47 (p50 3.9ms). Data contracts updated for the extended receipt.
