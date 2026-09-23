package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.core.sync.ChangeKind
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.NewOperation
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.PushOperation
import com.farmancoffeeshop.core.sync.SyncAuthError
import com.farmancoffeeshop.core.sync.SyncTransportError
import com.farmancoffeeshop.core.sync.newUuid
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Wire-protocol tests against a fake HTTP server (no Android framework).
 * Covers the Phase-16 error matrix for the sync path.
 */
class RetrofitSyncApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: RetrofitSyncApi

    @Before
    fun setup() {
        server = MockWebServer()
        server.start()
        val retrofitApi = HttpClientFactory.api(server.url("/").toString(), HttpClientFactory.client(FakeJar()))
        api = RetrofitSyncApi({ retrofitApi })
    }

    @After
    fun teardown() {
        server.shutdown()
    }

    private fun op(id: String = newUuid()) = PushOperation(
        operationId = id,
        entityType = EntityTypes.LEDGER_ENTRY,
        entityId = newUuid(),
        operationType = OperationTypes.CREATE_TRANSACTION,
        payload = mapOf("entry" to mapOf("amount" to 100)),
        idempotencyKey = newUuid(),
        clientTimestamp = "2026-09-19T08:00:00.000Z",
    )

    @Test
    fun `push maps applied and rejected per operation`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"results":[
                  {"operation_id":"a","status":"applied","server_sequence":7,"entity_id":"e1"},
                  {"operation_id":"b","status":"rejected","code":"VALIDATION_FAILED","retryable":false,"message":"bad"},
                  {"operation_id":"c","status":"rejected","code":"CONFLICT_RETRY","retryable":true}
                ]}""",
            ),
        )
        val res = api.push("d", listOf(op("a"), op("b"), op("c")))
        assertEquals(3, res.results.size)
        val applied = res.results[0] as com.farmancoffeeshop.core.sync.PushApplied
        assertEquals(7L, applied.serverSequence)
        assertEquals("e1", applied.entityId)
        val perm = res.results[1] as com.farmancoffeeshop.core.sync.PushRejected
        assertFalse(perm.retryable)
        val retry = res.results[2] as com.farmancoffeeshop.core.sync.PushRejected
        assertTrue(retry.retryable)
        val sent = server.takeRequest()
        assertTrue(sent.path!!.contains("/api/sync/push"))
        assertEquals("application/json", sent.getHeader("Content-Type")?.substringBefore(";"))
    }

    @Test
    fun `push falls back to entry_id alias`() = runTest {
        server.enqueue(MockResponse().setBody("""{"results":[{"operation_id":"a","status":"applied","server_sequence":3,"entry_id":"e9"}]}"""))
        val res = api.push("d", listOf(op("a")))
        assertEquals("e9", (res.results[0] as com.farmancoffeeshop.core.sync.PushApplied).entityId)
    }

    @Test
    fun `http codes map to engine errors`() = runTest {
        server.enqueue(MockResponse().setResponseCode(401))
        try {
            api.push("d", listOf(op()))
            fail("expected auth error")
        } catch (e: SyncAuthError) {
            // expected
        }
        server.enqueue(MockResponse().setResponseCode(403))
        try {
            api.push("d", listOf(op()))
            fail("expected auth error")
        } catch (e: SyncAuthError) {
            assertTrue(e.message!!.contains("owner"))
        }
        server.enqueue(MockResponse().setResponseCode(500))
        try {
            api.pull(0, 10)
            fail("expected transport error")
        } catch (e: SyncTransportError) {
            // expected
        }
        server.enqueue(MockResponse().setResponseCode(429))
        try {
            api.pull(0, 10)
            fail("expected transport error")
        } catch (e: SyncTransportError) {
            // expected
        }
    }

    @Test
    fun `malformed bodies never advance state`() = runTest {
        server.enqueue(MockResponse().setBody("""{"nope":true}"""))
        try {
            api.push("d", listOf(op()))
            fail("expected transport error")
        } catch (e: SyncTransportError) {
            // expected
        }
        server.enqueue(MockResponse().setBody("""{"changes":[],"next_cursor":null}"""))
        try {
            api.pull(0, 10)
            fail("expected transport error")
        } catch (e: SyncTransportError) {
            // expected
        }
    }

    @Test
    fun `pull parses both kinds and skips unknown futures`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"changes":[
                  {"kind":"ledger_entry","id":"l1","entry_type":"EXPENSE","account_id":"cash","amount":100,"currency":"TOMAN","occurred_at":"2026-09-19T08:00:00.000Z","device_id":"d","reversal_of":null,"server_sequence":1,"server_received_at":null},
                  {"kind":"stock_movement","id":"m1","ingredient_id":"i1","delta":20.5,"reason":"r","occurred_at":"2026-09-19T08:00:00.000Z","device_id":"d","server_sequence":2,"server_received_at":null},
                  {"kind":"future_kind_v99","id":"x","server_sequence":3}
                ],"next_cursor":3}""",
            ),
        )
        val res = api.pull(0, 200)
        assertEquals(3L, res.nextCursor)
        assertEquals(2, res.changes.size)
        assertEquals(ChangeKind.LEDGER_ENTRY, res.changes[0].kind)
        assertEquals(100L, (res.changes[0].data["amount"] as Number).toLong())
        assertEquals(ChangeKind.STOCK_MOVEMENT, res.changes[1].kind)
        assertEquals(20.5, (res.changes[1].data["delta"] as Number).toDouble(), 0.0)
    }

    @Test
    fun `new operation serializes through the real moshi pipeline`() = runTest {
        server.enqueue(MockResponse().setBody("""{"results":[]}"""))
        val newOp = NewOperation(
            entityType = EntityTypes.STOCK_MOVEMENT,
            entityId = "m",
            operationType = OperationTypes.RECORD_MOVEMENT,
            payload = mapOf("movement" to mapOf("delta" to 20.5, "reason" to "خرید")),
            clientTimestamp = "2026-09-19T08:00:00.000Z",
            deviceId = "d",
        )
        // Round-trip through the store payload adapter path is covered in
        // SyncIntegrationTest; here we assert the wire DTO accepts the map.
        api.push(
            "d",
            listOf(
                PushOperation(
                    newOp.operationId, newOp.entityType, newOp.entityId, newOp.operationType,
                    newOp.payload, newOp.idempotencyKey, newOp.clientTimestamp,
                ),
            ),
        )
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains("RECORD_MOVEMENT"))
        assertTrue(sent.contains("خرید"))
    }

    /** Empty in-memory jar: RetrofitSyncApi only needs a CookieJar instance. */
    class FakeJar : okhttp3.CookieJar {
        override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) = Unit
        override fun loadForRequest(url: okhttp3.HttpUrl): List<okhttp3.Cookie> = emptyList()
    }
}
