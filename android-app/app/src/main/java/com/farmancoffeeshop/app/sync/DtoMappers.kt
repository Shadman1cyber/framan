package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.data.local.LedgerEntryEntity
import com.farmancoffeeshop.app.data.local.RowState
import com.farmancoffeeshop.app.data.local.StockMovementEntity
import com.farmancoffeeshop.app.data.remote.dto.CatalogDto
import com.farmancoffeeshop.app.data.remote.dto.CategoryDto
import com.farmancoffeeshop.app.data.remote.dto.IngredientDto
import com.farmancoffeeshop.app.data.remote.dto.InsightDto
import com.farmancoffeeshop.app.data.local.AiInsightEntity
import com.farmancoffeeshop.app.data.local.CategoryEntity
import com.farmancoffeeshop.app.data.local.CoffeeLineEntity
import com.farmancoffeeshop.app.data.local.IngredientEntity
import com.farmancoffeeshop.app.data.local.ProductCoffeeLineEntity
import com.farmancoffeeshop.app.data.local.ProductEntity
import com.farmancoffeeshop.app.data.local.StaffEntity
import com.farmancoffeeshop.app.data.local.TableEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.core.sync.ChangeKind
import com.farmancoffeeshop.core.sync.PulledChange
import com.farmancoffeeshop.core.sync.SyncTransportError

private fun num(map: Map<String, Any?>, key: String): Number? = map[key] as? Number
private fun str(map: Map<String, Any?>, key: String): String? = map[key] as? String

/** Parse one pull change. Unknown future kinds are skipped (null) so old
 * clients keep syncing; known kinds with missing fields are malformed. */
fun parsePulledChange(raw: Map<String, Any?>): PulledChange? {
    val kind = ChangeKind.fromWire(str(raw, "kind")) ?: return null
    val id = str(raw, "id") ?: throw SyncTransportError("pull change without id")
    val seq = num(raw, "server_sequence")?.toLong()
        ?: throw SyncTransportError("pull change without server_sequence")
    return PulledChange(kind, id, seq, raw)
}

fun ledgerEntityOf(c: PulledChange): LedgerEntryEntity? {
    val d = c.data
    val amount = num(d, "amount")?.toLong() ?: return null
    val entryType = str(d, "entry_type") ?: return null
    return LedgerEntryEntity(
        id = c.id,
        entryType = entryType,
        referenceType = str(d, "reference_type") ?: "order",
        referenceId = str(d, "reference_id"),
        accountId = str(d, "account_id") ?: "cash",
        amount = amount,
        currency = str(d, "currency") ?: "TOMAN",
        occurredAt = str(d, "occurred_at") ?: TimeUtil.nowIso(),
        deviceId = str(d, "device_id") ?: "",
        reversalOf = str(d, "reversal_of"),
        serverSequence = c.serverSequence,
        serverReceivedAt = str(d, "server_received_at"),
        idempotencyKey = null, // server rows: key unknown; matched by id
        localState = RowState.SYNCED,
        createdAtMs = TimeUtil.nowMs(),
    )
}

fun stockEntityOf(c: PulledChange): StockMovementEntity? {
    val d = c.data
    return StockMovementEntity(
        id = c.id,
        ingredientId = str(d, "ingredient_id") ?: return null,
        delta = num(d, "delta")?.toDouble() ?: return null,
        reason = str(d, "reason") ?: "",
        occurredAt = str(d, "occurred_at") ?: TimeUtil.nowIso(),
        deviceId = str(d, "device_id") ?: "",
        serverSequence = c.serverSequence,
        serverReceivedAt = str(d, "server_received_at"),
        idempotencyKey = null,
        localState = RowState.SYNCED,
        createdAtMs = TimeUtil.nowMs(),
    )
}

data class CatalogSnapshot(
    val version: Long,
    val categories: List<CategoryEntity>,
    val products: List<ProductEntity>,
    val coffeeLines: List<CoffeeLineEntity>,
    val productLines: List<ProductCoffeeLineEntity>,
    val ingredients: List<IngredientEntity>,
    val staff: List<StaffEntity>,
    val tables: List<TableEntity>,
)

fun catalogSnapshotOf(dto: CatalogDto, fallbackTs: String): CatalogSnapshot {
    val cats = dto.categories.orEmpty().map { c: CategoryDto ->
        CategoryEntity(c.id, c.slug, c.nameFa, c.nameEn, c.icon, c.isActive, c.sortOrder)
    }
    val products = dto.products.orEmpty().map { p ->
        ProductEntity(
            p.id, p.slug, p.nameFa, p.nameEn, p.description, p.price, p.image,
            p.categoryId, p.isAvailable, p.isFeatured, p.sortOrder,
            p.allergenStatus, p.prepBaseMin, p.updatedAt ?: fallbackTs,
        )
    }
    val lines = dto.products.orEmpty().flatMap { p ->
        p.coffeeLines.orEmpty().map { l ->
            ProductCoffeeLineEntity(p.id, l.coffeeLineId, l.price, l.isActive)
        }
    }
    val coffeeLines = dto.coffeeLines.orEmpty().map { c ->
        CoffeeLineEntity(c.id, c.nameFa, c.nameEn, c.isActive)
    }
    val ingredients = dto.ingredients.orEmpty().map { i: IngredientDto ->
        IngredientEntity(
            i.id, i.nameFa, i.nameEn, i.unit, i.stockQuantity, i.minQuantity,
            i.costPerUnit, i.supplier, i.isActive, i.updatedAt ?: fallbackTs,
        )
    }
    val staff = dto.staff.orEmpty().map { s -> StaffEntity(s.id, s.name, s.role) }
    val tables = dto.tables.orEmpty().map { t ->
        TableEntity(t.id, t.branchId, t.number, t.label, t.isOccupied)
    }
    return CatalogSnapshot(
        dto.version ?: 0L, cats, products, coffeeLines, lines, ingredients, staff, tables,
    )
}

fun insightEntityOf(dto: InsightDto, fetchedAtMs: Long): AiInsightEntity = AiInsightEntity(
    id = dto.id,
    kind = dto.kind,
    severity = dto.severity,
    title = dto.title,
    body = dto.body,
    createdAt = dto.createdAt ?: "",
    fetchedAtMs = fetchedAtMs,
)
