package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.data.remote.FarmanApi
import com.farmancoffeeshop.app.data.remote.dto.PushOpDto
import com.farmancoffeeshop.app.data.remote.dto.PushRequestDto
import com.farmancoffeeshop.core.sync.PushApplied
import com.farmancoffeeshop.core.sync.PushOperation
import com.farmancoffeeshop.core.sync.PushRejected
import com.farmancoffeeshop.core.sync.PushResponse
import com.farmancoffeeshop.core.sync.PullResponse
import com.farmancoffeeshop.core.sync.SyncApi
import com.farmancoffeeshop.core.sync.SyncAuthError
import com.farmancoffeeshop.core.sync.SyncTransportError
import retrofit2.HttpException
import java.io.IOException

/**
 * Core SyncApi over Retrofit. Error mapping mirrors the web ApiClient
 * (src/lib/offline/ledger-outbox.ts):
 * - 401 → SyncAuthError (ops stay pending, attempts untouched)
 * - 403 → SyncAuthError with an owner-required message (sync needs OWNER;
 *   a cashier/customer session can never satisfy it — surfaced honestly)
 * - 429 / 5xx / transport → SyncTransportError (retryable with backoff)
 * - malformed bodies → SyncTransportError (cursor never advances on these)
 */
class RetrofitSyncApi(
    private val api: () -> FarmanApi,
) : SyncApi {

    override suspend fun push(deviceId: String, operations: List<PushOperation>): PushResponse {
        val body = runNetwork("push") {
            api().push(PushRequestDto(deviceId, operations.map { it.toDto() }))
        }
        val results = body.results ?: throw SyncTransportError("malformed push response")
        return PushResponse(results.map { r ->
            when (r.status) {
                "applied" -> PushApplied(
                    operationId = r.operationId,
                    serverSequence = r.serverSequence
                        ?: throw SyncTransportError("applied op without server_sequence"),
                    entityId = r.entityId ?: r.entryId ?: "",
                    duplicate = r.duplicate == true,
                )
                "rejected" -> PushRejected(
                    operationId = r.operationId,
                    code = r.code ?: "REJECTED",
                    retryable = r.retryable != false,
                    message = r.message,
                )
                else -> throw SyncTransportError("unknown push status: ${r.status}")
            }
        })
    }

    override suspend fun pull(after: Long, take: Int): PullResponse {
        val body = runNetwork("pull") { api().pull(after, take) }
        val next = body.nextCursor ?: throw SyncTransportError("malformed pull response")
        val changes = body.changes
            ?: throw SyncTransportError("malformed pull response")
        // Unknown future kinds are skipped (nulls filtered), never fatal.
        val parsed = changes.mapNotNull { parsePulledChange(it) }
        return PullResponse(parsed, next)
    }

    private fun PushOperation.toDto(): PushOpDto = PushOpDto(
        operationId = operationId,
        entityType = entityType,
        entityId = entityId,
        operationType = operationType,
        payload = payload,
        idempotencyKey = idempotencyKey,
        clientTimestamp = clientTimestamp,
    )

    private suspend fun <T> runNetwork(what: String, block: suspend () -> T): T {
        try {
            return block()
        } catch (e: SyncAuthError) {
            throw e
        } catch (e: SyncTransportError) {
            throw e
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> throw SyncAuthError("session expired — sign in again")
                403 -> throw SyncAuthError("sync requires an owner account on this server")
                429 -> throw SyncTransportError("rate limited")
                in 500..599 -> throw SyncTransportError("server error ${e.code()}")
                else -> throw SyncTransportError("$what failed: HTTP ${e.code()}")
            }
        } catch (e: IOException) {
            throw SyncTransportError(e.message ?: "network error", e)
        } catch (e: Exception) {
            // JSON/converter failures: retryable, never advance state.
            throw SyncTransportError(e.message ?: "$what failed", e)
        }
    }
}
