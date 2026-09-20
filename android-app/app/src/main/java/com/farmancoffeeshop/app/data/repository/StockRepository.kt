package com.farmancoffeeshop.app.data.repository

import androidx.room.withTransaction
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.IngredientEntity
import com.farmancoffeeshop.app.data.local.StockMovementEntity
import com.farmancoffeeshop.app.data.local.RowState
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.RoomSyncStore
import com.farmancoffeeshop.core.domain.ValidationResult
import com.farmancoffeeshop.core.domain.validateStockMovement
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.NewOperation
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.newUuid
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

data class IngredientLevel(
    val ingredient: IngredientEntity,
    /** Live level = snapshot + every known delta (synced + pending). */
    val level: Double,
    val isLow: Boolean,
)

/**
 * Inventory, offline-first. Movements are append-only and merge additively;
 * levels derive (snapshot + deltas) and are never overwritten. Same rules as
 * the online adjust path: explicit confirmation for decreases.
 */
class StockRepository(
    private val db: FarmanDatabase,
    private val store: RoomSyncStore,
    private val deviceId: () -> String,
) {
    private val catalog = db.catalog()
    private val stock = db.stock()

    fun observeLevels(): Flow<List<IngredientLevel>> = combine(
        catalog.observeIngredients(),
        stock.deltasFlow(),
    ) { ingredients, deltas ->
        val byId = deltas.associate { it.ingredientId to (it.total ?: 0.0) }
        ingredients.map { ing ->
            val level = ing.snapshotQuantity + (byId[ing.id] ?: 0.0)
            IngredientLevel(
                ingredient = ing,
                level = level,
                isLow = ing.minQuantity != null && level <= ing.minQuantity,
            )
        }
    }

    fun observeHistory(ingredientId: String): Flow<List<StockMovementEntity>> =
        stock.observeByIngredient(ingredientId)

    fun observeRecentMovements(limit: Int = 50): Flow<List<StockMovementEntity>> =
        stock.observeRecent(limit)

    suspend fun ingredient(id: String): IngredientEntity? = catalog.getIngredient(id)

    suspend fun recordMovement(
        ingredientId: String,
        delta: Double,
        reason: String,
        allowNegative: Boolean,
    ): String {
        val ingredient = catalog.getIngredient(ingredientId)
            ?: throw RepoException.Validation("ماده اولیه یافت نشد")
        val id = newUuid()
        val device = deviceId()
        val occurredAt = TimeUtil.nowIso()
        when (
            val v = validateStockMovement(
                ingredientId, delta, reason, id, device,
                TimeUtil.nowMs(), allowNegative, ingredient.isActive,
            )
        ) {
            is ValidationResult.Invalid -> throw RepoException.Validation(v.reason)
            ValidationResult.Valid -> Unit
        }
        // Local guard mirrors the server's "resulting stock ≥ 0" rule using
        // the live derived level, so users get instant feedback offline.
        val knownDeltas = stock.sumForIngredient(ingredientId)
        if (ingredient.snapshotQuantity + knownDeltas + delta < 0) {
            throw RepoException.Validation("موجودی نهایی نمی‌تواند منفی باشد")
        }
        val key = newUuid()
        db.withTransaction {
            stock.upsert(
                StockMovementEntity(
                    id = id,
                    ingredientId = ingredientId,
                    delta = delta,
                    reason = reason.trim(),
                    occurredAt = occurredAt,
                    deviceId = device,
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
                    entityType = EntityTypes.STOCK_MOVEMENT,
                    entityId = id,
                    operationType = OperationTypes.RECORD_MOVEMENT,
                    payload = mapOf(
                        "movement" to mapOf(
                            "id" to id,
                            "ingredientId" to ingredientId,
                            "delta" to delta,
                            "reason" to reason.trim(),
                            "occurredAt" to occurredAt,
                            "deviceId" to device,
                            "allowNegative" to allowNegative,
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
}
