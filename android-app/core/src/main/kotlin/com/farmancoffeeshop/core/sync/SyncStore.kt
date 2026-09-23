package com.farmancoffeeshop.core.sync

/**
 * Durable outbox contract. Room implements this in :app
 * (SyncOperationDao + meta table); tests use [MemorySyncStore].
 *
 * Cursor rule: [applyPulled] persists pulled changes and advances the cursor
 * in ONE atomic step — a failure must roll both back together.
 */
interface SyncStore {
    /** Insert; returns the existing row when the idempotency key is already queued. */
    suspend fun enqueue(op: NewOperation, nowMs: Long): OutboxOp

    suspend fun listDue(nowMs: Long, limit: Int): List<OutboxOp>

    suspend fun markProcessing(keys: List<String>)

    /**
     * Return ops to PENDING WITHOUT touching attempt counts (used for 401:
     * the failure is environmental, not the op's fault).
     */
    suspend fun markPending(keys: List<String>, error: String)

    suspend fun markSynced(synced: List<SyncedOp>)

    suspend fun markRetryable(key: String, error: String, nextRetryAtMs: Long)

    suspend fun markFailed(key: String, error: String)

    /** Requeue a permanently-failed op for manual retry. False when not failed. */
    suspend fun retryFailed(key: String): Boolean

    /** Crash recovery: PROCESSING → PENDING. Returns the reset count. */
    suspend fun resetProcessing(): Int

    suspend fun countPending(): Int

    suspend fun listFailed(): List<OutboxOp>

    suspend fun getCursor(): Long

    /** Persist pulled changes + advance cursor atomically. Returns the cursor. */
    suspend fun applyPulled(changes: List<PulledChange>, nextCursor: Long): Long
}

/** An acknowledged op: key identifies the outbox row, sequence stamps the local row. */
data class SyncedOp(val key: String, val serverSequence: Long, val duplicate: Boolean)

data class NewOperation(    val operationId: String = newUuid(),
    val idempotencyKey: String = newUuid(),
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val payload: Map<String, Any?>,
    val clientTimestamp: String,
    val deviceId: String,
)

/** In-memory SyncStore for JVM tests and previews. Not used in production. */
class MemorySyncStore : SyncStore {
    private val ops = LinkedHashMap<String, OutboxOp>()
    private val entries = LinkedHashMap<String, PulledChange>()
    private var cursor: Long = 0L
    private var clock: Long = 0L

    override suspend fun enqueue(op: NewOperation, nowMs: Long): OutboxOp {
        ops[op.idempotencyKey]?.let { return it }
        val record = OutboxOp(
            operationId = op.operationId,
            idempotencyKey = op.idempotencyKey,
            entityType = op.entityType,
            entityId = op.entityId,
            operationType = op.operationType,
            payload = op.payload,
            clientTimestamp = op.clientTimestamp,
            deviceId = op.deviceId,
            createdAtMs = nowMs,
        )
        ops[record.idempotencyKey] = record
        return record
    }

    override suspend fun listDue(nowMs: Long, limit: Int): List<OutboxOp> =
        ops.values
            .filter { it.status == OutboxStatus.PENDING && it.nextRetryAtMs <= nowMs }
            .sortedBy { it.createdAtMs }
            .take(limit)

    override suspend fun markProcessing(keys: List<String>) {
        keys.forEach { k -> ops[k]?.takeIf { it.status == OutboxStatus.PENDING }?.let { ops[k] = it.copy(status = OutboxStatus.PROCESSING) } }
    }

    override suspend fun markPending(keys: List<String>, error: String) {
        keys.forEach { k -> ops[k]?.let { ops[k] = it.copy(status = OutboxStatus.PENDING, lastError = error) } }
    }

    override suspend fun markSynced(synced: List<SyncedOp>) {
        synced.forEach { ops.remove(it.key) }
    }

    override suspend fun markRetryable(key: String, error: String, nextRetryAtMs: Long) {
        ops[key]?.let { ops[key] = it.copy(status = OutboxStatus.PENDING, attemptCount = it.attemptCount + 1, lastError = error, nextRetryAtMs = nextRetryAtMs) }
    }

    override suspend fun markFailed(key: String, error: String) {
        ops[key]?.let { ops[key] = it.copy(status = OutboxStatus.FAILED, attemptCount = it.attemptCount + 1, lastError = error) }
    }

    override suspend fun retryFailed(key: String): Boolean {
        val op = ops[key] ?: return false
        if (op.status != OutboxStatus.FAILED) return false
        ops[key] = op.copy(status = OutboxStatus.PENDING, nextRetryAtMs = 0L)
        return true
    }

    override suspend fun resetProcessing(): Int {
        var n = 0
        ops.forEach { (k, v) -> if (v.status == OutboxStatus.PROCESSING) { ops[k] = v.copy(status = OutboxStatus.PENDING); n++ } }
        return n
    }

    override suspend fun countPending(): Int = ops.values.count { it.status != OutboxStatus.FAILED && it.status != OutboxStatus.SYNCED }

    override suspend fun listFailed(): List<OutboxOp> =
        ops.values.filter { it.status == OutboxStatus.FAILED }.sortedBy { it.createdAtMs }

    override suspend fun getCursor(): Long = cursor

    override suspend fun applyPulled(changes: List<PulledChange>, nextCursor: Long): Long {
        for (c in changes) {
            val prev = entries[c.id]
            if (prev == null || c.serverSequence >= prev.serverSequence) entries[c.id] = c
        }
        if (nextCursor > cursor) cursor = nextCursor
        return cursor
    }

    /** Test helper: mirrored entries in sequence order. */
    fun listedEntries(): List<PulledChange> = entries.values.sortedBy { it.serverSequence }

    fun tick(ms: Long = 1L): Long {
        clock += ms
        return clock
    }
}
