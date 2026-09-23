package com.farmancoffeeshop.core.sync

import java.util.UUID

/** Stable UUID v4 generation — keys are created once at enqueue time and replayed verbatim. */
fun newUuid(): String = UUID.randomUUID().toString()

private val UUID_RE =
    Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

fun isUuid(value: String): Boolean = UUID_RE.matches(value)

/** Entity types accepted by POST /api/sync/push (protocol v1.1). */
object EntityTypes {
    const val LEDGER_ENTRY = "ledger_entry"
    const val STOCK_MOVEMENT = "stock_movement"
}

/** Operation types accepted by POST /api/sync/push (protocol v1.1). */
object OperationTypes {
    const val CREATE_TRANSACTION = "CREATE_TRANSACTION"
    const val REVERSE_TRANSACTION = "REVERSE_TRANSACTION"
    const val CORRECT_TRANSACTION = "CORRECT_TRANSACTION"
    const val RECORD_MOVEMENT = "RECORD_MOVEMENT"
}

/** Ledger entry types (server: LEDGER_ENTRY_TYPES). */
object LedgerEntryTypes {
    const val ORDER_COMPLETED = "ORDER_COMPLETED"
    const val ORDER_CANCELLED = "ORDER_CANCELLED"
    const val EXPENSE = "EXPENSE"
    const val REVERSAL = "REVERSAL"
    const val CORRECTION = "CORRECTION"

    val all: Set<String> = setOf(ORDER_COMPLETED, ORDER_CANCELLED, EXPENSE, REVERSAL, CORRECTION)
}

/** Pull change kinds (protocol v1.1 `kind` field). */
enum class ChangeKind(val wire: String) {
    LEDGER_ENTRY("ledger_entry"),
    STOCK_MOVEMENT("stock_movement"),
    ;

    companion object {
        fun fromWire(wire: String?): ChangeKind? = entries.firstOrNull { it.wire == wire }
    }
}

const val CURRENCY_TOMAN = "TOMAN"

/** One queued mutation. The idempotency key is the dedupe identity everywhere. */
data class OutboxOp(
    val operationId: String,
    val idempotencyKey: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val payload: Map<String, Any?>,
    val clientTimestamp: String,
    val deviceId: String,
    val status: OutboxStatus = OutboxStatus.PENDING,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val nextRetryAtMs: Long = 0L,
    val createdAtMs: Long = 0L,
)

enum class OutboxStatus { PENDING, PROCESSING, FAILED, SYNCED }

/** A push operation as sent on the wire. */
data class PushOperation(
    val operationId: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val payload: Map<String, Any?>,
    val idempotencyKey: String,
    val clientTimestamp: String,
)

fun OutboxOp.toPush(): PushOperation = PushOperation(
    operationId = operationId,
    entityType = entityType,
    entityId = entityId,
    operationType = operationType,
    payload = payload,
    idempotencyKey = idempotencyKey,
    clientTimestamp = clientTimestamp,
)

sealed interface PushResultItem {
    val operationId: String
}

data class PushApplied(
    override val operationId: String,
    val serverSequence: Long,
    val entityId: String,
    val duplicate: Boolean = false,
) : PushResultItem

data class PushRejected(
    override val operationId: String,
    val code: String,
    val retryable: Boolean,
    val message: String? = null,
) : PushResultItem

data class PushResponse(val results: List<PushResultItem>)

data class PulledChange(
    val kind: ChangeKind,
    val id: String,
    val serverSequence: Long,
    val data: Map<String, Any?> = emptyMap(),
)

data class PullResponse(val changes: List<PulledChange>, val nextCursor: Long)

data class SyncSummary(
    val pushed: Int = 0,
    val synced: Int = 0,
    val failed: Int = 0,
    val pulled: Int = 0,
    val cursor: Long = 0L,
    val authRequired: Boolean = false,
    val error: String? = null,
)

/** Transport-level failure: always retryable with backoff. */
class SyncTransportError(message: String, cause: Throwable? = null) : Exception(message, cause)

/** HTTP 401: ops stay pending with attempts untouched; UI must prompt re-login. */
class SyncAuthError(message: String = "authentication required") : Exception(message)
