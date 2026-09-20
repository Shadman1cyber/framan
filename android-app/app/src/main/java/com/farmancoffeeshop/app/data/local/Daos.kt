package com.farmancoffeeshop.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncOperationDao {
    @Query("SELECT * FROM sync_operations WHERE idempotencyKey = :key LIMIT 1")
    suspend fun getByKey(key: String): SyncOperationEntity?

    @Query("SELECT * FROM sync_operations WHERE idempotencyKey IN (:keys)")
    suspend fun getByKeys(keys: List<String>): List<SyncOperationEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(op: SyncOperationEntity): Long

    @Query(
        """SELECT * FROM sync_operations
           WHERE status = 'PENDING' AND nextRetryAtMs <= :nowMs
           ORDER BY createdAtMs ASC LIMIT :limit""",
    )
    suspend fun listDue(nowMs: Long, limit: Int): List<SyncOperationEntity>

    @Query("UPDATE sync_operations SET status = 'PROCESSING' WHERE idempotencyKey IN (:keys) AND status = 'PENDING'")
    suspend fun markProcessing(keys: List<String>)

    @Query("UPDATE sync_operations SET status = 'PENDING', lastError = :error WHERE idempotencyKey IN (:keys)")
    suspend fun markPending(keys: List<String>, error: String)

    @Query(
        """UPDATE sync_operations SET status = 'PENDING', attemptCount = attemptCount + 1,
           lastError = :error, nextRetryAtMs = :nextRetryAtMs WHERE idempotencyKey = :key""",
    )
    suspend fun markRetryable(key: String, error: String, nextRetryAtMs: Long)

    @Query(
        """UPDATE sync_operations SET status = 'FAILED', attemptCount = attemptCount + 1,
           lastError = :error WHERE idempotencyKey = :key""",
    )
    suspend fun markFailed(key: String, error: String)

    @Query("DELETE FROM sync_operations WHERE idempotencyKey IN (:keys)")
    suspend fun deleteByKeys(keys: List<String>)

    @Query("UPDATE sync_operations SET status = 'PENDING', nextRetryAtMs = 0 WHERE idempotencyKey = :key AND status = 'FAILED'")
    suspend fun retryFailed(key: String): Int

    @Query("UPDATE sync_operations SET status = 'PENDING' WHERE status = 'PROCESSING'")
    suspend fun resetProcessing(): Int

    @Query("SELECT COUNT(*) FROM sync_operations WHERE status != 'FAILED'")
    fun countPendingFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_operations WHERE status != 'FAILED'")
    suspend fun countPending(): Int

    @Query("SELECT * FROM sync_operations WHERE status = 'FAILED' ORDER BY createdAtMs ASC")
    fun failedFlow(): Flow<List<SyncOperationEntity>>

    @Query("SELECT * FROM sync_operations WHERE status = 'FAILED' ORDER BY createdAtMs ASC")
    suspend fun listFailed(): List<SyncOperationEntity>

    @Query("SELECT * FROM sync_operations ORDER BY createdAtMs DESC LIMIT :limit")
    fun recentFlow(limit: Int): Flow<List<SyncOperationEntity>>
}

@Dao
interface SyncMetaDao {
    @Query("SELECT value FROM sync_meta WHERE `key` = :key LIMIT 1")
    suspend fun get(key: String): String?

    @Query("SELECT value FROM sync_meta WHERE `key` = :key LIMIT 1")
    fun observe(key: String): Flow<String?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(row: SyncMetaEntity)

    @Query("DELETE FROM sync_meta WHERE `key` = :key")
    suspend fun delete(key: String)
}

@Dao
interface LedgerDao {
    @Query("SELECT * FROM ledger_entries ORDER BY COALESCE(serverSequence, 9223372036854775807), createdAtMs ASC")
    fun observeAll(): Flow<List<LedgerEntryEntity>>

