# Android Offline-First App

Native Kotlin app for café owners/managers that keeps working with **zero
connectivity**. Room is the UI source of truth; every write lands locally
first and syncs automatically when the network returns. Plan:
`docs/android-offline-first-plan.md`. Protocol: `docs/sync-protocol.md` (v1.1).

## Architecture

```
Compose UI → ViewModel → Repository → Room (Flow)
                                     ↘ SyncRunner → WorkManager → Retrofit → /api/sync/*
```

- `android-app/core/` — pure Kotlin/JVM: protocol types, outbox state machine
  (`runSync`, a port of the web `runLedgerSync` semantics), backoff, conflict
  policy, derivation math, validation. 32 JUnit5 tests, no Android SDK needed.
- `android-app/app/` — Room, Retrofit/OkHttp/Moshi, DataStore +
  EncryptedSharedPreferences (Keystore), WorkManager, Compose Material3 (RTL).
  Manual DI via `AppContainer` (no Hilt); UI never touches Retrofit.

The existing Capacitor `android/` shell, its CI and `build-android.sh` are
untouched; the native app lives in `android-app/` with its own workflow
(`build-android-native.yml`).

## Local database (`FarmanDatabase`, v1)

Server ids are primary keys (no parallel id space):

| Table | Content |
|---|---|
| `ledger_entries` | ledger mirror + pending postings (`localState` PENDING/SYNCED, `idempotencyKey`) |
| `stock_movements` | movement mirror + pending deltas |
| `products/categories/coffee_lines/product_coffee_lines/ingredients/staff/tables` | server snapshot (wholesale replace on version change) |
| `ai_insights` | cached insights |
| `user_profile` | cached session profile (never credentials) |
| `sync_operations` | durable outbox keyed by idempotency key |
| `sync_meta` | cursors, catalog version, device id, last-sync bookkeeping |

Balances and stock levels are **derived queries** (`SUM`), never stored.

## Sync engine

- Outbox drain FIFO (batches ≤20) → `POST /api/sync/push` with a stable
  `device_id`. Per-result handling: applied → row stamped SYNCED (+sequence);
  retryable → backoff (1s→60s ±25% jitter, same schedule as web);
  permanent → FAILED retained with code; missing → retryable; transport throw →
  whole batch retryable; **401 → attempts untouched, `auth-required` flag**.
- Pull per shared cursor (`GET /api/sync/pull`), upsert + cursor advance in
  ONE Room transaction. Then catalog snapshot when due (version compare,
  single-transaction replace), then cached insights.
- `SyncWorker` (unique work, `NetworkType.CONNECTED`, exp. backoff, ≤5
  attempts/pass): always re-entrant; duplicate deliveries collapse on
  idempotency keys. Periodic 15-min schedule + manual triggers.
- Crash recovery: `processing→pending` reset at app start; Room transactions
  bundle domain-row + outbox-op writes.

## Conflict resolution

Money and stock are **append-only + additive**: balances derive
(`100 +20 −5 = 115`), never last-write-wins. Corrections are reversal +
replacement rows (`ALREADY_REVERSED` surfaces permanently). Provisional local
reversal rows are replaced by server-minted rows on pull (matched by
`reversalOf`); permanently-failed reversal/correction provisionals are dropped
(they never happened) while the FAILED op stays visible. Catalog is
server-authoritative snapshot-replace (no merge exists). Nothing is silently
deleted: failed ops persist with error + manual retry.

One wire subtlety: outbox payloads round-trip through untyped JSON where every
number decodes as Double. `normalizeNumbers` restores integral Doubles to Long
before pushing — the server validates amounts with `isSafeInteger` but Prisma
rejects non-integers for Int columns, so `50000.0` on the wire would 500-loop.
Covered by `NumbersTest`.

## Authentication

