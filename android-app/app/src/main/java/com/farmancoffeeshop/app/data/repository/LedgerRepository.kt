package com.farmancoffeeshop.app.data.repository

import androidx.room.withTransaction
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.LedgerEntryEntity
import com.farmancoffeeshop.app.data.local.RowState
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.RoomSyncStore
import com.farmancoffeeshop.core.domain.ValidationResult
import com.farmancoffeeshop.core.domain.validateLedgerEntry
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.LedgerEntryTypes
import com.farmancoffeeshop.core.sync.NewOperation
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.newUuid
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Financial postings, offline-first. Every write bundles the local row and
 * its outbox op in ONE Room transaction: a crash can never leave a row
 * without its op (lost update) or an op without its row (ghost retry).
 *
 * Corrections follow the server model (docs/accounting-ledger.md): reversals
 * and corrections are new rows; ALREADY_REVERSED surfaces as a permanent
 * failure instead of a silent overwrite.
 */
class LedgerRepository(
    private val db: FarmanDatabase,
    private val store: RoomSyncStore,
    private val deviceId: () -> String,
) {
    private val ledger = db.ledger()

    fun observeEntries(): Flow<List<LedgerEntryEntity>> = ledger.observeAll()

    fun observeRecent(limit: Int = 50): Flow<List<LedgerEntryEntity>> = ledger.observeRecent(limit)

    /** Balances derive per account: SUM(amount) — never stored. */
    fun observeBalances(): Flow<Map<String, Long>> = ledger.observeAll().map { rows ->
        rows.groupingBy { it.accountId }.fold(0L) { acc, e -> acc + e.amount }
    }

    fun observeRevenue(): Flow<Long> = ledger.observeAll().map { rows ->
        rows.filter {
            it.entryType == LedgerEntryTypes.ORDER_COMPLETED ||
                it.entryType == LedgerEntryTypes.ORDER_CANCELLED
        }.sumOf { it.amount }
    }

    data class EntryDraft(
        val entryType: String,
        val amountToman: Long,
        val accountId: String = "cash",
        val referenceType: String = "order",
        val referenceId: String? = null,
        val note: String? = null,
    )

    suspend fun recordEntry(draft: EntryDraft): String {
        val id = newUuid()
        val device = deviceId()
        val occurredAt = TimeUtil.nowIso()
        when (val v = validateLedgerEntry(draft.entryType, draft.amountToman, "TOMAN", id, device, TimeUtil.nowMs())) {
            is ValidationResult.Invalid -> throw RepoException.Validation(v.reason)
            ValidationResult.Valid -> Unit
        }
        val key = newUuid()
        val metadata = buildMap<String, Any?> {
            draft.note?.takeIf { it.isNotBlank() }?.let { put("note", it) }
        }
        db.withTransaction {
            ledger.upsert(
                LedgerEntryEntity(
                    id = id,
                    entryType = draft.entryType,
                    referenceType = draft.referenceType,
                    referenceId = draft.referenceId,
                    accountId = draft.accountId,
                    amount = draft.amountToman,
                    currency = "TOMAN",
                    occurredAt = occurredAt,
                    deviceId = device,
                    reversalOf = null,
                    serverSequence = null,
                    serverReceivedAt = null,
                    idempotencyKey = key,
                    localState = RowState.PENDING,
                    createdAtMs = TimeUtil.nowMs(),
                ),
            )
            store.insertOp(
                NewOperation(
                    idempotencyKey = key,
                    entityType = EntityTypes.LEDGER_ENTRY,
                    entityId = id,
                    operationType = OperationTypes.CREATE_TRANSACTION,
                    payload = mapOf(
                        "entry" to mapOf(
                            "id" to id,
                            "entryType" to draft.entryType,
                            "referenceType" to draft.referenceType,
                            "referenceId" to draft.referenceId,
                            "accountId" to draft.accountId,
                            "amount" to draft.amountToman,
                            "currency" to "TOMAN",
                            "occurredAt" to occurredAt,
                            "deviceId" to device,
                            "metadata" to metadata,
                        ),
                    ),
                    clientTimestamp = occurredAt,
                    deviceId = device,
                ),
                TimeUtil.nowMs(),
            )
        }
        return id
    }

    suspend fun recordSale(totalToman: Long, accountId: String = "cash", note: String? = null): String =
        recordEntry(EntryDraft(LedgerEntryTypes.ORDER_COMPLETED, totalToman, accountId, note = note))

    suspend fun recordExpense(amountToman: Long, accountId: String = "cash", note: String? = null): String =
        recordEntry(
            EntryDraft(
                LedgerEntryTypes.EXPENSE,
                -kotlin.math.abs(amountToman),
                accountId,
                referenceType = "expense",
                note = note,
            ),
        )

    /**
     * Queue a reversal. Allowed even when the original is still PENDING: the
     * outbox is FIFO so the server sees the original first; a locally
     * provisional REVERSAL row keeps the balance honest until the pull
     * replaces it with the server-minted row (see deleteProvisionalReversals).
     */
    suspend fun reverseEntry(originalId: String): String {
        val original = ledger.getById(originalId)
            ?: throw RepoException.Validation("اصل تراکنش یافت نشد")
        if (original.entryType == LedgerEntryTypes.REVERSAL) {
            throw RepoException.Validation("سند برگشتی قابل برگشت نیست")
        }
        val device = deviceId()
        val occurredAt = TimeUtil.nowIso()
        val provisionalId = newUuid()
        val key = newUuid()
        db.withTransaction {
            ledger.upsert(
                LedgerEntryEntity(
                    id = provisionalId,
                    entryType = LedgerEntryTypes.REVERSAL,
                    referenceType = original.referenceType,
                    referenceId = original.referenceId,
                    accountId = original.accountId,
                    amount = -original.amount,
                    currency = original.currency,
                    occurredAt = occurredAt,
                    deviceId = device,
                    reversalOf = original.id,
                    serverSequence = null,
                    serverReceivedAt = null,
                    idempotencyKey = key,
                    localState = RowState.PENDING,
                    createdAtMs = TimeUtil.nowMs(),
                ),
            )
            store.insertOp(
                NewOperation(
                    idempotencyKey = key,
                    entityType = EntityTypes.LEDGER_ENTRY,
                    entityId = provisionalId,
                    operationType = OperationTypes.REVERSE_TRANSACTION,
                    payload = mapOf("reversalOf" to original.id, "deviceId" to device),
                    clientTimestamp = occurredAt,
                    deviceId = device,
                ),
                TimeUtil.nowMs(),
            )
        }
        return provisionalId
    }

    /** Reversal + replacement in one queued op (server applies both atomically). */
    suspend fun correctEntry(originalId: String, correctedAmount: Long): String {
        val original = ledger.getById(originalId)
            ?: throw RepoException.Validation("اصل تراکنش یافت نشد")
        val replacementId = newUuid()
        val device = deviceId()
        val occurredAt = TimeUtil.nowIso()
        when (val v = validateLedgerEntry("CORRECTION", correctedAmount, original.currency, replacementId, device, TimeUtil.nowMs())) {
            is ValidationResult.Invalid -> throw RepoException.Validation(v.reason)
            ValidationResult.Valid -> Unit
        }
        if (original.accountId.isBlank()) throw RepoException.Validation("حساب نامعتبر است")
        val key = newUuid()
        val provisionalReversalId = newUuid()
        db.withTransaction {
            ledger.upsert(
                LedgerEntryEntity(
                    id = provisionalReversalId,
                    entryType = LedgerEntryTypes.REVERSAL,
                    referenceType = original.referenceType,
                    referenceId = original.referenceId,
                    accountId = original.accountId,
                    amount = -original.amount,
                    currency = original.currency,
                    occurredAt = occurredAt,
                    deviceId = device,
                    reversalOf = original.id,
                    serverSequence = null,
                    serverReceivedAt = null,
                    idempotencyKey = "$key:reversal",
                    localState = RowState.PENDING,
                    createdAtMs = TimeUtil.nowMs(),
                ),
            )
            ledger.upsert(
                LedgerEntryEntity(
                    id = replacementId,
                    entryType = "CORRECTION",
                    referenceType = original.referenceType,
                    referenceId = original.referenceId,
                    accountId = original.accountId,
                    amount = correctedAmount,
                    currency = original.currency,
                    occurredAt = occurredAt,
                    deviceId = device,
                    reversalOf = null,
                    serverSequence = null,
                    serverReceivedAt = null,
                    idempotencyKey = "$key:correction",
                    localState = RowState.PENDING,
                    createdAtMs = TimeUtil.nowMs(),
                ),
            )
            store.insertOp(
                NewOperation(
                    idempotencyKey = key,
                    entityType = EntityTypes.LEDGER_ENTRY,
                    entityId = replacementId,
                    operationType = OperationTypes.CORRECT_TRANSACTION,
                    payload = mapOf(
                        "reversalOf" to original.id,
                        "deviceId" to device,
                        "entry" to mapOf(
                            "id" to replacementId,
                            "entryType" to "EXPENSE",
                            "referenceType" to original.referenceType,
                            "referenceId" to original.referenceId,
                            "accountId" to original.accountId,
                            "amount" to correctedAmount,
                            "currency" to original.currency,
                            "occurredAt" to occurredAt,
                            "deviceId" to device,
                            "metadata" to mapOf("corrects" to original.id),
                        ),
                    ),
                    clientTimestamp = occurredAt,
                    deviceId = device,
                ),
                TimeUtil.nowMs(),
            )
        }
        return replacementId
    }
}
