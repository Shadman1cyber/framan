package com.farmancoffeeshop.app.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Local sync state of a mirrored row. */
object RowState {
    const val PENDING = "PENDING"
    const val SYNCED = "SYNCED"
}

/** Outbox statuses (mirror core OutboxStatus; SYNCED rows are deleted). */
object OpStatus {
    const val PENDING = "PENDING"
    const val PROCESSING = "PROCESSING"
    const val FAILED = "FAILED"
}

/**
 * Durable client outbox. One row per mutation, keyed by the idempotency key
 * (the dedupe identity on both ends). Survives process death and reboot.
 */
@Entity(tableName = "sync_operations", indices = [Index("status"), Index("createdAtMs")])
data class SyncOperationEntity(
    @PrimaryKey val idempotencyKey: String,
    val operationId: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val payloadJson: String,
    val clientTimestamp: String,
    val deviceId: String,
    val status: String = OpStatus.PENDING,
    val attemptCount: Int = 0,
    val lastError: String? = null,
    val nextRetryAtMs: Long = 0L,
    val createdAtMs: Long,
)

/** Local mirror of a server LedgerEntry + locally-created pending postings. */
@Entity(tableName = "ledger_entries", indices = [Index("serverSequence"), Index("accountId")])
data class LedgerEntryEntity(
    @PrimaryKey val id: String,
    val entryType: String,
    val referenceType: String,
    val referenceId: String?,
    val accountId: String,
    val amount: Long,
    val currency: String,
    val occurredAt: String,
    val deviceId: String,
    val reversalOf: String?,
    val serverSequence: Long?,
    val serverReceivedAt: String?,
    val idempotencyKey: String?,
    val localState: String = RowState.PENDING,
    val createdAtMs: Long,
)

/** Local mirror of a server StockMovement + locally-recorded pending deltas. */
@Entity(
    tableName = "stock_movements",
    indices = [Index("ingredientId"), Index("serverSequence")],
)
data class StockMovementEntity(
    @PrimaryKey val id: String,
    val ingredientId: String,
    val delta: Double,
    val reason: String,
    val occurredAt: String,
    val deviceId: String,
    val serverSequence: Long?,
    val serverReceivedAt: String?,
    val idempotencyKey: String?,
    val localState: String = RowState.PENDING,
    val createdAtMs: Long,
)

/** Server-authoritative snapshot rows (replaced wholesale on version change). */
@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    val slug: String,
    val nameFa: String,
    val nameEn: String?,
    val icon: String?,
    val isActive: Boolean,
    val sortOrder: Int,
)

@Entity(tableName = "products", indices = [Index("categoryId"), Index("isAvailable")])
data class ProductEntity(
    @PrimaryKey val id: String,
    val slug: String,
    val nameFa: String,
    val nameEn: String?,
    val description: String,
    val price: Long,
    val image: String?,
    val categoryId: String,
    val isAvailable: Boolean,
    val isFeatured: Boolean,
    val sortOrder: Int,
    val allergenStatus: String,
    val prepBaseMin: Int,
    val updatedAt: String,
)

@Entity(tableName = "coffee_lines")
data class CoffeeLineEntity(
    @PrimaryKey val id: String,
    val nameFa: String,
    val nameEn: String?,
    val isActive: Boolean,
)

@Entity(tableName = "product_coffee_lines", primaryKeys = ["productId", "coffeeLineId"])
data class ProductCoffeeLineEntity(
    val productId: String,
    val coffeeLineId: String,
    val price: Long,
    val isActive: Boolean,
)

@Entity(tableName = "ingredients")
data class IngredientEntity(
    @PrimaryKey val id: String,
    val nameFa: String,
    val nameEn: String?,
    val unit: String,
    /** Last server snapshot level; live level = snapshot + local deltas. */
    val snapshotQuantity: Double,
    val minQuantity: Double?,
    val costPerUnit: Double?,
    val supplier: String?,
    val isActive: Boolean,
    val updatedAt: String,
)

@Entity(tableName = "staff")
data class StaffEntity(
    @PrimaryKey val id: String,
    val name: String,
    val role: String,
)

@Entity(tableName = "tables")
data class TableEntity(
    @PrimaryKey val id: String,
    val branchId: String,
    val number: String,
    val label: String?,
    val isOccupied: Boolean,
)

/** Cached AI insights (read offline; regenerated online only). */
@Entity(tableName = "ai_insights")
data class AiInsightEntity(
    @PrimaryKey val id: String,
    val kind: String,
    val severity: String,
    val title: String,
    val body: String,
    val createdAt: String,
    val fetchedAtMs: Long,
)

/** Cached session profile (never credentials). */
@Entity(tableName = "user_profile")
data class UserProfileEntity(
    @PrimaryKey val id: String,
    val email: String?,
    val name: String?,
    val role: String,
    val fetchedAtMs: Long,
)

/** Sync cursors and metadata (ledger cursor, catalog version, device id …). */
@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)

object MetaKeys {
    const val LEDGER_CURSOR = "ledger_cursor"
    const val CATALOG_VERSION = "catalog_version"
    const val CATALOG_CHECKED_AT_MS = "catalog_checked_at_ms"
    const val LAST_SYNC_AT_MS = "last_sync_at_ms"
    const val LAST_SYNC_ERROR = "last_sync_error"
    const val DEVICE_ID = "device_id"
    const val AUTH_REQUIRED = "auth_required"
}