Reuses NextAuth credentials flow (no new auth): CSRF → form POST
`callback/credentials` (`json=true`) → session cookie in the
Keystore-backed jar → `/api/auth/session` profile. Passwords never stored.
First login is online-only; afterwards full offline continuation. 401 keeps
ops pending and prompts re-login. Sync/catalog/insights require OWNER
(`finance.view`); cashier/customer sessions get an honest "owner account
required" state. Logout wipes cookie + profile.

## Offline matrix

| Feature | Mode |
|---|---|
| Login (first), AI regenerate, catalog edits, checkout, imports, user admin | online-only / not in app |
| Session continuation, dashboard, catalog/inventory browse, history, cached insights, settings, queue screen | offline (local), staleness labeled |
| Sale/expense/cancellation posting, reversal, correction, stock movement | queued (instant local, auto-push) |

AI: cached insights only; regeneration is an explicit online action. The app
never fabricates results.

## API changes (all additive, existing patterns)

- Migration `009_stock_movement` + `StockMovement` model (immutable rows,
  scoped idempotency/sequence uniqueness, `STOCK_IMMUTABLE` triggers).
- `RECORD_MOVEMENT` / `stock_movement` in push (same receipts/idempotency),
  shared per-scope sequence so one pull cursor stays total-ordered.
- Pull changes gain `kind`; `GET /api/sync/catalog` versioned snapshot;
  `status` gains `movement_count`. `docs/sync-protocol.md` → v1.1.
- Deployment must set `AGENT_CAFE_ID` to the single café id, otherwise sync
  endpoints 403 (pre-existing fail-closed rule, now documented in plan).

## Testing

- Backend: `src/lib/stock/service.test.ts` (7) + `sync-stock.test.ts` (4) on
  disposable SQLite, same harness as the ledger tests.
- `core`: 32 JVM tests (engine semantics ported from `ledger-outbox.test.ts`:
  offline retention, backoff+same-key, permanent retention, 401, lost-response
  replay, crash recovery, two-device merge, malformed-pull safety, missing-op
  safety, batching, mixed kinds; backoff math; derivation; validation).
- `app`: Robolectric + MockWebServer against a protocol-faithful fake server
  (`FakeFarmanServer`, test-only): DAO tests, wire/error-matrix tests, auth
  flow (incl. legacy ADMIN→OWNER, cashier gating), integration (Phase-21
  restart journey, additive merge, provisional replacement, permanent-failure
  retention, 401 handling, stock+catalog+insights), and the REAL `SyncWorker`
  end to end. 26 tests, all passing.
- Manual Phase-21 script: airplane mode → record sale → force-stop → reopen →
  sale present → online → worker syncs → server row exists (also automated).

## Build / release

```bash
cd android-app
./gradlew :core:test :app:testDebugUnitTest :app:lintDebug  # verify
./gradlew :app:assembleDebug                                # installable APK
./gradlew :app:assembleRelease                              # R8, no debug logs
```

Toolchain: AGP 8.7.3, Kotlin 2.0.21, Gradle 8.11.1, compile/target 35,
minSdk 24, JDK 21 (matches CI). `FARMAN_BUILD_TOOLS` overrides build-tools
(default 34.0.0). Release uses the upload keystore when
`ANDROID_KEYSTORE_*` env is present, else debug-signed (installable, not for
Play). Server URL defaults to the production backend and is user-editable in
Settings/Login (https enforced except loopback/LAN).

## Adding a new offline-capable entity

1. If it is financial/stock-like: extend the server ledger pattern
   (append-only table + op type + pull `kind`), following `009` + `stock/`.
   If it is reference data: add it to `GET /api/sync/catalog`.
2. Add the Room entity + DAO (server id = primary key, sync metadata).
3. Mutable-by-client rows: write domain-row + outbox-op in one Room
   transaction via `RoomSyncStore.insertOp`; map the op in `toDto`/engine.
4. Server-authoritative rows: include in catalog replace.
5. Add core engine cases if new retry semantics apply (default: reuse).
6. Tests: DAO test + fake-server round-trip (push→pull→cursor) + failure
   retention. Update the matrix above.
