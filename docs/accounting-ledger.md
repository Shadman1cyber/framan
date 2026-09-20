# Accounting Ledger (append-only)

## Principle

Financial transactions are never physically edited or deleted. The ledger is the authoritative record; balances are derived. Corrections append new entries referencing the original.

## Tables (additive migration `008_offline_ledger`)

### `ledger_entries` (immutable)
| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID v4 (client or server generated) |
| scope_id | TEXT | single-cafe scope (env), never client-supplied |
| entry_type | TEXT | `ORDER_COMPLETED` / `ORDER_CANCELLED` / `EXPENSE` / `REVERSAL` / `CORRECTION` |
| reference_type | TEXT | e.g. `order` |
| reference_id | TEXT | e.g. order id |
| reversal_of | TEXT NULL | ledger entry id reversed by this entry |
| amount | INTEGER | signed toman, non-zero, within ±2000000000 (Prisma-Int bound) |
| currency | TEXT | `TOMAN` only |
| occurred_at | TEXT | client timestamp (audit/display) |
| account_id | TEXT | default `cash`; balances derive per `(scope, account)` |
| device_id | TEXT | originating device (diagnostic, never authorization) |
| idempotency_key | TEXT | unique per `(scope_id, idempotency_key)`; correction rows use `:reversal`/`:correction` suffixes |
| server_sequence | INTEGER NULL | assigned server-side at acceptance |
| server_received_at | TEXT NULL | |
| metadata | TEXT | JSON payload snapshot (≤8KB) |
| created_at | TEXT | UTC ISO-8601 |

Indexes: `(scope_id, occurred_at)`, `(scope_id, account_id)`, `(reference_type, reference_id)`.
Unique: `(scope_id, idempotency_key)`, `(scope_id, reversal_of)`, `(scope_id, server_sequence)`.
Immutability: `LedgerEntry_no_update` / `LedgerEntry_no_delete` triggers abort direct SQL mutation (`LEDGER_IMMUTABLE`); same pattern guards `SyncOperation` receipts.

### `sync_operations` (outbox + idempotency, server side)
Fields: `id` (operation_id, UUID), `scope_id`, `idempotency_key` (unique with scope), `entity_type`, `entity_id`, `operation_type`, `payload` (JSON), `request_hash` (sha256 of canonical request), `created_by` (authenticated user id), `status` (`applied`), `result` (JSON), `server_sequence`, `device_id`, `client_timestamp`, `created_at`, `updated_at`.
Unique: `(scope_id, idempotency_key)`. A reused key with a different `request_hash` is rejected (`IDEMPOTENCY_KEY_REUSE`, 409, non-retryable); an exact replay returns the original result.

### `sync_devices`
`id` (device UUID), `scope_id`, `last_seen_at`, `user_agent`. A device may not impersonate another; device_id is recorded for diagnostics, not authorization.

## Operation types

- `CREATE_TRANSACTION` — append a new entry.
- `REVERSE_TRANSACTION` — append a compensating entry (`reversal_of`) mirroring the original's account/currency/reference with negated amount. Reversing the same original twice is rejected (`ALREADY_REVERSED`, 409); an exact full-operation replay via idempotency key returns the original result.
- `CORRECT_TRANSACTION` — atomically appends the reversal entry plus a validated `CORRECTION` replacement (same account/currency as the original) with two consecutive sequences; e.g. +100 → −100 → +120 yields 120 and the original row is untouched.

## Invariants (server-enforced)

- `sum(amount)` per `(scope, account)` is the authoritative balance (derived; no materialized client-writable balance).
- A reversal must reference an existing entry in the same scope; an entry can be reversed at most once.
- Amounts are non-zero integers within ±2000000000; currency is `TOMAN`.
- `scope_id` is bound server-side to the authenticated single-cafe scope; clients cannot cross scopes.
- Entries are immutable: no UPDATE/DELETE code paths exist for financial rows.

## Derivations

- Account/order balances: aggregate ledger by `reference_id` (or metadata key), never store mutable totals.
- Revenue reports must state their basis (`COMPLETED` postings) as in `src/lib/reporting.ts`.

## Non-financial data

Products, profiles, settings, table state remain mutable and are out of scope for append-only enforcement. Stock movements are future append-only work (metadata stays mutable).
