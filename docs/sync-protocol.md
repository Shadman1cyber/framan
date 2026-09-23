# Sync Protocol (v1.1)

## Endpoints

- `POST /api/sync/push` — batch push of pending operations.
- `GET /api/sync/pull?after=<server_sequence>` — pull remote changes after cursor.
- `GET /api/sync/status` — engine/server status (cursor, counts).
- `GET /api/sync/catalog` — versioned reference-data snapshot (v1.1).

## Push

Request: (v1 shape unchanged)
```json
{
  "device_id": "uuid",
  "operations": [
    {
      "operation_id": "uuid",
      "entity_type": "ledger_entry",
      "entity_id": "uuid",
      "operation_type": "CREATE_TRANSACTION",
      "payload": { "entry": { ... } },
      "idempotency_key": "uuid",
      "client_timestamp": "2026-09-17T10:00:00.000Z"
    }
  ]
}
```

Response (operation-level, never batch-level failure):
```json
{
  "results": [
    { "operation_id": "...", "status": "applied", "server_sequence": 5001 }
  ]
}
```
Statuses: `applied` (exact replay adds `duplicate: true` and returns the original `server_sequence`), `rejected` (with `code`). Key reuse with a changed request is rejected as `IDEMPOTENCY_KEY_REUSE` (409, non-retryable).

Since v1.1 a push batch may mix entity types. Applied results always carry
`entity_id` (the created row id); ledger results additionally keep the v1
`entry_id` alias. Receipts written by v1 (`{entryId,…}`) still replay.

### v1.1 entity: `stock_movement` / `RECORD_MOVEMENT`

Payload: `{ "movement": { "id": uuid, "ingredientId": "...", "delta": 20,
"reason": "…", "occurredAt": "ISO-8601", "deviceId": uuid,
"allowNegative": true } }`. Rules mirror the online adjust path: finite
non-zero delta, reason 3–300 chars, negative deltas need the explicit flag,
ingredient must exist and be active, resulting stock ≥ 0. The movement row and
the additive `Ingredient.stockQuantity` update commit atomically; the operation
returns `{ movementId, serverSequence, ingredientId, delta, after }`.

## Pull

`GET /api/sync/pull?after=1004` →
```json
{ "changes": [ ... ], "next_cursor": 1009 }
```
Each change carries `kind: "ledger_entry" | "stock_movement"` (v1 clients
ignore the unknown field; ledger shapes are otherwise unchanged). The cursor is
the server-assigned monotonic `server_sequence`, now **shared across both
kinds** (single authoritative order). Durable; never local timestamps.
`?account=` scopes ledger rows only and omits stock changes.

## Ordering

Server assigns `server_sequence` at acceptance time (single authoritative order). Client timestamps are stored for audit/display only. Multi-device offline creates merge additively (append-only), never last-write-wins.

## Idempotency (server-enforced)

`SyncOperation` unique on `(scopeId, idempotencyKey)`. Replay returns the original result. Key recorded + ledger mutation + sequence assignment commit atomically.

## Retry rules (client)

- Exponential backoff with jitter: 1s, 2s, 4s, 8s … capped at 60s.
- Retryable: network/timeout, 5xx, 429 (backoff; no `Retry-After` header is sent today), unknown failures, ops missing from a batch response.
- Not retryable: validation rejections, `IDEMPOTENCY_KEY_REUSE`, duplicate reversal (`ALREADY_REVERSED`) — retained as `failed` for manual retry/inspection.
- HTTP 401: ops stay `pending` (attempts untouched), engine flags `auth-required`; sync resumes after re-authentication.
- 409 → idempotency/conflict handling (replay returns original result; duplicate reversal rejected as permanent).
- Failed operations are retained with `attempt_count`, `last_error`, `next_retry_at`; never silently deleted.

## Crash recovery

If the server applied an operation but the client died before receiving the response, the client resends the same `idempotency_key`; the server recognizes it and returns the original result (`status: "applied"` with original `server_sequence`). No duplicate financial effect.

## Cursor safety

`last_sync_sequence` advances only inside the same local transaction that persists pulled changes. Any failure rolls the cursor back with the data.

## Catalog snapshot (v1.1)

`GET /api/sync/catalog` (same `finance.view` owner auth + single-cafe scope)
returns a versioned reference snapshot:

```json
{ "version": 1729…, "server_time": "…", "categories": […], "products": […],
  "ingredients": […], "coffee_lines": […], "staff": […], "tables": […] }
```

`version` is `max(updatedAt)` over the snapshotted tables. Clients replace
their local snapshot when `version` differs and never edit these rows offline
(server-authoritative by construction, so no merge exists). `status` additionally
reports `movement_count`.
