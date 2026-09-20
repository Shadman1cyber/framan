package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.farmancoffeeshop.app.data.local.StockMovementEntity
import com.farmancoffeeshop.app.data.repository.IngredientLevel
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.banner
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.components.SyncBadge
import com.farmancoffeeshop.app.ui.compact
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class InventoryViewModel(private val container: AppContainer) : ViewModel() {
    val levels = container.stock.observeLevels()
    val recent = container.stock.observeRecentMovements(30)
    val syncState = container.sync.uiState
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error
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

    fun adjust(ingredientId: String, delta: Double, reason: String, allowNegative: Boolean) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                container.stock.recordMovement(ingredientId, delta, reason, allowNegative)
                container.sync.requestSync()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _busy.value = false
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryScreen(container: AppContainer) {
    val vm: InventoryViewModel = appViewModel { InventoryViewModel(container) }
    val levels by vm.levels.collectAsStateWithLifecycle(initialValue = emptyList())
    val recent by vm.recent.collectAsStateWithLifecycle(initialValue = emptyList())
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    var adjusting by remember { mutableStateOf<IngredientLevel?>(null) }
    var historyFor by remember { mutableStateOf<String?>(null) }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                SyncBadge(banner = sync.banner(), lastSyncAtMs = sync.lastSyncAtMs, onRetry = vm::refresh)
            }
            if (error != null) {
                item { Card { Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp)) } }
            }
            item { Text("موجودی انبار", style = MaterialTheme.typography.titleMedium) }
            items(levels, key = { it.ingredient.id }) { level ->
                IngredientRow(level, onAdjust = { adjusting = level }, onHistory = { historyFor = level.ingredient.id })
            }
            item { Text("آخرین تحرکات", style = MaterialTheme.typography.titleMedium) }
            items(recent, key = { it.id }) { m -> MovementRow(m) }
        }
    }

    adjusting?.let { level ->
        AdjustDialog(
            level = level,
            onDismiss = { adjusting = null; vm.clearError() },
            onConfirm = { delta, reason, allow -> vm.adjust(level.ingredient.id, delta, reason, allow); adjusting = null },
        )
    }
    historyFor?.let { id ->
        HistoryDialog(container, id, onDismiss = { historyFor = null })
    }
}

@Composable
fun IngredientRow(level: IngredientLevel, onAdjust: () -> Unit, onHistory: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onHistory)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(level.ingredient.nameFa, style = MaterialTheme.typography.titleSmall)
                Text(
                    "${level.level.compact()} ${unitFa(level.ingredient.unit)}" +
                        (if (level.isLow) " • موجودی کم" else ""),
                    color = if (level.isLow) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            TextButton(onClick = onAdjust) { Text("تعدیل") }
        }
    }
}

@Composable
fun MovementRow(m: StockMovementEntity) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(m.reason, style = MaterialTheme.typography.bodyMedium)
                Text(
                    if (m.localState == "SYNCED") "همگام شد" else "در انتظار",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                (if (m.delta >= 0) "+" else "") + m.delta.compact(),
                color = if (m.delta >= 0) MaterialTheme.colorScheme.tertiary
                else MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
fun AdjustDialog(level: IngredientLevel, onDismiss: () -> Unit, onConfirm: (Double, String, Boolean) -> Unit) {
    var deltaText by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var allow by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }
    var mode by remember { mutableStateOf("in") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("تعدیل: ${level.ingredient.nameFa}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("موجودی فعلی: ${level.level.compact()} ${unitFa(level.ingredient.unit)}")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = mode == "in", onClick = { mode = "in" }, label = { Text("ورود/خرید") })
                    FilterChip(selected = mode == "out", onClick = { mode = "out" }, label = { Text("خروج/مصرف") })
                }
                OutlinedTextField(
                    value = deltaText, onValueChange = { deltaText = it; localError = null },
                    label = { Text("مقدار") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = reason, onValueChange = { reason = it; localError = null },
                    label = { Text("دلیل (حداقل ۳ حرف)") }, modifier = Modifier.fillMaxWidth(),
                )
                if (mode == "out") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = allow, onCheckedChange = { allow = it })
                        Text("کاهش موجودی را تأیید می‌کنم")
                    }
                }
                if (localError != null) Text(localError!!, color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            Button(onClick = {
                val qty = deltaText.toDoubleOrNull()
                if (qty == null || qty == 0.0) {
                    localError = "مقدار معتبر وارد کنید"
                    return@Button
                }
                onConfirm(if (mode == "in") qty else -qty, reason, allow)
            }) { Text("ثبت") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("انصراف") } },
    )
}

@Composable
fun HistoryDialog(container: AppContainer, ingredientId: String, onDismiss: () -> Unit) {
    val history by container.stock.observeHistory(ingredientId)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("سوابق") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(history, key = { it.id }) { m -> MovementRow(m) }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("بستن") } },
    )
}

fun unitFa(unit: String): String = when (unit) {
    "GRAM" -> "گرم"
    "KILOGRAM" -> "کیلوگرم"
    "MILLILITER" -> "میلی‌لیتر"
    "LITER" -> "لیتر"
    "UNIT" -> "عدد"
    else -> unit
}
