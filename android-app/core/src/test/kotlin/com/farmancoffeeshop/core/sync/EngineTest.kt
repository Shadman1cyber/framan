package com.farmancoffeeshop.core.sync

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

private fun op(
    operationId: String = newUuid(),
    key: String = newUuid(),
    type: String = OperationTypes.CREATE_TRANSACTION,
    entity: String = EntityTypes.LEDGER_ENTRY,
): NewOperation = NewOperation(
    operationId = operationId,
    idempotencyKey = key,
    entityType = entity,
    entityId = newUuid(),
    operationType = type,
    payload = mapOf("entry" to mapOf("amount" to 100)),
    clientTimestamp = "2026-09-19T08:00:00.000Z",
    deviceId = newUuid(),
)

private class FakeApi(
    var pushHandler: (List<PushOperation>) -> List<PushResultItem> = { ops ->
        ops.map { PushApplied(it.operationId, 1L, it.entityId) }
    },
    var pullHandler: (Long, Int) -> PullResponse = { _, _ -> PullResponse(emptyList(), 0L) },
    val pushedBatches: MutableList<List<PushOperation>> = mutableListOf(),
) : SyncApi {
    override suspend fun push(deviceId: String, operations: List<PushOperation>): PushResponse {
        pushedBatches.add(operations)
        return PushResponse(pushHandler(operations))
    }

    override suspend fun pull(after: Long, take: Int): PullResponse = pullHandler(after, take)
}

private fun deps(online: Boolean = true, now: () -> Long = { 0L }, batchSize: Int = 20) = EngineDeps(
    isOnline = { online },
    nowMs = now,
    rand = { 0.5 }, // deterministic: zero jitter
    batchSize = batchSize,
)

class EngineTest {

