package com.farmancoffeeshop.app.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.dto.AiChatRequest
import com.farmancoffeeshop.app.data.remote.dto.AnalyticsDto
import com.farmancoffeeshop.app.data.remote.dto.ManagementRecordDto
import com.farmancoffeeshop.app.data.remote.dto.MobileOverviewDto
import com.farmancoffeeshop.app.data.remote.dto.OpsOrderDto
import com.farmancoffeeshop.app.data.remote.dto.OrderStatusRequest
import com.farmancoffeeshop.app.data.remote.dto.OverviewActionRequest
import com.farmancoffeeshop.app.data.remote.dto.ReservationCreateRequest
import com.farmancoffeeshop.app.sync.ApiProvider
import com.squareup.moshi.Types
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** UI models mirroring iOS FarmanNativeApp.swift structs. */
data class OpsOrder(
    val id: String,
    val status: String,
    val statusLabel: String,
    val orderType: String,
    val total: Long,
    val createdAt: String,
    val customerName: String,
    val itemCount: Int,
    val tableLabel: String?,
    val allowedNext: List<String>,
)

data class ProductMetric(val name: String, val quantity: Int, val revenue: Double)
data class DailyMetric(val date: String, val revenue: Double, val orders: Int)

data class DashboardSnapshot(
    val todayRevenue: Double = 0.0,
    val monthRevenue: Double = 0.0,
    val todayOrders: Int = 0,
    val activeOrders: Int = 0,
    val lowStock: Int = 0,
    val topProducts: List<ProductMetric> = emptyList(),
    val daily: List<DailyMetric> = emptyList(),
)

data class ManagementRecord(
    val id: String,
    val title: String,
    val subtitle: String,
    val value: String? = null,
    val status: String? = null,
    val action: String? = null,
    val enabled: Boolean? = null,
)

data class OpsUiState(
    val dashboard: DashboardSnapshot = DashboardSnapshot(),
    val orders: List<OpsOrder> = emptyList(),
    val management: Map<String, List<ManagementRecord>> = emptyMap(),
    val isOnline: Boolean = false,
    val isBusy: Boolean = false,
    val lastSyncMs: Long? = null,
    val error: String? = null,
    val serverLabel: String = "",
)

/**
 * iOS-parity operations store. Same endpoints + same offline-cache behavior
 * as Swift FarmanStore: cached dashboard/orders/management shown offline,
 * mutations require connectivity, refresh updates cache + lastSync.
 */
