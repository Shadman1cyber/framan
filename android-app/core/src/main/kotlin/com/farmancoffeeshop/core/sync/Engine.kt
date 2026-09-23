package com.farmancoffeeshop.core.sync

/**
 * Network boundary for the sync engine. :app implements this with Retrofit;
 * tests use fakes. Throw [SyncTransportError] for retryable transport
 * failures and [SyncAuthError] for HTTP 401.
 */
interface SyncApi {
    suspend fun push(deviceId: String, operations: List<PushOperation>): PushResponse
    suspend fun pull(after: Long, take: Int): PullResponse
}

data class EngineDeps(
    val isOnline: suspend () -> Boolean,
    val nowMs: () -> Long = System::currentTimeMillis,
    val rand: () -> Double = Math::random,
    val batchSize: Int = MAX_BATCH,
    val pullTake: Int = PULL_TAKE,
)

/**
 * Single push→pull pass. Ports `runLedgerSync` from
 * src/lib/offline/ledger-outbox.ts with identical per-result semantics:
 *
 * - applied → op removed (SYNCED)
 * - rejected+retryable → PENDING with backoff
 * - rejected permanent → FAILED, retained with error (never deleted)
 * - missing from batch response → retryable
 * - transport throw → whole batch retryable with backoff
 * - auth throw → attempts untouched, `authRequired`, stop
 * - pull is attempted even when push failed; malformed pull never moves cursor
 *
 * Re-entrant and idempotent: replaying the same outbox state converges.
 */
suspend fun runSync(
    store: SyncStore,
    api: SyncApi,
    deviceId: String,
    deps: EngineDeps,
): SyncSummary {
    val now = deps.nowMs
    val rand = deps.rand
    var summary = SyncSummary(cursor = store.getCursor())
    if (!deps.isOnline()) return summary

    val due = store.listDue(now(), deps.batchSize)
    if (due.isNotEmpty()) {
        val keys = due.map { it.idempotencyKey }
        store.markProcessing(keys)
        val results: List<PushResultItem>
        try {
            val res = api.push(deviceId, due.map { it.toPush() })
            results = res.results
        } catch (e: SyncAuthError) {
            for (k in keys) store.markPending(listOf(k), "authentication required")
            return summary.copy(authRequired = true, error = "authentication required")
        } catch (e: Exception) {
            val delay = computeRetryDelayMs((due.firstOrNull()?.attemptCount ?: 0) + 1, rand)
            val msg = e.message ?: "network error"
            for (k in keys) store.markRetryable(k, msg, now() + delay)
            return summary.copy(error = msg)
        }
        summary = summary.copy(pushed = due.size)
        val seen = HashSet<String>()
        val acked = ArrayList<SyncedOp>()
        for (r in results) {
            seen.add(r.operationId)
            val op = due.firstOrNull { it.operationId == r.operationId } ?: continue
            when (r) {
                is PushApplied -> {
                    acked.add(SyncedOp(op.idempotencyKey, r.serverSequence, r.duplicate))
                    summary = summary.copy(synced = summary.synced + 1)
                }
                is PushRejected -> {
                    val detail = listOf(r.code, r.message).filterNotNull().filter { it.isNotBlank() }.joinToString(": ")
                    if (r.retryable) {
                        val delay = computeRetryDelayMs(op.attemptCount + 1, rand)
                        store.markRetryable(op.idempotencyKey, detail, now() + delay)
                    } else {
                        store.markFailed(op.idempotencyKey, detail)
                        summary = summary.copy(failed = summary.failed + 1)
                    }
                }
            }
        }
        for (op in due) {
            if (op.operationId in seen) continue
            val delay = computeRetryDelayMs(op.attemptCount + 1, rand)
            store.markRetryable(op.idempotencyKey, "missing from server response", now() + delay)
        }
        if (acked.isNotEmpty()) store.markSynced(acked)
    }

    try {
        val pull = api.pull(summary.cursor, deps.pullTake)
        summary = summary.copy(cursor = store.applyPulled(pull.changes, pull.nextCursor), pulled = pull.changes.size)
    } catch (e: SyncAuthError) {
        summary = summary.copy(authRequired = true, error = summary.error ?: "authentication required")
    } catch (e: Exception) {
        summary = summary.copy(error = summary.error ?: (e.message ?: "sync error"))
    }
    return summary
}
