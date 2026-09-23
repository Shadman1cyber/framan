# Android Offline-First Plan (grounded in the actual FARMAN codebase)

Date: 2026-09-19. Author: implementation agent. Status: plan → implemented (see `docs/android-offline-first.md`).

This plan was written **after** inspecting the repository. Nothing below is assumed:
every API, table, permission and rule cited exists in the tree (paths given).

## 1. Current architecture (verified)

- **Stack:** Next.js 14 App Router + React 18 + TypeScript, Prisma 5 + SQLite
  (`prisma/dev.db`, applied with `prisma db push`; hand-written additive SQL in
  `prisma/agent-migrations/00*.up/down.sql`), next-auth v4 **JWT credentials**
  (`src/lib/auth.ts`), Capacitor 8 wrapper in `android/` (WebView shell pointing
  at the deployed web app — NOT a native app), next-pwa, Vitest.
- **Domain:** single-café coffee-shop platform (QR menu, customer ordering, table
  sessions, ratings, inventory = `Ingredient`, RBAC CUSTOMER/CASHIER/OWNER,
  owner-only financial dashboard + AI assistant (Zhipu GLM-4) + CSV import,
  agent workspace behind flags).
- **IDs:** server rows use `cuid()`; the offline ledger protocol mandates UUID v4
  for entry/operation/device/idempotency keys (`src/lib/ledger/service.ts`).
- **Time:** UTC ISO-8601 on the wire; `occurred_at` is client audit time;
  server ordering is by `server_sequence`. Display tz `Asia/Tehran` (sales-flow).
- **Single-café scope:** sync/ledger/agent code paths resolve scope from
  `AGENT_CAFE_ID` env and fail closed (403 `SINGLE_CAFE_SCOPE_REQUIRED`) unless
  exactly one `Cafe` row matches. Seed creates one café (`farmans`).
  **Operational note:** `AGENT_CAFE_ID` is unset in the shipped `.env`, so
  `/api/sync/*` currently 403s everywhere until deployment sets it. The Android
  app cannot sync until the server is configured (documented, not worked around).

## 2. Existing API architecture (reused as-is)

| Endpoint | Auth | Purpose for Android |
|---|---|---|
| `GET /api/auth/csrf` | public | CSRF token for native credentials login |
| `POST /api/auth/callback/credentials` (form, `json=true`) | public | email+password login, sets session cookie |
| `GET /api/auth/session` | cookie | session/profile fetch, offline-session validation |
| `POST /api/auth/signout` | cookie | logout |
| `POST /api/sync/push` | `finance.view` (OWNER) | batch push, per-op results, idempotent replay, key-reuse 409 |
| `GET /api/sync/pull?after=&take=` | `finance.view` | ledger changes after cursor (today: ledger only) |
| `GET /api/sync/status` | `finance.view` | server cursor/counts |
| `POST /api/admin/ingredients/adjust` | `ingredients.manage` (OWNER) | **online-only** additive adjust (no idempotency → never replayed) |
| `GET /api/admin/ai/insights` | `ai.use` (OWNER) | cached insights list (pulled, read offline) |
| `POST /api/admin/ai/insights` | `ai.use` | regenerate → **online-only** |
| `GET /api/admin/analytics` | `finance.view` | server dashboard; Android derives its own from the local ledger mirror |
| `POST /api/orders` | any non-management | customer checkout; management 403 → NOT an Android path |

Sync protocol wire format: `docs/sync-protocol.md`. Retry semantics: retryable =
transport/5xx/429/`CONFLICT_RETRY`/missing-op; permanent = validation,
`IDEMPOTENCY_KEY_REUSE`, `ALREADY_REVERSED`; 401 = keep pending, flag
`auth-required` (`src/lib/offline/ledger-outbox.ts` `runLedgerSync` — the Android
engine ports this exact state machine).

## 3. Existing relevant entities (server)

`User` (role), `Category`, `Product` (+images, ingredients, allergens, coffee
lines), `CoffeeLine`, `Ingredient` (**mutable** `stockQuantity` — the hazard),
`Order/OrderItem` (customer flow, server state machine), `CafeTable/Branch/QRCode`,
`Staff`, `AIInsight` (persisted, cacheable), `Setting`,
`LedgerEntry` (immutable, scoped idempotency + sequence), `SyncOperation`
(server receipt), `SyncDevice` (diagnostic).

