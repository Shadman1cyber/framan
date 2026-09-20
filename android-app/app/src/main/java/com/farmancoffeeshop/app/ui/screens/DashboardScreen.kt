package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.farmancoffeeshop.app.data.local.LedgerEntryEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.banner
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.components.SyncBadge
import com.farmancoffeeshop.app.ui.toman
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class DashboardState(
    val cashBalance: Long = 0L,
    val revenue: Long = 0L,
    val entryCount: Int = 0,
    val pendingCount: Int = 0,
    val recent: List<LedgerEntryEntity> = emptyList(),
)

class DashboardViewModel(container: AppContainer) : ViewModel() {
    private val ledger = container.ledger
    private val sync = container.sync

    val state: StateFlow<DashboardState> = combine(
        ledger.observeEntries(),
        ledger.observeRecent(8),
        sync.uiState,
    ) { entries, recent, syncState ->
        val balances = entries.groupingBy { it.accountId }.fold(0L) { a, e -> a + e.amount }
        DashboardState(
            cashBalance = balances["cash"] ?: 0L,
            revenue = entries.filter {
                it.entryType == "ORDER_COMPLETED" || it.entryType == "ORDER_CANCELLED"
            }.sumOf { it.amount },
            entryCount = entries.size,
            pendingCount = syncState.pendingCount,
            recent = recent,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardState())

    val syncState = sync.uiState
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            try {
                sync.runForeground()
            } catch (_: Exception) {
            } finally {
                _refreshing.value = false
            }
        }
        sync.requestSync()
    }

    fun retry() = sync.requestSync()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(container: AppContainer) {
    val vm: DashboardViewModel = appViewModel { DashboardViewModel(container) }
    val state by vm.state.collectAsStateWithLifecycle()
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                SyncBadge(banner = sync.banner(), lastSyncAtMs = sync.lastSyncAtMs, onRetry = vm::retry)
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    StatCard("موجودی نقدی", state.cashBalance.toman(), Modifier.weight(1f))
                    StatCard("درآمد", state.revenue.toman(), Modifier.weight(1f))
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                    StatCard("اسناد", "${state.entryCount}", Modifier.weight(1f))
                    StatCard("در انتظار همگام‌سازی", "${state.pendingCount}", Modifier.weight(1f))
                }
            }
            item { Text("تازه‌ترین اسناد", style = MaterialTheme.typography.titleMedium) }
            items(state.recent, key = { it.id }) { e ->
                EntryRow(e)
            }
        }
    }
}

@Composable
fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
fun EntryRow(e: LedgerEntryEntity) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(entryTypeFa(e.entryType), style = MaterialTheme.typography.titleSmall)
                Text(
                    e.amount.toman(),
                    color = if (e.amount >= 0) MaterialTheme.colorScheme.tertiary
                    else MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    if (e.localState == "SYNCED") "همگام شد" else "در انتظار همگام‌سازی",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    TimeUtil.formatIsoAgo(e.occurredAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

fun entryTypeFa(t: String): String = when (t) {
    "ORDER_COMPLETED" -> "فروش"
    "ORDER_CANCELLED" -> "لغو سفارش"
    "EXPENSE" -> "هزینه"
    "REVERSAL" -> "برگشت"
    "CORRECTION" -> "اصلاح"
    else -> t
}
