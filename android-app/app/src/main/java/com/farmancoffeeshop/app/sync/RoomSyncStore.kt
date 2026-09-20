package com.farmancoffeeshop.app.sync

import androidx.room.withTransaction
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.OpStatus
import com.farmancoffeeshop.app.data.local.RowState
import com.farmancoffeeshop.app.data.local.SyncMetaEntity
import com.farmancoffeeshop.app.data.local.SyncOperationEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.core.sync.ChangeKind
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.NewOperation
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.OutboxOp
import com.farmancoffeeshop.core.sync.OutboxStatus
import com.farmancoffeeshop.core.sync.PulledChange
import com.farmancoffeeshop.core.sync.SyncedOp
import com.farmancoffeeshop.core.sync.SyncStore
import com.farmancoffeeshop.core.sync.normalizeNumbers
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import kotlin.math.max

/**
 * Core SyncStore over Room. Every multi-row mutation runs in a Room
 * transaction: pulled rows and the cursor commit atomically (cursor safety),
 * and local writes bundle the domain row + its outbox op (crash safety).
 */
class RoomSyncStore(
    private val db: FarmanDatabase,
    moshi: Moshi,
) : SyncStore {
    private val ops = db.syncOperations()
    private val meta = db.syncMeta()
    private val ledger = db.ledger()
    private val stock = db.stock()

    @Suppress("UNCHECKED_CAST")
    private val payloadAdapter =
        moshi.adapter<Map<String, Any?>>(
            Types.newParameterizedType(Map::class.java, String::class.java, Any::class.java),
        )

    private fun toOp(e: SyncOperationEntity): OutboxOp = OutboxOp(
        operationId = e.operationId,
        idempotencyKey = e.idempotencyKey,
        entityType = e.entityType,
        entityId = e.entityId,
        operationType = e.operationType,
        // Restore integral numbers (ledger amounts) lost to Double by the
        // untyped JSON round-trip — see core normalizeNumbers.
        payload = normalizeNumbers(payloadAdapter.fromJson(e.payloadJson)) as? Map<String, Any?>
            ?: emptyMap(),
        clientTimestamp = e.clientTimestamp,
        deviceId = e.deviceId,
        status = when (e.status) {
            OpStatus.FAILED -> OutboxStatus.FAILED
            OpStatus.PROCESSING -> OutboxStatus.PROCESSING
            else -> OutboxStatus.PENDING
        },
        attemptCount = e.attemptCount,
        lastError = e.lastError,
        nextRetryAtMs = e.nextRetryAtMs,
        createdAtMs = e.createdAtMs,
    )

    /** Enqueue + domain-row insert must happen in ONE transaction (see repositories). */
    suspend fun insertOp(op: NewOperation, nowMs: Long) {
        ops.insertIgnore(
            SyncOperationEntity(
                idempotencyKey = op.idempotencyKey,
                operationId = op.operationId,
                entityType = op.entityType,
                entityId = op.entityId,
                operationType = op.operationType,
                payloadJson = payloadAdapter.toJson(op.payload),
                clientTimestamp = op.clientTimestamp,
                deviceId = op.deviceId,
                createdAtMs = nowMs,
            ),
        )
    }

    override suspend fun enqueue(op: NewOperation, nowMs: Long): OutboxOp {
        // Atomic check-then-insert: concurrent identical enqueues converge on
        // one row instead of racing on the UNIQUE key.
        return db.withTransaction {
            val existing = ops.getByKey(op.idempotencyKey)
            if (existing != null) {
                toOp(existing)
            } else {
                insertOp(op, nowMs)
                toOp(ops.getByKey(op.idempotencyKey)!!)
            }
        }
    }

    override suspend fun listDue(nowMs: Long, limit: Int): List<OutboxOp> =
        ops.listDue(nowMs, limit).map(::toOp)

    override suspend fun markProcessing(keys: List<String>) {
        if (keys.isNotEmpty()) ops.markProcessing(keys)
    }

    override suspend fun markPending(keys: List<String>, error: String) {
        if (keys.isNotEmpty()) ops.markPending(keys, error)
    }

    override suspend fun markSynced(synced: List<SyncedOp>) {
        if (synced.isEmpty()) return
        val receivedAt = TimeUtil.nowIso()
        db.withTransaction {
            val keys = synced.map { it.key }
            val opByKey = ops.getByKeys(keys).associateBy { it.idempotencyKey }
            ops.deleteByKeys(keys)
            for (s in synced) {
                val op = opByKey[s.key]
                val isLedger = op?.entityType == EntityTypes.LEDGER_ENTRY
                when (op?.operationType) {
                    OperationTypes.REVERSE_TRANSACTION -> {
                        // Provisional reversal: adopt the sequence for ordering
                        // but stay PENDING — the server-minted row (different
                        // id) replaces it on pull.
                        if (isLedger) ledger.adoptSequenceByKey(s.key, s.serverSequence, receivedAt)
                    }
                    OperationTypes.CORRECT_TRANSACTION -> {
                        // Replacement row shares the client id: stamp SYNCED
                        // by id. The provisional reversal stays PENDING for
                        // pull replacement (see above).
                        if (isLedger && op != null) {
                            ledger.markSyncedById(op.entityId, s.serverSequence, receivedAt)
                        }
                    }
                    else -> {
                        // Stamp the local row by idempotency key. Pulled rows
                        // carry a null key and are never touched here.
                        if (ledger.markSyncedByKey(s.key, s.serverSequence, receivedAt) == 0) {
                            stock.markSyncedByKey(s.key, s.serverSequence, receivedAt)
                        }
                    }
                }
            }
        }
    }

    override suspend fun markRetryable(key: String, error: String, nextRetryAtMs: Long) {
        ops.markRetryable(key, error, nextRetryAtMs)
    }

    override suspend fun markFailed(key: String, error: String) {
        db.withTransaction {
            val op = ops.getByKey(key)
            ops.markFailed(key, error)
            // Provisional rows of an unconfirmed reversal/correction never
            // happened server-side: drop them so balances stay honest. The
            // FAILED op itself is retained for inspection/manual retry.
            if (op?.entityType == EntityTypes.LEDGER_ENTRY) {
                when (op.operationType) {
                    OperationTypes.REVERSE_TRANSACTION ->
                        ledger.deleteProvisionalByKey(key)
                    OperationTypes.CORRECT_TRANSACTION -> {
                        ledger.deleteProvisionalByKey("$key:reversal")
                        ledger.deleteProvisionalByKey("$key:correction")
                    }
                }
            }
        }
    }

    override suspend fun retryFailed(key: String): Boolean = ops.retryFailed(key) > 0

    override suspend fun resetProcessing(): Int = ops.resetProcessing()

    override suspend fun countPending(): Int = ops.countPending()

    override suspend fun listFailed(): List<OutboxOp> = ops.listFailed().map(::toOp)

    override suspend fun getCursor(): Long = meta.get(MetaKeys.LEDGER_CURSOR)?.toLongOrNull() ?: 0L

    /**
     * Merge pulled changes + advance the cursor atomically. Sequence guard:
     * a pulled row only overwrites a local row when its sequence is newer,
     * and PENDING local rows keep their state (their op still owns them) while
     * adopting the server sequence/receipt fields.
     */
    override suspend fun applyPulled(changes: List<PulledChange>, nextCursor: Long): Long {
        db.withTransaction {
            for (c in changes) {
                when (c.kind) {
                    ChangeKind.LEDGER_ENTRY -> {
                        val incoming = ledgerEntityOf(c) ?: continue
                        val prev = ledger.getById(incoming.id)
                        if (prev == null || (incoming.serverSequence ?: -1) >= (prev.serverSequence ?: -1)) {
                            ledger.upsert(
                                if (prev != null && prev.localState == RowState.PENDING) {
                                    incoming.copy(
                                        localState = RowState.PENDING,
                                        idempotencyKey = prev.idempotencyKey,
                                    )
                                } else {
                                    incoming
                                },
                            )
                        }
                        if (incoming.entryType == "REVERSAL" && incoming.reversalOf != null) {
                            ledger.deleteProvisionalReversals(incoming.reversalOf, incoming.id)
                        }
                    }
                    ChangeKind.STOCK_MOVEMENT -> {
                        val incoming = stockEntityOf(c) ?: continue
                        val prev = stock.getById(incoming.id)
                        if (prev == null || (incoming.serverSequence ?: -1) >= (prev.serverSequence ?: -1)) {
                            stock.upsert(
                                if (prev != null && prev.localState == RowState.PENDING) {
                                    incoming.copy(
                                        localState = RowState.PENDING,
                                        idempotencyKey = prev.idempotencyKey,
                                    )
                                } else {
                                    incoming
                                },
                            )
                        }
                    }
                }
            }
            val cur = meta.get(MetaKeys.LEDGER_CURSOR)?.toLongOrNull() ?: 0L
            val next = max(cur, nextCursor)
            meta.put(SyncMetaEntity(MetaKeys.LEDGER_CURSOR, next.toString()))
        }
        return getCursor()
    }
}
