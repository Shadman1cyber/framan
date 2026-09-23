package com.farmancoffeeshop.app

import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.net.URLDecoder
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

/**
 * In-test double of the FARMAN backend implementing the real sync protocol
 * (docs/sync-protocol.md v1.1): idempotent push with replay + key-reuse
 * rejection, sequenced pull, catalog snapshot, NextAuth cookie flow.
 * Used ONLY by tests; production code never sees it.
 */
class FakeFarmanServer {
    val server = MockWebServer()
    val baseUrl: String get() = server.url("/").toString()

    private val seq = AtomicLong(0)
    private val receipts = LinkedHashMap<String, String>() // idempotencyKey -> result JSON
    val ledgerChanges = mutableListOf<Map<String, Any?>>()
    var catalogVersion = 1_000L
    var userRole = "OWNER"
    var requests = mutableListOf<RecordedRequest>()

    fun start() = server.start()

    fun shutdown() = server.shutdown()

    /** Clear protocol state between tests (the server socket stays up). */
    fun reset() {
        receipts.clear()
        ledgerChanges.clear()
        requests.clear()
        catalogVersion = 1_000L
        userRole = "OWNER"
    }

    /** Another device's posting, sequenced like a real accepted write. */
    fun seedLedgerEntry(amount: Long, id: String = "other-${UUID.randomUUID()}"): Long {
        val s = seq.incrementAndGet()
        ledgerChanges.add(
            mapOf(
                "kind" to "ledger_entry",
                "id" to id,
                "entry_type" to "ORDER_COMPLETED",
                "reference_type" to "order",
                "reference_id" to null,
                "account_id" to "cash",
                "amount" to amount,
                "currency" to "TOMAN",
                "occurred_at" to "2026-09-19T08:00:00.000Z",
                "device_id" to "other-device",
                "reversal_of" to null,
                "server_sequence" to s,
                "server_received_at" to "2026-09-19T08:00:01.000Z",
            ),
        )
        return s
    }