**Gap (to be added, minimal + additive):** no append-only stock-movement record
exists — `docs/accounting-ledger.md` explicitly defers it ("Stock movements are
future append-only work"). Offline inventory REQUIRES it (mutable
`stockQuantity` + last-write-wins would corrupt stock). Addition:
`StockMovement` table + `RECORD_MOVEMENT` sync op + pull support + catalog
snapshot endpoint (details §9).

**Deliberately NOT synced:** `Order` (customer checkout needs QR table-session
cookies + server state machine; stays web/PWA online flow), users/staff
management, QR, import, agent runs (approval-gated server workflows).

## 4. Proposed Android architecture

New top-level Gradle project `android-app/` (the existing `android/` Capacitor
shell, its CI and `build-android.sh` are untouched):

```
android-app/
  settings.gradle.kts  (modules :core, :app)
  core/                # pure Kotlin/JVM: protocol types, outbox state machine,
                       # backoff, conflict policy, money/stock math, validation.
                       # JUnit5 tests run WITHOUT the Android SDK.
  app/                 # Android: Room, Retrofit/OkHttp, DataStore +
                       # EncryptedSharedPreferences, WorkManager, Compose UI.
```

Layering (UI never touches network):

```
Compose UI → ViewModel → Repository → Room (Flow, source of truth)
                                   ↘ SyncEngine → WorkManager → Retrofit
```

Manual dependency injection via an `AppContainer` (no Hilt: avoids kapt and
keeps the build reproducible offline/mirrored).

Tech: Kotlin 2.x, Compose BOM + Material3, Room, Retrofit/OkHttp, DataStore
Proto? (no — Preferences DataStore + EncryptedSharedPreferences for secrets),
WorkManager, Coroutines/Flow, Security-Crypto (Keystore), MockWebServer +
Robolectric + JUnit for tests. compileSdk 35 / minSdk 24 (matches existing app) /
JDK 17 toolchain (AGP 8.x; CI uses JDK 21 which also works).

## 5. Local database schema (Room `FarmanDatabase`)

Mirrors server tables 1:1 on canonical ids (server id = primary key):

- `users` — cached session profile: id, email, name, role, fetchedAt. (One row;
  replaced on login; never a credential store.)
- `ledger_entries` — full `LedgerEntry` mirror + `localState` (PENDING/SYNCED/
  FAILED) + `syncError`. PK = entry UUID. Index `serverSequence`.
- `stock_movements` — id, ingredientId, delta, reason, occurredAt, deviceId,
  serverSequence NULL until acked, state, error. Index (ingredientId, seq).
- `products`, `categories`, `coffee_lines`, `ingredients` (snapshot + local
  derived stock), `staff`, `tables` — server snapshot rows + `snapshotVersion`.
- `ai_insights` — cached insights (id, kind, severity, title, body, createdAt).
- `sync_operations` — **durable outbox**: operationId, idempotencyKey UNIQUE,
  entityType, entityId, operationType, payload JSON, clientTimestamp, deviceId,
  status PENDING/PROCESSING/FAILED/SYNCED, attemptCount, lastError,
  nextRetryAt, createdAt. Survives process death + reboot (Room + WorkManager).
- `sync_meta` — key/value: `ledgerCursor`, `stockCursor`, `catalogVersion`,
  `lastSyncAt`, `deviceId` (UUID, generated once).
- Derived values (balances, stock levels) are **computed queries**, never stored.

## 6. Synchronization architecture

- **Push:** `SyncWorker` (WorkManager, `NetworkType.CONNECTED`, exp. backoff,
  unique work `farman-sync`) drains due ops in FIFO batches ≤20 → `POST
  /api/sync/push` with stable `device_id`. Per-op result handling ports
  `runLedgerSync`: applied→mark SYNCED (+store serverSequence on the local row);
  retryable→PENDING with `computeRetryDelayMs` backoff+jitter (1s→60s);
  permanent→FAILED retained with code+message; missing-from-response→retryable;
  transport failure→whole batch retryable; **401→attempts untouched, flag
  auth-required, stop**.
- **Pull:** after push, `GET /api/sync/pull` per entity cursor (ledger, then
  stock), paginated (`take` ≤500), upsert rows + advance cursor **in the same
  Room transaction** (cursor safety). Then `GET /api/sync/catalog?since=`:
  version compare → full snapshot replace in one transaction when changed.
  Then cache `GET ai/insights`.
- **Triggers:** connectivity regain (WorkManager constraint), app foreground,
  user pull-to-refresh / retry button, periodic 15-min while online.
