package com.farmancoffeeshop.app.data.remote.dto

import com.squareup.moshi.Json

/** GET /api/admin/orders — mirrors iOS FarmanOrder. */
data class OpsOrderDto(
    val id: String = "",
    val status: String = "",
    val statusLabel: String = "",
    val orderType: String = "TAKEAWAY",
    val total: Long = 0L,
    val createdAt: String? = null,
    val customerName: String? = null,
    val itemCount: Int = 0,
    val tableLabel: String? = null,
    val allowedNext: List<String>? = null,
)

data class OrdersEnvelopeDto(val orders: List<OpsOrderDto>? = null)

/** GET /api/admin/analytics — only the fields iOS parses. */
data class AnalyticsDto(
    val summary: AnalyticsSummaryDto? = null,
    val topProducts: List<TopProductDto>? = null,
    val daily: List<DailyDto>? = null,
    val lowStock: List<Any>? = null,
)

data class AnalyticsSummaryDto(
    val revenue: RevenueDto? = null,
    val orders: OrderCountsDto? = null,
)

data class RevenueDto(
    val today: Double? = null,
    val month: Double? = null,
)

data class OrderCountsDto(
    val today: Int? = null,
    val active: Int? = null,
)

data class TopProductDto(
    val name: String = "",
    val quantity: Int = 0,
    val revenue: Double? = null,
)

data class DailyDto(
    val date: String = "",
    val revenue: Double? = null,
    val orders: Int? = null,
)

/** GET /api/admin/mobile/overview — mirrors iOS ManagementRecord. */
data class ManagementRecordDto(
    val id: String = "",
    val title: String = "",
    val subtitle: String = "",
    val value: String? = null,
    val status: String? = null,
    val action: String? = null,
    val enabled: Boolean? = null,
)

data class MobileOverviewDto(
    val modules: Map<String, List<ManagementRecordDto>>? = null,
    val updatedAt: String? = null,
)

data class OverviewActionRequest(
    val action: String,
    val id: String,
    val enabled: Boolean? = null,
    val amount: Double? = null,
    val status: String? = null,
)

data class OverviewActionResponse(val ok: Boolean? = null)

data class OrderStatusRequest(val status: String)

data class OrderStatusResponse(
    val ok: Boolean? = null,
    val status: String? = null,
    val label: String? = null,
)

data class ReservationCreateRequest(
    val tableId: String,
    val customerName: String,
    val customerPhone: String? = null,
    val guests: Int,
    val reservedAt: String,
    val durationMin: Int = 60,
)

data class ReservationCreateResponse(val id: String? = null)

/** POST /api/admin/ai/chat — mirrors iOS askAssistant. */
data class AiChatRequest(
    val question: String,
    val topic: String = "general",
    val sessionId: String? = null,
)

data class AiChatResponse(
    val answer: String? = null,
    val model: String? = null,
    val sessionId: String? = null,
)
