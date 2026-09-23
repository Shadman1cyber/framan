package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.farmancoffeeshop.app.data.local.SyncOperationEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.banner
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.components.SyncBadge
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class SyncScreenViewModel(private val container: AppContainer) : ViewModel() {
    val state = container.sync.uiState
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            try {
                container.sync.runForeground()
            } catch (_: Exception) {
            } finally {
                _refreshing.value = false
            }
        }
        container.sync.requestSync()
    }

    fun retry(key: String) {
        viewModelScope.launch { container.sync.retryFailed(key) }
    }

    fun retryAll() {
        viewModelScope.launch { container.sync.retryAllFailed() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncScreen(container: AppContainer) {
    val vm: SyncScreenViewModel = appViewModel { SyncScreenViewModel(container) }
    val state by vm.state.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                SyncBadge(banner = state.banner(), lastSyncAtMs = state.lastSyncAtMs, onRetry = vm::refresh)
            }
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("وضعیت همگام‌سازی", style = MaterialTheme.typography.titleMedium)
                        Text("اتصال: ${if (state.isOnline) "برقرار" else "قطع"}")
                        Text("در انتظار: ${state.pendingCount}")
                        Text("ناموفق: ${state.failed.size}")
                        Text("آخرین همگام‌سازی موفق: ${state.lastSyncAtMs?.let { TimeUtil.formatAgo(it) } ?: "—"}")
                        if (state.lastError != null) {
                            Text("آخرین خطا: ${state.lastError}", color = MaterialTheme.colorScheme.error)
                        }
                        if (state.authRequired) {
                            Text("نشست نیازمند ورود مجدد است.", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            if (state.failed.isNotEmpty()) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("عملیات ناموفق (حفظ شده، حذف نمی‌شود)", style = MaterialTheme.typography.titleMedium)
                        OutlinedButton(onClick = vm::retryAll) { Text("تلاش مجدد همه") }
                    }
                }
                items(state.failed, key = { it.idempotencyKey }) { op ->
                    FailedOpRow(op, onRetry = { vm.retry(op.idempotencyKey) })
                }
            } else {
                item { Text("عملیات ناموفقی وجود ندارد.") }
            }
            item {
                Button(onClick = vm::refresh, modifier = Modifier.fillMaxWidth()) {
                    Text("همگام‌سازی اکنون")
                }
            }
        }
    }
}

@Composable
fun FailedOpRow(op: SyncOperationEntity, onRetry: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(opDescription(op), style = MaterialTheme.typography.titleSmall)
            Text("تلاش‌ها: ${op.attemptCount}", style = MaterialTheme.typography.bodySmall)
            if (op.lastError != null) {
                Text(op.lastError, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = onRetry) { Text("تلاش مجدد") }
        }
    }
}

fun opDescription(op: SyncOperationEntity): String {
    val kind = when (op.operationType) {
        "CREATE_TRANSACTION" -> "ثبت مالی"
        "REVERSE_TRANSACTION" -> "برگشت سند"
        "CORRECT_TRANSACTION" -> "اصلاح سند"
        "RECORD_MOVEMENT" -> "تحرک انبار"
        else -> op.operationType
    }
    return "$kind • ${TimeUtil.formatAgo(op.createdAtMs)}"
}