- **Idempotency:** caller-generated UUID v4 idempotency key per op, stored once;
  crash between apply+ack replays the same key → server returns original result
  (`duplicate:true`). Worker is re-entrant; overlapping runs serialized via
  unique work + `markProcessing` lease reset on startup (`processing→pending`).

## 7. Conflict resolution strategy

- **Money & stock: append-only additive merge, never LWW.** Balances/stock are
  derived (`SUM(amount)`, `snapshot + SUM(delta)`); concurrent offline devices
  merge as `100 +20 −5 = 115`. No UPDATE/DELETE paths for financial rows
  (server triggers abort them; client has no edit API for them).
- **Corrections:** reversal + replacement entries (`REVERSE_TRANSACTION`,
  `CORRECT_TRANSACTION`), same rules as server (`ALREADY_REVERSED` is permanent
  and surfaced, never auto-retried).
- **Catalog:** server-authoritative snapshot; clients never edit it offline, so
  no merge exists by construction.
- **Unresolvable:** `FAILED` ops are preserved with error codes and shown in the
  Sync screen with per-op retry; nothing is auto-deleted or silently dropped.
- **Key reuse with changed payload** (`IDEMPOTENCY_KEY_REUSE`) = permanent bug
  signal, surfaced, never retried automatically.

## 8. Authentication strategy

- Native login reuses the **existing** NextAuth credentials flow (no new auth
  system): `GET csrf` → form-POST `callback/credentials` with `json=true` →
  persist `next-auth.session-token` (+ `__Secure-` variant on https) in
  EncryptedSharedPreferences-backed CookieJar (Keystore) → `GET session` for
  profile/role. **No passwords stored, ever.**
- Role gate: sync/catalog/insights need OWNER perms; a CASHIER/CUSTOMER login
  succeeds at session level but sync 403s → app shows an honest "owner account
  required" state (no fake data).
- Offline continuation: cached profile + cookie allow full offline use; first
  login and explicit re-auth are online-only (documented; impossible otherwise).
- Expiry/revocation: 401 → ops stay pending, banner `auth-required` → login
  screen; logout wipes cookie + profile (local business data retained per
  device-owner policy, documented).

## 9. Backend additions (minimal, additive, existing patterns only)

1. **Migration `009_stock_movement`** (`prisma/agent-migrations/`, up/down):
   `StockMovement` (id UUID PK, scopeId, ingredientId, delta REAL ≠0, reason,
   occurredAt, deviceId UUID, idempotencyKey, serverSequence INT NULL,
   serverReceivedAt, createdAt; unique (scope,idempotencyKey),
   (scope,serverSequence); immutability triggers like `008`).
2. **Prisma model** `StockMovement` + relation-safe index (ingredientId).
3. **`src/lib/stock/service.ts`** (mirrors `ledger/service.ts`): op
   `RECORD_MOVEMENT` / entity `stock_movement`; validation reuses
   `adjustInventory` rules (reason 3–300 chars, finite non-zero delta, negative
   delta only with explicit flag, ingredient exists+active, resulting stock ≥0);
   applies **additively** to `Ingredient.stockQuantity` in the same DB
   transaction; per-scope `serverSequence` from a shared `nextSequence`
   (ledger + stock share one monotonic per-scope sequence so ONE cursor stays
   total-ordered — simpler for clients, matches "single authoritative order").
   With a shared sequence, `pull` returns both change kinds ordered by sequence
   and the web ledger client is unaffected (it filters `entry` kinds… actually
   current pull returns ledger rows only; extension adds `kind` field per change
   and `stock_changes` stays empty for old clients — backward compatible).
4. **Push route**: accept `entity_type: stock_movement` + `RECORD_MOVEMENT`
   (same batch, same receipt table, same request-hash/idempotency logic —
   `SyncOperation` already generic).
5. **Pull route**: `after`/`take` unchanged; each change gains
   `kind: ledger_entry|stock_movement`; ledger shape unchanged; movements shaped
   like ledger rows. `next_cursor` = max sequence. Status route also reports
   movement counts (additive fields only).
6. **`GET /api/sync/catalog`** (`finance.view`): versioned snapshot
   `{version, serverTime, categories, products(+coffeeLines), ingredients,
   staff(active), tables}`. Version = max(updatedAt) ms. Client replaces
   snapshot when version differs.
