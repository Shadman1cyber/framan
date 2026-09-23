package com.farmancoffeeshop.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

/**
 * Local database — the UI source of truth. Never the network.
 * v1: fresh install, no migrations yet (see docs/android-offline-first.md).
 */
@Database(
    entities = [
        SyncOperationEntity::class,
        SyncMetaEntity::class,
        LedgerEntryEntity::class,
        StockMovementEntity::class,
        CategoryEntity::class,
        ProductEntity::class,
        CoffeeLineEntity::class,
        ProductCoffeeLineEntity::class,
        IngredientEntity::class,
        StaffEntity::class,
        TableEntity::class,
        AiInsightEntity::class,
        UserProfileEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class FarmanDatabase : RoomDatabase() {
    abstract fun syncOperations(): SyncOperationDao
    abstract fun syncMeta(): SyncMetaDao
    abstract fun ledger(): LedgerDao
    abstract fun stock(): StockDao
    abstract fun catalog(): CatalogDao
    abstract fun aiInsights(): AiInsightDao
    abstract fun userProfile(): UserProfileDao
}
