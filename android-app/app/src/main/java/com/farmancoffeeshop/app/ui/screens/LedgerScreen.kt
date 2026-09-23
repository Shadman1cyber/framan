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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.farmancoffeeshop.app.data.local.LedgerEntryEntity
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.banner
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.components.SyncBadge
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LedgerViewModel(private val container: AppContainer) : ViewModel() {
    val entries = container.ledger.observeEntries()
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

    fun reverse(id: String) {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                container.ledger.reverseEntry(id)
                container.sync.requestSync()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _busy.value = false
            }
        }
    }

    fun correct(id: String, amount: Long) {
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                container.ledger.correctEntry(id, amount)
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
fun LedgerScreen(container: AppContainer) {
    val vm: LedgerViewModel = appViewModel { LedgerViewModel(container) }
    val entries by vm.entries.collectAsStateWithLifecycle(initialValue = emptyList())
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    var selected by remember { mutableStateOf<LedgerEntryEntity?>(null) }
    var correcting by remember { mutableStateOf<LedgerEntryEntity?>(null) }
    var amountText by remember { mutableStateOf("") }
    var amountError by remember { mutableStateOf<String?>(null) }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                SyncBadge(banner = sync.banner(), lastSyncAtMs = sync.lastSyncAtMs, onRetry = vm::refresh)
            }
            if (error != null) {
                item {
                    Card {
                        Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp))
                    }
                }
            }
            items(entries, key = { it.id }) { e ->
                LedgerRow(e, onReverse = { selected = e }, onCorrect = {
                    correcting = e
                    amountText = e.amount.toString()
                })
            }
        }
    }

    selected?.let { e ->
        AlertDialog(
            onDismissRequest = { selected = null },
            title = { Text("برگشت سند") },
            text = { Text("سند «${entryTypeFa(e.entryType)}» برگشت داده می‌شود (سند جدید، بدون حذف). ادامه می‌دهید؟") },
            confirmButton = {
                Button(onClick = { vm.reverse(e.id); selected = null }) { Text("برگشت") }
            },
            dismissButton = { TextButton(onClick = { selected = null }) { Text("انصراف") } },
        )
    }
    correcting?.let { e ->
        AlertDialog(
            onDismissRequest = { correcting = null; amountError = null; vm.clearError() },
            title = { Text("اصلاح سند") },
            text = {
                Column {
                    Text("مبلغ جدید (تومان):")
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = amountText, onValueChange = { amountText = it; amountError = null },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (amountError != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(amountError!!, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    val amount = amountText.toLongOrNull()
                    if (amount == null) {
                        amountError = "مبلغ معتبر وارد کنید"
                    } else {
                        vm.correct(e.id, amount)
                        correcting = null
                        amountError = null
                    }
                }) { Text("ثبت اصلاح") }
            },
            dismissButton = { TextButton(onClick = { correcting = null; amountError = null }) { Text("انصراف") } },
        )
    }
}

@Composable
fun LedgerRow(e: LedgerEntryEntity, onReverse: () -> Unit, onCorrect: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            EntryRow(e)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onReverse) { Text("برگشت") }
                OutlinedButton(onClick = onCorrect) { Text("اصلاح") }
            }
        }
    }
}
