package com.farmancoffeeshop.app.data.local

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.farmancoffeeshop.app.data.remote.TimeUtil
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DaoTest {
    private lateinit var db: FarmanDatabase

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            FarmanDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun teardown() {
        db.close()
    }

    @Test
    fun `ledger upsert get and mark synced`() = runTest {
        val row = LedgerEntryEntity(
            id = "e1", entryType = "EXPENSE", referenceType = "order", referenceId = null,
            accountId = "cash", amount = -100, currency = "TOMAN",
            occurredAt = TimeUtil.nowIso(), deviceId = "d", reversalOf = null,
            serverSequence = null, serverReceivedAt = null, idempotencyKey = "k1",
            localState = RowState.PENDING, createdAtMs = 1L,
        )
        db.ledger().upsert(row)
        assertEquals("e1", db.ledger().getById("e1")?.id)
        assertEquals("e1", db.ledger().getByIdempotencyKey("k1")?.id)
        assertEquals(1, db.ledger().markSyncedByKey("k1", 41L, TimeUtil.nowIso()))
        val synced = db.ledger().getById("e1")!!
        assertEquals(41L, synced.serverSequence)
        assertEquals(RowState.SYNCED, synced.localState)
        assertEquals(0, db.ledger().markSyncedByKey("missing", 1L, null))
        val sums = db.ledger().sumsByAccount()
        assertEquals(-100L, sums.single { it.accountId == "cash" }.total)
    }

    @Test
    fun `provisional reversals are replaced on pull`() = runTest {
        val provisional = LedgerEntryEntity(
            id = "prov", entryType = "REVERSAL", referenceType = "order", referenceId = "o1",
            accountId = "cash", amount = -100, currency = "TOMAN",
            occurredAt = TimeUtil.nowIso(), deviceId = "d", reversalOf = "orig",
            serverSequence = null, serverReceivedAt = null, idempotencyKey = "k",
            localState = RowState.PENDING, createdAtMs = 1L,
        )
        db.ledger().upsert(provisional)
        db.ledger().deleteProvisionalReversals("orig", "server-rev")
        assertNull(db.ledger().getById("prov"))
    }

    @Test
    fun `stock deltas aggregate per ingredient`() = runTest {
        suspend fun move(id: String, delta: Double) {
            db.stock().upsert(
                StockMovementEntity(
                    id = id, ingredientId = "ing", delta = delta, reason = "r",
                    occurredAt = TimeUtil.nowIso(), deviceId = "d",
                    serverSequence = null, serverReceivedAt = null, idempotencyKey = "k-$id",
                    localState = RowState.PENDING, createdAtMs = 1L,
                ),
            )
        }
        move("m1", 20.0)
        move("m2", -5.0)
        val deltas = db.stock().deltasFlow().first()
        assertEquals(15.0, deltas.single { it.ingredientId == "ing" }.total)
        assertEquals(15.0, db.stock().sumForIngredient("ing"), 0.0)
        assertEquals(0.0, db.stock().sumForIngredient("other"), 0.0)
    }

    @Test
    fun `outbox lifecycle survives the crash-recovery path`() = runTest {
        val ops = db.syncOperations()
        val op = SyncOperationEntity(
            idempotencyKey = "k", operationId = "o", entityType = "ledger_entry",
            entityId = "e", operationType = "CREATE_TRANSACTION", payloadJson = "{}",
            clientTimestamp = TimeUtil.nowIso(), deviceId = "d", createdAtMs = 1L,
        )
        assertTrue(ops.insertIgnore(op) > 0)
        assertEquals(-1L, ops.insertIgnore(op)) // dedupe: second insert ignored
        assertEquals(1, ops.countPending())
        assertEquals(1, ops.listDue(0L, 10).size)
        assertTrue(ops.listDue(-1L, 10).isEmpty()) // nextRetryAt gate
        ops.markProcessing(listOf("k"))
        assertTrue(ops.listDue(999L, 10).isEmpty())
        assertEquals(1, ops.resetProcessing())
        assertEquals(1, ops.listDue(999L, 10).size)
        ops.markRetryable("k", "boom", 5000L)
        assertTrue(ops.listDue(4999L, 10).isEmpty())
        assertEquals(1, ops.listDue(5000L, 10).size)
        ops.markFailed("k", "permanent")
        assertEquals(0, ops.countPending())
        assertEquals(1, ops.listFailed().size)
        assertEquals(1, ops.retryFailed("k"))
        assertEquals(0, ops.retryFailed("missing"))
        assertEquals(1, ops.countPending())
        ops.deleteByKeys(listOf("k"))
        assertEquals(0, ops.countPending())
    }

    @Test
    fun `meta and catalog replace work`() = runTest {
        db.syncMeta().put(com.farmancoffeeshop.app.data.local.SyncMetaEntity("k", "v"))
        assertEquals("v", db.syncMeta().get("k"))
        db.syncMeta().delete("k")
        assertNull(db.syncMeta().get("k"))

        db.catalog().replaceCatalog(
            categories = listOf(CategoryEntity("c1", "hot", "گرم", null, null, true, 0)),
            products = listOf(
                ProductEntity(
                    "p1", "espresso", "اسپرسو", null, "–", 50000, null, "c1",
                    true, false, 0, "FREE", 3, TimeUtil.nowIso(),
                ),
            ),
            coffeeLines = emptyList(),
            productLines = emptyList(),
            ingredients = listOf(
                IngredientEntity("i1", "قهوه", null, "GRAM", 100.0, 10.0, null, null, true, TimeUtil.nowIso()),
            ),
            staff = emptyList(),
            tables = emptyList(),
        )
        val products = db.catalog().observeAvailableProducts().first()
        assertEquals("p1", products.single().id)
        assertEquals("i1", db.catalog().getIngredient("i1")?.id)
    }
}
