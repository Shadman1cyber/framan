package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.FakeFarmanServer
import com.farmancoffeeshop.app.TestKit
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.RowState
import com.farmancoffeeshop.app.data.local.SyncMetaEntity
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.NewOperation
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.newUuid
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * End-to-end offline-first journey against a protocol-faithful fake server:
 * open offline → transact → kill → reopen → reconnect → server converges.
 * Mirrors docs/sync-protocol.md semantics (not the fake's convenience).
 */
@RunWith(RobolectricTestRunner::class)
class SyncIntegrationTest {
    private lateinit var fake: FakeFarmanServer

    @Before
    fun setup() {
        fake = FakeFarmanServer()
        fake.start()
    }

    @After
    fun teardown() {
        fake.shutdown()
    }

    private suspend fun login(kit: TestKit) {
        kit.auth.login("admin@farmans.cafe", "correct")
    }

    @Test
    fun `phase21 - offline sale survives restart then syncs to server`() = runTest {
        // 1-2. "Open without internet": offline kit, record a sale.
        val offline = TestKit(fake.baseUrl)
        offline.connectivity.online = false
        val saleId = offline.ledger.recordSale(50_000L, note = "میز ۴")
        // 3-4. Immediately visible locally as pending.
        val visible = offline.db.ledger().observeAll().first()
        assertEquals(1, visible.size)
        assertEquals(saleId, visible.single().id)
        assertEquals(RowState.PENDING, visible.single().localState)
        assertEquals(1, offline.db.syncOperations().countPending())

        // 5-7. Kill + reopen: new kit on the SAME database file.
        val file = offline.dbFile
        offline.close()
        val reopened = TestKit(fake.baseUrl, dbFile = file)
        val afterRestart = reopened.db.ledger().observeAll().first()
        assertEquals(1, afterRestart.size)
        assertEquals(saleId, afterRestart.single().id)
        assertEquals(1, reopened.db.syncOperations().countPending())

        // 8-10. Restore internet: login, sync, server converges.
        reopened.connectivity.online = true
        login(reopened)
        val summary = reopened.runner.runOnce()
        assertNull(summary.error)
        assertEquals(1, summary.synced)
        assertEquals(0, reopened.db.syncOperations().countPending())
        val synced = reopened.db.ledger().getById(saleId)!!
        assertEquals(RowState.SYNCED, synced.localState)
        assertEquals(1L, synced.serverSequence)
        assertEquals(1L, reopened.store.getCursor())
        assertEquals(50_000L, fake.ledgerChanges.single()["amount"])

        // Duplicate run pushes nothing (idempotent worker re-entry).
        val again = reopened.runner.runOnce()
        assertEquals(0, again.pushed)
        assertEquals(1, fake.ledgerChanges.size)
        reopened.close()
    }

    @Test
    fun `pull merges another device additively`() = runTest {
        val kit = TestKit(fake.baseUrl)
        login(kit)
        // Other device posted +200 directly on the server.
        fake.seedLedgerEntry(200L, id = "other-1")
        kit.ledger.recordSale(50_000L)
        val summary = kit.runner.runOnce()
        assertNull(summary.error)
        val balances = kit.ledger.observeBalances().first()
        assertEquals(50_200L, balances["cash"])
        assertEquals(2L, kit.store.getCursor())
        kit.close()
    }

    @Test
    fun `reversal provisional row is replaced by the server row`() = runTest {
        val kit = TestKit(fake.baseUrl)
        login(kit)
        val saleId = kit.ledger.recordSale(10_000L)
        kit.runner.runOnce()
        val provisional = kit.ledger.reverseEntry(saleId)
        assertEquals(RowState.PENDING, kit.db.ledger().getById(provisional)!!.localState)
        kit.runner.runOnce()
        // Provisional gone, server-minted reversal present: sale + reversal.
        assertNull(kit.db.ledger().getById(provisional))
        val rows = kit.db.ledger().observeAll().first()
        assertEquals(2, rows.size)
        assertTrue(rows.any { it.entryType == "REVERSAL" && it.localState == RowState.SYNCED })
        assertEquals(0L, kit.ledger.observeBalances().first()["cash"])
        kit.close()
    }

    @Test
    fun `permanent rejection is retained and manually retryable`() = runTest {
        val kit = TestKit(fake.baseUrl)
        login(kit)
        // Bypass repository validation to simulate a server-side rules change:
        // an op the server permanently rejects must be kept, never dropped.
        val key = newUuid()
        val id = newUuid()
        kit.db.ledger().upsert(
            com.farmancoffeeshop.app.data.local.LedgerEntryEntity(
                id = id, entryType = "EXPENSE", referenceType = "order", referenceId = null,
                accountId = "cash", amount = 0L, currency = "TOMAN",
                occurredAt = "2026-09-19T08:00:00.000Z", deviceId = "d", reversalOf = null,
                serverSequence = null, serverReceivedAt = null, idempotencyKey = key,
                localState = RowState.PENDING, createdAtMs = 1L,
            ),
        )
        kit.store.insertOp(
            NewOperation(
                idempotencyKey = key, entityType = EntityTypes.LEDGER_ENTRY, entityId = id,
                operationType = OperationTypes.CREATE_TRANSACTION,
                payload = mapOf(
                    "entry" to mapOf(
                        "id" to id, "entryType" to "EXPENSE", "referenceType" to "order",
                        "referenceId" to null, "accountId" to "cash", "amount" to 0L,
                        "currency" to "TOMAN", "occurredAt" to "2026-09-19T08:00:00.000Z",
                        "deviceId" to "d", "metadata" to emptyMap<String, Any?>(),
                    ),
                ),
                clientTimestamp = "2026-09-19T08:00:00.000Z", deviceId = "d",
            ),
            1L,
        )
        val summary = kit.runner.runOnce()
        assertEquals(1, summary.failed)
        val failed = kit.store.listFailed()
        assertEquals(1, failed.size)
        assertTrue(failed.single().lastError!!.contains("INVALID_AMOUNT"))
        // Manual retry re-attempts (and fails again) — nothing is auto-deleted.
        assertTrue(kit.sync.retryFailed(key))
        val retry = kit.runner.runOnce()
        assertEquals(1, retry.failed)
        assertEquals(0, fake.ledgerChanges.size)
        kit.close()
    }

    @Test
    fun `401 keeps ops pending with attempts untouched and flags auth`() = runTest {
        val kit = TestKit(fake.baseUrl)
        // Never log in: no session cookie → 401 on push.
        kit.ledger.recordSale(5_000L)
        val summary = kit.runner.runOnce()
        assertTrue(summary.authRequired)
        assertEquals(1, kit.db.syncOperations().countPending())
        val op = kit.db.syncOperations().listDue(Long.MAX_VALUE, 10).single()
        assertEquals(0, op.attemptCount)
        assertEquals("1", kit.db.syncMeta().get(MetaKeys.AUTH_REQUIRED))
        assertNull(kit.db.syncMeta().get(MetaKeys.LAST_SYNC_AT_MS))
        kit.close()
    }

    @Test
    fun `stock movement syncs and catalog snapshot is versioned`() = runTest {
        val kit = TestKit(fake.baseUrl)
        login(kit)
        // Catalog first (ingredient snapshot 100).
        assertTrue(kit.catalog.syncCatalog())
        assertFalse(kit.catalog.syncCatalog()) // same version → no-op
        assertEquals(1_000L, kit.catalog.storedVersion())
        val before = kit.stock.observeLevels().first().single { it.ingredient.id == "i1" }
        assertEquals(100.0, before.level, 0.0)
        // Offline purchase +20, then usage −5 after reconnect.
        kit.connectivity.online = false
        kit.stock.recordMovement("i1", 20.0, "خرید روزانه", false)
        val offlineLevel = kit.stock.observeLevels().first().single { it.ingredient.id == "i1" }
        assertEquals(120.0, offlineLevel.level, 0.0)
        kit.connectivity.online = true
        kit.runner.runOnce()
        kit.stock.recordMovement("i1", -5.0, "مصرف روزانه", true)
        kit.runner.runOnce()
        val level = kit.stock.observeLevels().first().single { it.ingredient.id == "i1" }
        assertEquals(115.0, level.level, 0.0)
        assertEquals(2, fake.ledgerChanges.count { it["kind"] == "stock_movement" })
        // Cached insights pulled alongside.
        assertEquals(1, kit.ai.observe().first().size)
        kit.close()
    }
}