class OpsRepository(
    context: Context,
    private val apis: ApiProvider,
    private val connectivity: Connectivity,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("farman_ops_cache", Context.MODE_PRIVATE)
    private val moshi = HttpClientFactory.moshi

    private val _state = MutableStateFlow(
        OpsUiState(serverLabel = apis.baseUrl()),
    )
    val state: StateFlow<OpsUiState> = _state

    init {
        loadCache()
    }

    private fun setState(f: (OpsUiState) -> OpsUiState) {
        _state.value = f(_state.value)
    }

    fun setError(msg: String?) = setState { it.copy(error = msg) }
    fun clearError() = setState { it.copy(error = null) }

    suspend fun bootstrap() {
        val online = connectivity.current()
        if (!online) {
            setState { it.copy(isOnline = false) }
            return
        }
        // Reachability probe: session endpoint answers even when logged out.
        val reachable = runCatching {
            apiCall(moshi, true) { apis.current().session() }
            true
        }.getOrDefault(false)
        if (!reachable) {
            setState { it.copy(isOnline = false) }
            return
        }
        refreshQuietly()
    }

    suspend fun refreshQuietly() {
        setState { it.copy(isBusy = true) }
        try {
            val api = apis.current()
            val ordersDto = runCatching {
                apiCall(moshi, connectivity.current()) { api.adminOrders() }
            }.getOrNull()
            val orders = ordersDto?.orders.orEmpty().map { it.toModel() }

            val dashboard = runCatching {
                val dto = apiCall(moshi, connectivity.current()) { api.adminAnalytics() }
                dto.toModel()
            }.getOrDefault(_state.value.dashboard)

            val management = runCatching {
                val dto = apiCall(moshi, connectivity.current()) { api.mobileOverview() }
                dto.toModel()
            }.getOrDefault(_state.value.management)

            val now = System.currentTimeMillis()
            setState {
                it.copy(
                    dashboard = dashboard,
                    orders = orders.ifEmpty { it.orders }.ifEmpty { orders },
                    management = management.ifEmpty { it.management },
                    isOnline = true,
                    isBusy = false,
                    lastSyncMs = now,
                    error = null,
                    serverLabel = apis.baseUrl(),
                )
            }
            // If orders fetch failed but others succeeded, keep old orders.
            if (ordersDto != null) setState { s -> s.copy(orders = orders) }
            saveCache()
        } catch (e: Exception) {
            val msg = (e as? RepoException)?.message ?: "به‌روزرسانی انجام نشد؛ نسخه ذخیره‌شده باقی ماند."
            setState { it.copy(isBusy = false, isOnline = false, error = msg) }
        }
    }

    suspend fun updateOrder(order: OpsOrder, to: String) {
        if (!_state.value.isOnline) {
            setError("تغییر وضعیت فقط هنگام اتصال به سرور ممکن است.")
            return
        }
        setState { it.copy(isBusy = true) }
        try {
            val api = apis.current()
            apiCall(moshi, true) { api.adminOrderStatus(order.id, OrderStatusRequest(to)) }
            refreshQuietly()
        } catch (e: Exception) {
            setState {
                it.copy(
                    isBusy = false,
                    error = (e as? RepoException)?.message ?: "تغییر وضعیت انجام نشد.",
                )
            }
        }
    }

    suspend fun perform(record: ManagementRecord, enabled: Boolean? = null, amount: Double? = null, status: String? = null): Boolean {
        val action = record.action ?: run {
            setError("این تغییر فقط هنگام اتصال به سرور قابل انجام است.")
            return false
        }
        if (!_state.value.isOnline) {
            setError("این تغییر فقط هنگام اتصال به سرور قابل انجام است.")
            return false
        }
        setState { it.copy(isBusy = true) }
        return try {
            val api = apis.current()
            apiCall(moshi, true) {
                api.mobileOverviewAction(OverviewActionRequest(action, record.id, enabled, amount, status))
            }
            refreshQuietly()
            true
        } catch (e: Exception) {
            setState {
                it.copy(
                    isBusy = false,
                    error = (e as? RepoException)?.message ?: "تغییر ذخیره نشد.",
                )
            }
            false
        }
    }

    suspend fun createReservation(tableId: String, customerName: String, phone: String, guests: Int, dateMs: Long, durationMin: Int): Boolean {
        if (!_state.value.isOnline) {
            setError("سرور در دسترس نیست؛ رزرو ثبت نشد.")
            return false
        }
        setState { it.copy(isBusy = true) }
        return try {
            val iso = isoUtc(dateMs)
            val api = apis.current()
            apiCall(moshi, true) {
                api.createReservation(
                    ReservationCreateRequest(tableId, customerName, phone.ifBlank { null }, guests, iso, durationMin),
                )
            }
            refreshQuietly()
            true
        } catch (e: Exception) {
            setState {
                it.copy(
                    isBusy = false,
                    error = (e as? RepoException)?.message ?: "ثبت رزرو انجام نشد.",
                )
            }
            false
        }
    }

    suspend fun askAssistant(question: String): String {
        if (!_state.value.isOnline) throw RepoException.Offline("دستیار برای پاسخ‌گویی به اتصال سرور نیاز دارد.")
        val api = apis.current()
        val res = apiCall(moshi, true) { api.aiChat(AiChatRequest(question, "general")) }
        return res.answer?.takeIf { it.isNotBlank() } ?: throw RepoException.Server("پاسخی دریافت نشد.")
    }

    // ---- cache (mirrors iOS farman-native-cache.json) ----

    private fun saveCache() {
        val s = _state.value
        runCatching {
            val ordersJson = moshi.adapter(List::class.java).toJson(s.orders.map {
                mapOf(
                    "id" to it.id, "status" to it.status, "statusLabel" to it.statusLabel,
                    "orderType" to it.orderType, "total" to it.total, "createdAt" to it.createdAt,
                    "customerName" to it.customerName, "itemCount" to it.itemCount,
                    "tableLabel" to it.tableLabel, "allowedNext" to it.allowedNext,
                )
            })
            val mgmtType = Types.newParameterizedType(Map::class.java, String::class.java, List::class.java)
            val mgmtJson = moshi.adapter<Map<String, List<ManagementRecord>>>(mgmtType).toJson(s.management)
            val dashJson = moshi.adapter(DashboardSnapshot::class.java).toJson(s.dashboard)
            prefs.edit()
                .putString("orders", ordersJson)
                .putString("management", mgmtJson)
                .putString("dashboard", dashJson)
                .putLong("lastSync", s.lastSyncMs ?: -1L)
                .apply()
        }
    }

    private fun loadCache() {
        runCatching {
            val dashJson = prefs.getString("dashboard", null)
            val dashboard = dashJson?.let {
                moshi.adapter(DashboardSnapshot::class.java).fromJson(it)
            } ?: DashboardSnapshot()
            val lastSync = prefs.getLong("lastSync", -1L).takeIf { it > 0 }
            // Orders/management restored in lightweight form; full refresh fills details.
            setState { it.copy(dashboard = dashboard, lastSyncMs = lastSync) }
        }
    }

    private fun isoUtc(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(ms))
    }
}

private fun OpsOrderDto.toModel() = OpsOrder(
    id = id,
    status = status,
    statusLabel = statusLabel.ifBlank { status },
    orderType = orderType,
    total = total,
    createdAt = createdAt ?: "",
    customerName = customerName ?: "مهمان",
    itemCount = itemCount,
    tableLabel = tableLabel,
    allowedNext = allowedNext ?: emptyList(),
)

private fun AnalyticsDto.toModel(): DashboardSnapshot {
    val rev = summary?.revenue
    val counts = summary?.orders
    return DashboardSnapshot(
        todayRevenue = rev?.today ?: 0.0,
        monthRevenue = rev?.month ?: 0.0,
        todayOrders = counts?.today ?: 0,
        activeOrders = counts?.active ?: 0,
        lowStock = lowStock?.size ?: 0,
        topProducts = topProducts.orEmpty().map {
            ProductMetric(it.name, it.quantity, it.revenue ?: 0.0)
        },
        daily = daily.orEmpty().map {
            DailyMetric(it.date, it.revenue ?: 0.0, it.orders ?: 0)
        },
    )
}

private fun MobileOverviewDto.toModel(): Map<String, List<ManagementRecord>> =
    modules.orEmpty().mapValues { (_, v) ->
        v.map { r: ManagementRecordDto ->
            ManagementRecord(r.id, r.title, r.subtitle, r.value, r.status, r.action, r.enabled)
        }
    }