    init {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests.add(request)
                val path = request.path!!.substringBefore("?")
                return try {
                    when {
                    path == "/api/auth/csrf" -> json("""{"csrfToken":"test-csrf"}""")
                        .addHeader("Set-Cookie", "next-auth.csrf-token=tok; Path=/")
                    path == "/api/auth/callback/credentials" -> handleLogin(request)
                    path == "/api/auth/session" -> handleSession(request)
                    path == "/api/auth/signout" -> json("{}")
                    path.startsWith("/api/sync/push") -> authed(request) { handlePush(request) }
                    path.startsWith("/api/sync/pull") -> authed(request) { handlePull(request) }
                    path == "/api/sync/status" -> authed(request) { handleStatus() }
                    path == "/api/sync/catalog" -> authed(request) { handleCatalog() }
                    path == "/api/admin/ai/insights" -> authed(request) { handleInsights() }
                    else -> MockResponse().setResponseCode(404)
                    }
                } catch (e: Throwable) {
                    // Surface dispatcher crashes: otherwise MockWebServer drops
                    // the connection and the client only sees a timeout.
                    System.err.println("FakeFarmanServer crash ${request.method} ${request.path}: $e")
                    e.stackTrace.take(8).forEach { System.err.println("  at $it") }
                    throw e
                }
            }
        }
    }

    private fun json(body: String) = MockResponse()
        .setResponseCode(200)
        .addHeader("Content-Type", "application/json")
        .setBody(body)

    private fun form(request: RecordedRequest): Map<String, String> =
        request.body.readUtf8().split("&").mapNotNull {
            val i = it.indexOf("=")
            if (i < 0) null else URLDecoder.decode(it.substring(0, i), "UTF-8") to
                URLDecoder.decode(it.substring(i + 1), "UTF-8")
        }.toMap()

    private fun hasSession(request: RecordedRequest): Boolean =
        (request.getHeader("Cookie") ?: "").contains("next-auth.session-token=test-session")

    private fun authed(request: RecordedRequest, block: () -> MockResponse): MockResponse =
        if (hasSession(request)) block() else MockResponse().setResponseCode(401)

    private fun handleLogin(request: RecordedRequest): MockResponse {
        val fields = form(request)
        if (fields["csrfToken"].isNullOrBlank() || fields["json"] != "true") {
            return MockResponse().setResponseCode(400)
        }
        return if (fields["password"] == "correct") {
            json("""{"url":"${baseUrl}"}""")
                .addHeader("Set-Cookie", "next-auth.session-token=test-session; Path=/; HttpOnly")
        } else {
            json("""{"error":"CredentialsSignin","url":"${baseUrl}error?error=CredentialsSignin"}""")
        }
    }

    private fun handleSession(request: RecordedRequest): MockResponse =
        if (hasSession(request)) {
            json("""{"user":{"id":"owner-1","name":"Owner","email":"admin@farmans.cafe","role":"$userRole"},"expires":"2030-01-01T00:00:00.000Z"}""")
        } else {
            json("{}")
        }

    @Suppress("UNCHECKED_CAST")
    private fun handlePush(request: RecordedRequest): MockResponse {
        val body = request.body.readUtf8()
        // Minimal JSON parsing without extra deps: extract operations array items.
        val ops = extractOps(body)
        val results = ops.map { op ->
            val key = op["idempotency_key"] as String
            // Replay returns the STORED verdict: applied replays carry
            // duplicate:true; rejections replay verbatim (still permanent).
            receipts[key]?.let { prev ->
                return@map if (prev.contains("\"status\":\"applied\"")) {
                    "{\"operation_id\":\"${op["operation_id"]}\",\"status\":\"applied\",\"server_sequence\":${extractSeq(prev)},\"entity_id\":\"${extractEntity(prev)}\",\"duplicate\":true}"
                } else {
                    prev
                }
            }
            val entityType = op["entity_type"] as String
            val operationType = op["operation_type"] as String
            val payload = op["payload"] as Map<String, Any?>
            val verdict: String = when {
                entityType == "ledger_entry" && operationType == "CREATE_TRANSACTION" -> {
                    val entry = payload["entry"] as Map<String, Any?>
                    val amount = (entry["amount"] as Number).toLong()
                    if (amount == 0L) {
                        "{\"operation_id\":\"${op["operation_id"]}\",\"status\":\"rejected\",\"code\":\"INVALID_AMOUNT\",\"retryable\":false,\"message\":\"bad amount\"}"
                    } else {
                        applyLedger(entry, op["operation_id"] as String)
                    }
                }
                entityType == "ledger_entry" && operationType == "REVERSE_TRANSACTION" -> {
                    val target = payload["reversalOf"] as String
                    applyLedger(
                        mapOf(
                            "id" to "server-rev-${UUID.randomUUID()}",
                            "entryType" to "REVERSAL",
                            "referenceType" to "order",
                            "referenceId" to null,
                            "accountId" to "cash",
                            "amount" to -(findAmount(target) ?: 0L),
                            "currency" to "TOMAN",
                            "occurredAt" to "2026-09-19T08:00:00.000Z",
                            "deviceId" to "server",
                            "reversalOf" to target,
                        ),
                        op["operation_id"] as String,
                    )
                }
                entityType == "ledger_entry" && operationType == "CORRECT_TRANSACTION" -> {
                    val target = payload["reversalOf"] as String
                    val entry = payload["entry"] as Map<String, Any?>
                    applyLedger(
                        mapOf(
                            "id" to "server-rev-${UUID.randomUUID()}",
                            "entryType" to "REVERSAL",
                            "referenceType" to "order",
                            "referenceId" to null,
                            "accountId" to "cash",
                            "amount" to -(findAmount(target) ?: 0L),
                            "currency" to "TOMAN",
                            "occurredAt" to "2026-09-19T08:00:00.000Z",
                            "deviceId" to "server",
                            "reversalOf" to target,
                        ),
                        op["operation_id"] as String,
                    )
                    // Correction row keeps the client id (natural upsert).
                    applyLedger(
                        entry + ("entryType" to "CORRECTION"),
                        op["operation_id"] as String,
                    )
                }
                entityType == "stock_movement" && operationType == "RECORD_MOVEMENT" -> {
                    val m = payload["movement"] as Map<String, Any?>
                    val delta = (m["delta"] as Number).toDouble()
                    if (delta == 0.0) {
                        """{"operation_id":"${op["operation_id"]}","status":"rejected","code":"VALIDATION_FAILED","retryable":false,"message":"bad delta"}"""
                    } else {
                        val s = seq.incrementAndGet()
                        val row = mapOf(
                            "kind" to "stock_movement",
                            "id" to m["id"],
                            "ingredient_id" to m["ingredientId"],
                            "delta" to delta,
                            "reason" to m["reason"],
                            "occurred_at" to m["occurredAt"],
                            "device_id" to m["deviceId"],
                            "server_sequence" to s,
                            "server_received_at" to "2026-09-19T08:00:01.000Z",
                        )
                        ledgerChanges.add(row)
                        """{"operation_id":"${op["operation_id"]}","status":"applied","server_sequence":$s,"entity_id":"${m["id"]}"}"""
                    }
                }
                else -> """{"operation_id":"${op["operation_id"]}","status":"rejected","code":"VALIDATION_FAILED","retryable":false,"message":"unsupported"}"""
            }
            receipts[key] = verdict
            verdict
        }
        return json("""{"results":[${results.joinToString(",")}]}""")
    }

    private fun applyLedger(entry: Map<String, Any?>, operationId: String): String {
        val s = seq.incrementAndGet()
        val row = mapOf(
            "kind" to "ledger_entry",
            "id" to entry["id"],
            "entry_type" to entry["entryType"],
            "reference_type" to (entry["referenceType"] ?: "order"),
            "reference_id" to entry["referenceId"],
            "account_id" to (entry["accountId"] ?: "cash"),
            "amount" to (entry["amount"] as Number).toLong(),
            "currency" to "TOMAN",
            "occurred_at" to entry["occurredAt"],
            "device_id" to entry["deviceId"],
            "reversal_of" to entry["reversalOf"],
            "server_sequence" to s,
            "server_received_at" to "2026-09-19T08:00:01.000Z",
        )
        ledgerChanges.add(row)
        return "{\"operation_id\":\"$operationId\",\"status\":\"applied\",\"server_sequence\":$s,\"entity_id\":\"${entry["id"]}\"}"
    }

    private fun findAmount(id: String): Long? =
        (ledgerChanges.firstOrNull { it["kind"] == "ledger_entry" && it["id"] == id }?.get("amount") as? Number)?.toLong()

    private fun extractSeq(prev: String): Long =
        """"server_sequence":(\d+)""".toRegex().find(prev)?.groupValues?.get(1)?.toLong() ?: 0L

    private fun extractEntity(prev: String): String =
        """"entity_id":"([^"]+)"""".toRegex().find(prev)?.groupValues?.get(1) ?: ""

    private fun handlePull(request: RecordedRequest): MockResponse {
        val query = request.path!!.substringAfter("?", "")
        val after = query.split("&").firstOrNull { it.startsWith("after=") }
            ?.substringAfter("=")?.toLongOrNull() ?: 0L
        val take = query.split("&").firstOrNull { it.startsWith("take=") }
            ?.substringAfter("=")?.toIntOrNull()?.coerceIn(1, 500) ?: 200
        val rows = ledgerChanges.filter { (it["server_sequence"] as Long) > after }.take(take)
        val next = rows.maxOfOrNull { it["server_sequence"] as Long } ?: after
        return json("""{"changes":[${rows.joinToString(",") { toJson(it) }}],"next_cursor":$next}""")
    }

    private fun handleStatus(): MockResponse {
        val cursor = ledgerChanges.maxOfOrNull { it["server_sequence"] as Long } ?: 0L
        val entries = ledgerChanges.count { it["kind"] == "ledger_entry" }
        val moves = ledgerChanges.count { it["kind"] == "stock_movement" }
        return json("""{"scope":"test","cursor":$cursor,"entry_count":$entries,"movement_count":$moves,"last_applied_at":null,"server_time":"2026-09-19T08:00:00.000Z"}""")
    }

    private fun handleCatalog(): MockResponse = json(
        """{"version":$catalogVersion,"server_time":"2026-09-19T08:00:00.000Z",
        "categories":[{"id":"c1","slug":"hot","name_fa":"نوشیدنی گرم","name_en":null,"icon":null,"is_active":true,"sort_order":0}],
        "products":[{"id":"p1","slug":"espresso","name_fa":"اسپرسو","name_en":null,"description":"-","price":50000,"image":null,"category_id":"c1","is_available":true,"is_featured":false,"sort_order":0,"allergen_status":"FREE","prep_base_min":3,"updated_at":"2026-09-19T08:00:00.000Z","coffee_lines":[]}],
        "ingredients":[{"id":"i1","name_fa":"قهوه","name_en":null,"unit":"GRAM","stock_quantity":100.0,"min_quantity":10.0,"cost_per_unit":null,"supplier":null,"is_active":true,"updated_at":"2026-09-19T08:00:00.000Z"}],
        "coffee_lines":[],"staff":[],"tables":[]}""",
    )

    private fun handleInsights(): MockResponse = json(
        """{"insights":[{"id":"ins1","kind":"INVENTORY","severity":"WARNING","title":"موجودی کم","body":"قهوه رو به اتمام است","createdAt":"2026-09-19T08:00:00.000Z"}]}""",
    )

    private fun toJson(map: Map<String, Any?>): String = buildString {
        append("{")
        append(
            map.entries.joinToString(",") { (k, v) ->
                "\"$k\":" + when (v) {
                    null -> "null"
                    is String -> "\"${v.replace("\"", "\\\"")}\""
                    is Number, is Boolean -> v.toString()
                    else -> "\"$v\""
                }
            },
        )
        append("}")
    }

    // --- crude JSON extraction (test-only; shapes are fixed) ---
    private fun extractOps(body: String): List<Map<String, Any?>> {
        val opsBody = body.substringAfter("\"operations\":[").substringBeforeLast("]")
        return splitTopLevel(opsBody).map { parseOp(it) }
    }

    private fun splitTopLevel(s: String): List<String> {
        val out = mutableListOf<String>()
        var depth = 0
        var inStr = false
        var esc = false
        var cur = StringBuilder()
        for (ch in s) {
            if (inStr) {
                cur.append(ch)
                if (esc) esc = false else if (ch == '\\') esc = true else if (ch == '"') inStr = false
            } else {
                when (ch) {
                    '"' -> { inStr = true; cur.append(ch) }
                    '{', '[' -> { depth++; cur.append(ch) }
                    '}', ']' -> { depth--; cur.append(ch) }
                    ',' -> if (depth == 0) {
                        if (cur.isNotBlank()) out.add(cur.toString())
                        cur = StringBuilder()
                    } else cur.append(ch)
                    else -> cur.append(ch)
                }
            }
        }
        if (cur.isNotBlank()) out.add(cur.toString())
        return out
    }

    private fun parseOp(json: String): Map<String, Any?> {
        fun str(key: String): String =
            """"$key"\s*:\s*"((?:[^"\\]|\\.)*)"""".toRegex().find(json)?.groupValues?.get(1) ?: ""
        val payloadRaw = json.substringAfter("\"payload\":")
        return mapOf(
            "operation_id" to str("operation_id"),
            "entity_type" to str("entity_type"),
            "entity_id" to str("entity_id"),
            "operation_type" to str("operation_type"),
            "idempotency_key" to str("idempotency_key"),
            "payload" to parsePayload(payloadRaw),
        )
    }

    private fun parsePayload(raw: String): Map<String, Any?> {
        val entryRaw = raw.substringAfter("\"entry\":", missingDelimiterValue = "")
        val movRaw = raw.substringAfter("\"movement\":", missingDelimiterValue = "")
        val num = { s: String, k: String -> """"$k"\s*:\s*(-?\d+(?:\.\d+)?)""".toRegex().find(s)?.groupValues?.get(1) }
        val str = { s: String, k: String -> """"$k"\s*:\s*"((?:[^"\\]|\\.)*)"""".toRegex().find(s)?.groupValues?.get(1) }
        val bool = { s: String, k: String -> """"$k"\s*:\s*(true|false)""".toRegex().find(s)?.groupValues?.get(1) == "true" }
        val nul = { s: String, k: String -> """"$k"\s*:\s*null""".toRegex().containsMatchIn(s) }
        return when {
            entryRaw.isNotEmpty() -> mapOf(
                "entry" to mapOf(
                    "id" to str(entryRaw, "id"),
                    "entryType" to str(entryRaw, "entryType"),
                    "referenceType" to str(entryRaw, "referenceType"),
                    "referenceId" to if (nul(entryRaw, "referenceId")) null else str(entryRaw, "referenceId"),
                    "accountId" to str(entryRaw, "accountId"),
                    "amount" to (num(entryRaw, "amount")?.toDouble()?.toLong() ?: 0L),
                    "occurredAt" to str(entryRaw, "occurredAt"),
                    "deviceId" to str(entryRaw, "deviceId"),
                    "reversalOf" to null,
                ),
                "reversalOf" to if (raw.contains("\"reversalOf\"")) str(raw, "reversalOf") else null,
                "deviceId" to str(raw, "deviceId"),
            )
            movRaw.isNotEmpty() -> mapOf(
                "movement" to mapOf(
                    "id" to str(movRaw, "id"),
                    "ingredientId" to str(movRaw, "ingredientId"),
                    "delta" to (num(movRaw, "delta")?.toDouble() ?: 0.0),
                    "reason" to str(movRaw, "reason"),
                    "occurredAt" to str(movRaw, "occurredAt"),
                    "deviceId" to str(movRaw, "deviceId"),
                ),
            )
            else -> mapOf(
                "reversalOf" to str(raw, "reversalOf"),
                "deviceId" to str(raw, "deviceId"),
            )
        }
    }
}
