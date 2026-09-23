package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
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
import com.farmancoffeeshop.app.data.local.AiInsightEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class InsightsViewModel(private val container: AppContainer) : ViewModel() {
    val insights = container.ai.observe()
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            _error.value = null
            try {
                container.ai.refresh()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _refreshing.value = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InsightsScreen(container: AppContainer) {
    val vm: InsightsViewModel = appViewModel { InsightsViewModel(container) }
    val insights by vm.insights.collectAsStateWithLifecycle(initialValue = emptyList())
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Text("بینش‌های هوشمند", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "نتایج ذخیره‌شده آفلاین خوانده می‌شود؛ تولید تحلیل جدید فقط آنلاین.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (error != null) {
                item { Card { Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp)) } }
            }
            if (insights.isEmpty()) {
                item {
                    Column {
                        Text("هنوز بینشی ذخیره نشده است.")
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = vm::refresh) { Text("دریافت (آنلاین)") }
                    }
                }
            }
            items(insights, key = { it.id }) { i -> InsightRow(i) }
        }
    }
}

@Composable
fun InsightRow(i: AiInsightEntity) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(i.title, style = MaterialTheme.typography.titleSmall)
            Text(i.body, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${severityFa(i.severity)} • ${TimeUtil.formatIsoAgo(i.createdAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

fun severityFa(s: String): String = when (s) {
    "CRITICAL" -> "بحرانی"
    "WARNING" -> "هشدار"
    else -> "اطلاع"
}