    @Query("SELECT * FROM ledger_entries ORDER BY createdAtMs DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<LedgerEntryEntity>>

    @Query("SELECT * FROM ledger_entries WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): LedgerEntryEntity?

    @Query("SELECT * FROM ledger_entries WHERE idempotencyKey = :key LIMIT 1")
    suspend fun getByIdempotencyKey(key: String): LedgerEntryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: LedgerEntryEntity)

    @Query("UPDATE ledger_entries SET serverSequence = :seq, serverReceivedAt = :receivedAt, localState = 'SYNCED' WHERE idempotencyKey = :key")
    suspend fun markSyncedByKey(key: String, seq: Long, receivedAt: String?): Int

    @Query("UPDATE ledger_entries SET serverSequence = :seq, serverReceivedAt = :receivedAt, localState = 'SYNCED' WHERE id = :id")
    suspend fun markSyncedById(id: String, seq: Long, receivedAt: String?): Int

    /**
     * Adopt the acked sequence WITHOUT flipping state: used for provisional
     * REVERSAL rows whose server-minted id differs (they stay PENDING until
     * the authoritative row arrives via pull and replaces them).
     */
    @Query("UPDATE ledger_entries SET serverSequence = :seq, serverReceivedAt = :receivedAt WHERE idempotencyKey = :key AND localState = 'PENDING'")
    suspend fun adoptSequenceByKey(key: String, seq: Long, receivedAt: String?): Int

    /** Remove provisional rows of a permanently-failed op (never happened server-side). */
    @Query("DELETE FROM ledger_entries WHERE idempotencyKey = :key AND localState = 'PENDING'")
    suspend fun deleteProvisionalByKey(key: String): Int

    /**
     * Drop local provisional REVERSAL rows once the authoritative server
     * reversal for the same original arrives (server mints reversal ids, so
     * the provisional client id can never match; matched by reversalOf).
     */
    @Query("DELETE FROM ledger_entries WHERE reversalOf = :reversalOf AND id != :keepId AND localState = 'PENDING' AND entryType = 'REVERSAL'")
    suspend fun deleteProvisionalReversals(reversalOf: String, keepId: String)

    @Query("SELECT accountId, SUM(amount) AS total FROM ledger_entries GROUP BY accountId")
    suspend fun sumsByAccount(): List<AccountSum>

    @Transaction
    suspend fun replaceSnapshot(rows: List<LedgerEntryEntity>) {
        // Snapshot replace is only used in tests; production merges by sequence.
        clearAll()
        rows.forEach { upsert(it) }
    }

    @Query("DELETE FROM ledger_entries")
    suspend fun clearAll()
}

data class AccountSum(val accountId: String, val total: Long?)

data class IngredientDelta(val ingredientId: String, val total: Double?)

@Dao
interface StockDao {
    @Query("SELECT * FROM stock_movements WHERE ingredientId = :ingredientId ORDER BY COALESCE(serverSequence, 9223372036854775807), createdAtMs ASC")
    fun observeByIngredient(ingredientId: String): Flow<List<StockMovementEntity>>

    @Query("SELECT * FROM stock_movements ORDER BY createdAtMs DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<StockMovementEntity>>

    /** Live delta sums per ingredient: level = snapshot + this sum. */
    @Query("SELECT ingredientId, SUM(delta) AS total FROM stock_movements GROUP BY ingredientId")
    fun deltasFlow(): Flow<List<IngredientDelta>>

    @Query("SELECT COALESCE(SUM(delta), 0) FROM stock_movements WHERE ingredientId = :ingredientId")
    suspend fun sumForIngredient(ingredientId: String): Double

    @Query("SELECT * FROM stock_movements WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): StockMovementEntity?

    @Query("SELECT * FROM stock_movements WHERE idempotencyKey = :key LIMIT 1")
    suspend fun getByIdempotencyKey(key: String): StockMovementEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: StockMovementEntity)

    @Query("UPDATE stock_movements SET serverSequence = :seq, serverReceivedAt = :receivedAt, localState = 'SYNCED' WHERE idempotencyKey = :key")
    suspend fun markSyncedByKey(key: String, seq: Long, receivedAt: String?): Int
}

@Dao
interface CatalogDao {
    // Categories
    @Query("SELECT * FROM categories ORDER BY sortOrder ASC")
    fun observeCategories(): Flow<List<CategoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCategories(rows: List<CategoryEntity>)

