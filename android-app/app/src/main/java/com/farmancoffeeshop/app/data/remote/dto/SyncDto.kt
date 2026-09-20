package com.farmancoffeeshop.app.data.remote.dto

import com.squareup.moshi.Json

/** POST /api/sync/push */
data class PushOpDto(
    @Json(name = "operation_id") val operationId: String,
    @Json(name = "entity_type") val entityType: String,
    @Json(name = "entity_id") val entityId: String,
    @Json(name = "operation_type") val operationType: String,
    val payload: Map<String, Any?>,
    @Json(name = "idempotency_key") val idempotencyKey: String,
    @Json(name = "client_timestamp") val clientTimestamp: String,
)

data class PushRequestDto(
    @Json(name = "device_id") val deviceId: String,
    val operations: List<PushOpDto>,
)

/** One per-operation result; shape depends on `status` (see docs/sync-protocol.md). */
data class PushResultDto(
    @Json(name = "operation_id") val operationId: String,
    val status: String,
    @Json(name = "server_sequence") val serverSequence: Long? = null,
    @Json(name = "entity_id") val entityId: String? = null,
    @Json(name = "entry_id") val entryId: String? = null,
    val duplicate: Boolean? = null,
    val code: String? = null,
    val retryable: Boolean? = null,
    val message: String? = null,
)

data class PushResponseDto(val results: List<PushResultDto>? = null)

/**
 * GET /api/sync/pull. Changes are heterogeneous (ledger_entry |
 * stock_movement); parsed into core PulledChange by the mapper so unknown
 * future kinds can be ignored without breaking.
 */
data class PullResponseDto(
    val changes: List<Map<String, Any?>>? = null,
    @Json(name = "next_cursor") val nextCursor: Long? = null,
)

data class StatusDto(
    val scope: String? = null,
    val cursor: Long? = null,
    @Json(name = "entry_count") val entryCount: Long? = null,
    @Json(name = "movement_count") val movementCount: Long? = null,
    @Json(name = "last_applied_at") val lastAppliedAt: String? = null,
    @Json(name = "server_time") val serverTime: String? = null,
)

/** GET /api/auth/csrf */
data class CsrfDto(@Json(name = "csrfToken") val csrfToken: String? = null)

/** POST /api/auth/callback/credentials with json=true */
data class AuthCallbackDto(
    val url: String? = null,
    val ok: Boolean? = null,
    val status: Int? = null,
    val error: String? = null,
)

/** GET /api/auth/session (next-auth shape + our id/role claims). */
data class SessionUserDto(
    val id: String? = null,
    val name: String? = null,
    val email: String? = null,
    val role: String? = null,
)

data class SessionDto(
    val user: SessionUserDto? = null,
    val expires: String? = null,
)
