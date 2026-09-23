package com.farmancoffeeshop.app.data.repository

import androidx.room.withTransaction
import com.farmancoffeeshop.app.data.local.CategoryEntity
import com.farmancoffeeshop.app.data.local.CoffeeLineEntity
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.IngredientEntity
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.ProductCoffeeLineEntity
import com.farmancoffeeshop.app.data.local.ProductEntity
import com.farmancoffeeshop.app.data.local.StaffEntity
import com.farmancoffeeshop.app.data.local.SyncMetaEntity
import com.farmancoffeeshop.app.data.local.TableEntity
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.ApiProvider
import com.farmancoffeeshop.app.sync.catalogSnapshotOf
import kotlinx.coroutines.flow.Flow

data class ProductDetail(
    val product: ProductEntity,
    val lines: List<LineWithName>,
)

data class LineWithName(
    val coffeeLineId: String,
    val nameFa: String,
    val price: Long,
    val isActive: Boolean,
)

/**
 * Server-authoritative reference data. The client never edits these rows
 * offline: [syncCatalog] replaces the whole snapshot when the server version
 * changes, so no merge exists by construction.
 */
class CatalogRepository(
    private val db: FarmanDatabase,
    private val apis: ApiProvider,
    private val online: () -> Boolean,
) {
    private val catalog = db.catalog()
    private val meta = db.syncMeta()
    private val moshi = HttpClientFactory.moshi

    fun observeCategories(): Flow<List<CategoryEntity>> = catalog.observeCategories()
    fun observeProducts(): Flow<List<ProductEntity>> = catalog.observeAvailableProducts()
    fun observeAllProducts(): Flow<List<ProductEntity>> = catalog.observeAllProducts()
    fun searchProducts(q: String): Flow<List<ProductEntity>> = catalog.searchProducts(q)
    fun observeStaff(): Flow<List<StaffEntity>> = catalog.observeStaff()
    fun observeTables(): Flow<List<TableEntity>> = catalog.observeTables()

    suspend fun productDetail(id: String): ProductDetail? {
        val product = catalog.getProduct(id) ?: return null
        val lines = catalog.linesForProduct(id)
        val names = catalog.allCoffeeLines().associateBy { it.id }
        return ProductDetail(
            product,
            lines.map {
                LineWithName(
                    it.coffeeLineId,
                    names[it.coffeeLineId]?.nameFa ?: "",
                    it.price,
                    it.isActive,
                )
            },
        )
    }

    suspend fun storedVersion(): Long = meta.get(MetaKeys.CATALOG_VERSION)?.toLongOrNull() ?: 0L

    /**
     * Pull the snapshot and replace it when the version changed.
     * @return true when the local snapshot was replaced.
     */
    suspend fun syncCatalog(): Boolean {
        val dto = apiCall(moshi, online()) { apis.current().catalog() }
        val snapshot = catalogSnapshotOf(dto, TimeUtil.nowIso())
        val stored = storedVersion()
        if (snapshot.version != 0L && snapshot.version == stored) return false
        db.withTransaction {
            catalog.replaceCatalog(
                snapshot.categories,
                snapshot.products,
                snapshot.coffeeLines,
                snapshot.productLines,
                snapshot.ingredients,
                snapshot.staff,
                snapshot.tables,
            )
            meta.put(SyncMetaEntity(MetaKeys.CATALOG_VERSION, snapshot.version.toString()))
        }
        return true
    }

    suspend fun hasCatalog(): Boolean = storedVersion() != 0L
}