    @Test
    fun `offline run retains ops and touches nothing`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi()
        store.enqueue(op(), 0L)
        val s = runSync(store, api, "d", deps(online = false))
        assertEquals(0, s.pushed)
        assertTrue(api.pushedBatches.isEmpty())
        assertEquals(1, store.countPending())
        assertEquals(0L, s.cursor)
    }

    @Test
    fun `transport failure retries with same key and backoff`() = runTest {
        val store = MemorySyncStore()
        var now = 0L
        val api = FakeApi(pushHandler = { throw SyncTransportError("boom") })
        val key = newUuid()
        store.enqueue(op(key = key), now)
        val s1 = runSync(store, api, "d", deps(now = { now }))
        assertEquals("boom", s1.error)
        assertEquals(1, store.countPending())
        // Not due before the 1s backoff elapses.
        assertTrue(store.listDue(now, 10).isEmpty())
        now += 1_001L
        assertEquals(1, store.listDue(now, 10).size)
        assertEquals(key, store.listDue(now, 10).single().idempotencyKey)
        assertEquals(1, store.listDue(now, 10).single().attemptCount)
    }

    @Test
    fun `permanent rejection is retained as failed and manually retryable`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi(pushHandler = { ops ->
            ops.map { PushRejected(it.operationId, "VALIDATION_FAILED", false, "bad") }
        })
        val key = newUuid()
        store.enqueue(op(key = key), 0L)
        val s = runSync(store, api, "d", deps())
        assertEquals(1, s.failed)
        assertEquals(0, store.countPending())
        val failed = store.listFailed()
        assertEquals(1, failed.size)
        assertTrue(failed.single().lastError!!.contains("VALIDATION_FAILED"))
        assertTrue(store.retryFailed(key))
        assertEquals(1, store.countPending())
        assertFalse(store.retryFailed("missing"))
    }

    @Test
    fun `401 keeps attempts untouched and flags auth`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi(pushHandler = { throw SyncAuthError() })
        store.enqueue(op(), 0L)
        val s = runSync(store, api, "d", deps())
        assertTrue(s.authRequired)
        val due = store.listDue(0L, 10)
        assertEquals(1, due.size)
        assertEquals(0, due.single().attemptCount)
    }

    @Test
    fun `lost response replayed with same key applies once`() = runTest {
        val store = MemorySyncStore()
        var calls = 0
        val api = FakeApi(pushHandler = { ops ->
            calls++
            // First attempt "loses" the response; the retry is a duplicate ack.
            if (calls == 1) throw SyncTransportError("timeout")
            ops.map { PushApplied(it.operationId, 41L, it.entityId, duplicate = true) }
        })
        var now = 0L
        store.enqueue(op(), now)
        runSync(store, api, "d", deps(now = { now }))
        now += 5_000L
        val s = runSync(store, api, "d", deps(now = { now }))
        assertEquals(1, s.synced)
        assertEquals(0, store.countPending())
        assertEquals(2, calls)
        // Same idempotency key on both attempts: no double effect possible.
        assertEquals(
            api.pushedBatches[0].single().idempotencyKey,
            api.pushedBatches[1].single().idempotencyKey,
        )
    }

    @Test
    fun `crash recovery resets processing to pending`() = runTest {
        val store = MemorySyncStore()
        store.enqueue(op(), 0L)
        store.markProcessing(store.listDue(0L, 10).map { it.idempotencyKey })
        assertTrue(store.listDue(0L, 10).isEmpty())
        assertEquals(1, store.resetProcessing())
        assertEquals(1, store.listDue(0L, 10).size)
    }

    @Test
    fun `two device pulls merge additively`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi(pullHandler = { _, _ ->
            PullResponse(
                listOf(
                    PulledChange(ChangeKind.LEDGER_ENTRY, "a", 1L, mapOf("amount" to 20)),
                    PulledChange(ChangeKind.LEDGER_ENTRY, "b", 2L, mapOf("amount" to -5)),
                ),
                2L,
            )
        })
        val s = runSync(store, api, "d", deps())
        assertEquals(2, s.pulled)
        assertEquals(2L, s.cursor)
        assertEquals(2, store.listedEntries().size)
    }

    @Test
    fun `malformed pull never moves the cursor`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi(pullHandler = { _, _ -> throw SyncTransportError("html") })
        val s = runSync(store, api, "d", deps())
        assertEquals("html", s.error)
        assertEquals(0L, s.cursor)
        assertEquals(0L, store.getCursor())
    }

    @Test
    fun `unknown results ignored and missing ops retried`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi(pushHandler = { ops ->
            listOf(PushApplied("unknown-op", 9L, "x")) + ops.drop(1).map {
                PushApplied(it.operationId, 10L, it.entityId)
            }
        })
        store.enqueue(op(), 0L)
        store.enqueue(op(), 0L)
        val s = runSync(store, api, "d", deps())
        assertEquals(1, s.synced)
        // The op missing from the response stays pending with backoff.
        assertEquals(1, store.countPending())
    }

    @Test
    fun `second run over synced state pushes nothing`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi()
        store.enqueue(op(), 0L)
        val first = runSync(store, api, "d", deps())
        assertEquals(1, first.synced)
        val second = runSync(store, api, "d", deps())
        assertEquals(0, second.pushed)
        assertEquals(1, api.pushedBatches.size)
    }

    @Test
    fun `enqueue dedupes by idempotency key`() = runTest {
        val store = MemorySyncStore()
        val key = newUuid()
        val a = store.enqueue(op(key = key), 0L)
        val b = store.enqueue(op(key = key), 0L)
        assertEquals(a.operationId, b.operationId)
        assertEquals(1, store.countPending())
    }

    @Test
    fun `large queue drains in batches`() = runTest {
        val store = MemorySyncStore()
        var seq = 0L
        val api = FakeApi(pushHandler = { ops -> ops.map { PushApplied(it.operationId, ++seq, it.entityId) } })
        repeat(55) { store.enqueue(op(), it.toLong()) }
        var total = 0
        repeat(3) { total += runSync(store, api, "d", deps(now = { 0L }, batchSize = 20)).synced }
        assertEquals(55, total)
        assertEquals(0, store.countPending())
        assertEquals(listOf(20, 20, 15), api.pushedBatches.map { it.size })
    }

    @Test
    fun `mixed ledger and stock batch pushes together`() = runTest {
        val store = MemorySyncStore()
        val api = FakeApi()
        store.enqueue(op(entity = EntityTypes.LEDGER_ENTRY, type = OperationTypes.CREATE_TRANSACTION), 0L)
        store.enqueue(op(entity = EntityTypes.STOCK_MOVEMENT, type = OperationTypes.RECORD_MOVEMENT), 1L)
        val s = runSync(store, api, "d", deps())
        assertEquals(2, s.synced)
        assertEquals(2, api.pushedBatches.single().size)
    }
}