7. **Tests** (Vitest, disposable-SQLite pattern from
   `ledger/service.test.ts`): movement create/replay/validation/negative-stock
   rejection/concurrent same-key/multi-device additive merge/shared-sequence
   pull ordering/catalog snapshot+version.
8. **`env.example`**: document `AGENT_CAFE_ID` requirement for sync (already a
   commented var — extend the comment). No production code-path changes.

## 10. Offline-supported features (matrix)

| Feature | Offline | Notes |
|---|---|---|
| Login (first time) | ONLINE-ONLY | needs server password check |
| Session continuation | OFFLINE | cached profile + cookie |
| Dashboard (revenue, counts, balance) | OFFLINE | derived from local ledger mirror; shows `Last synced …` |
| Record sale takings / expense / cancellation posting | QUEUED | ledger op → instant local row → auto-push |
| Reverse / correct a posting | QUEUED | reversal semantics; `ALREADY_REVERSED` surfaced |
| Record purchase / usage / stock adjustment | QUEUED | `RECORD_MOVEMENT` additive |
| Browse catalog, inventory levels, history | OFFLINE | snapshot + local movements; staleness labeled |
| Adjust UI settings, server URL | OFFLINE | local only |
| View cached AI insights | OFFLINE | pulled when online; labeled with fetch time |
| Regenerate insights / AI chat | ONLINE-ONLY | honest "requires connection" state, no fake results |
| Customer checkout, QR table flow, imports, user admin, catalog edits | ONLINE-ONLY / not in app | outside the owner-offline scope by design |
| Sync queue screen (pending/failed, retry, last sync) | OFFLINE | reads Room outbox |

## 11. AI behavior

Cached `AIInsight` rows only; regenerate is an explicit online action with a
pending→result flow and no local fabrication. No AI SDK on device; no prompt or
key material stored. (No AI path writes to the ledger — holds by construction.)

## 12. Security considerations

Keystore-backed EncryptedSharedPreferences for session cookie; no passwords /
tokens in logs (OkHttp logging interceptor BODY only in debug builds; release
uses NONE + R8); HTTPS-only production URL (cleartext permitted only for
http:// LAN dev, user-configurable with warning); no secrets in APK
(`local.properties`/`BuildConfig` server URL is user-editable at runtime);
release build `minifyEnabled`, `debuggable false`; Room file has MODE_PRIVATE;
sensitive fields excluded from logcat; logout wipes credentials.

## 13. Migration considerations

- Backend: additive SQL only (`009`, up/down verified like `008`); `prisma db
  push` picks up the model; no data migration (new tables empty); old web
  clients ignore new pull fields.
- Android v1: fresh install, no Room migration needed (v1 schema). Future
  entity additions = new Room entities + outbox `entityType` + pull `kind`.
- Capacitor `android/` app, CI, `build-android.sh` untouched.

## 14. Testing strategy

- Backend (Vitest, existing disposable-SQLite harness): stock service unit tests
  + push/pull/catalog route tests.
- `android-app:core` (pure JVM, JUnit5, no SDK): outbox engine tests ported from
  `ledger-outbox.test.ts` semantics (offline retention, backoff+same-key,
  permanent retention, 401, lost-response replay, crash recovery, two-device
  merge, malformed-pull cursor safety, large queue), backoff math, money/stock
  derivation, validation.
- `android-app:app` (Robolectric + MockWebServer on JVM): DAO tests (Room
  in-memory), Retrofit client tests (push/pull/catalog/auth cookie flow,
  401/409/422/429/500 mapping), repository transaction tests (sale creates
  entry+op atomically; crash mid-write leaves no partial state — tested via
  failing DAO injection), worker scheduling test (WorkManager TestDriver).
- Manual UI test script (Phase 21): airplane-mode create → kill → reopen →
  online → server contains row (also encoded as a MockWebServer scenario test).

## 15. Implementation phases

1. Plan (this doc) 2. Backend `009` + services + routes + tests 3. `android-app`
   scaffold (`core`+`app`, versions catalog) 4. Room schema + DAOs 5. Retrofit
   API + cookie auth + secure stores 6. Repositories (Room-first writes in
   transactions) 7. Outbox + engine + WorkManager 8. Pull (ledger/stock/catalog/
   insights) 9. Compose UI (login, dashboard, record flows, inventory, catalog,
   sync, settings, connectivity badge) 10. Tests 11. CI workflow for native app
   12. `docs/android-offline-first.md` + audit.