    @Query("DELETE FROM categories")
    suspend fun clearCategories()

    // Products
    @Query("SELECT * FROM products WHERE isAvailable = 1 ORDER BY sortOrder ASC")
    fun observeAvailableProducts(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products ORDER BY sortOrder ASC")
    fun observeAllProducts(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE id = :id LIMIT 1")
    suspend fun getProduct(id: String): ProductEntity?

    @Query("SELECT * FROM products WHERE nameFa LIKE '%' || :q || '%' ORDER BY sortOrder ASC LIMIT 50")
    fun searchProducts(q: String): Flow<List<ProductEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProducts(rows: List<ProductEntity>)

    @Query("DELETE FROM products")
    suspend fun clearProducts()

    // Coffee lines
    @Query("SELECT * FROM coffee_lines")
    suspend fun allCoffeeLines(): List<CoffeeLineEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCoffeeLines(rows: List<CoffeeLineEntity>)

    @Query("DELETE FROM coffee_lines")
    suspend fun clearCoffeeLines()

    @Query("SELECT * FROM product_coffee_lines WHERE productId = :productId")
    suspend fun linesForProduct(productId: String): List<ProductCoffeeLineEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProductLines(rows: List<ProductCoffeeLineEntity>)

    @Query("DELETE FROM product_coffee_lines")
    suspend fun clearProductLines()

    // Ingredients
    @Query("SELECT * FROM ingredients ORDER BY nameFa ASC")
    fun observeIngredients(): Flow<List<IngredientEntity>>

    @Query("SELECT * FROM ingredients WHERE id = :id LIMIT 1")
    suspend fun getIngredient(id: String): IngredientEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertIngredients(rows: List<IngredientEntity>)

    @Query("DELETE FROM ingredients")
    suspend fun clearIngredients()

    // Staff & tables
    @Query("SELECT * FROM staff ORDER BY name ASC")
    fun observeStaff(): Flow<List<StaffEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertStaff(rows: List<StaffEntity>)

    @Query("DELETE FROM staff")
    suspend fun clearStaff()

    @Query("SELECT * FROM tables ORDER BY number ASC")
    fun observeTables(): Flow<List<TableEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertTables(rows: List<TableEntity>)

    @Query("DELETE FROM tables")
    suspend fun clearTables()

    @Transaction
    suspend fun replaceCatalog(
        categories: List<CategoryEntity>,
        products: List<ProductEntity>,
        coffeeLines: List<CoffeeLineEntity>,
        productLines: List<ProductCoffeeLineEntity>,
        ingredients: List<IngredientEntity>,
        staff: List<StaffEntity>,
        tables: List<TableEntity>,
    ) {
        clearCategories(); upsertCategories(categories)
        clearProducts(); upsertProducts(products)
        clearCoffeeLines(); upsertCoffeeLines(coffeeLines)
        clearProductLines(); upsertProductLines(productLines)
        // Ingredient snapshot replace must preserve nothing else: stock levels
        // derive from snapshot + movement mirror, which is untouched here.
        clearIngredients(); upsertIngredients(ingredients)
        clearStaff(); upsertStaff(staff)
        clearTables(); upsertTables(tables)
    }
}

@Dao
interface AiInsightDao {
    @Query("SELECT * FROM ai_insights ORDER BY createdAt DESC")
    fun observe(): Flow<List<AiInsightEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<AiInsightEntity>)

    @Query("DELETE FROM ai_insights")
    suspend fun clear()
}

@Dao
interface UserProfileDao {
    @Query("SELECT * FROM user_profile LIMIT 1")
    fun observe(): Flow<UserProfileEntity?>

    @Query("SELECT * FROM user_profile LIMIT 1")
    suspend fun get(): UserProfileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: UserProfileEntity)

    @Query("DELETE FROM user_profile")
    suspend fun clear()
}
