package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class RecordViewModel(private val container: AppContainer) : ViewModel() {
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error
    private val _saved = MutableStateFlow(0)
    val saved: StateFlow<Int> = _saved

    fun save(kind: String, amount: Long, note: String) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                when (kind) {
                    "sale" -> container.ledger.recordSale(amount, note = note.ifBlank { null })
                    "expense" -> container.ledger.recordExpense(amount, note = note.ifBlank { null })
                }
                _saved.value += 1
                container.sync.requestSync()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _busy.value = false
            }
        }
    }
}

@Composable
fun RecordScreen(container: AppContainer) {
    val vm: RecordViewModel = appViewModel { RecordViewModel(container) }
    var kind by remember { mutableStateOf("sale") }
    var amountText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var amountError by remember { mutableStateOf<String?>(null) }
    val busy by vm.busy.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val saved by vm.saved.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("ثبت سند مالی", style = MaterialTheme.typography.headlineSmall)
        Text(
            "بلافاصله در دفتر محلی ثبت و در صف همگام‌سازی قرار می‌گیرد.",
            style = MaterialTheme.typography.bodyMedium,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = kind == "sale", onClick = { kind = "sale" }, label = { Text("فروش") })
            FilterChip(selected = kind == "expense", onClick = { kind = "expense" }, label = { Text("هزینه") })
        }
        OutlinedTextField(
            value = amountText,
            onValueChange = { amountText = it; amountError = null },
            label = { Text("مبلغ (تومان)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy,
        )
        if (amountError != null) Text(amountError!!, color = MaterialTheme.colorScheme.error)
        OutlinedTextField(
            value = note, onValueChange = { note = it },
            label = { Text("یادداشت (اختیاری)") },
            modifier = Modifier.fillMaxWidth(), enabled = !busy,
        )
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        Button(
            onClick = {
                val amount = amountText.toLongOrNull()
                if (amount == null) {
                    amountError = "مبلغ معتبر وارد کنید"
                } else {
                    vm.save(kind, amount, note)
                    amountText = ""
                    note = ""
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (kind == "sale") "ثبت فروش" else "ثبت هزینه")
        }
        if (saved > 0) {
            Card {
                Text(
                    "$saved سند در این نشست ثبت شد (آفلاین هم ذخیره می‌شود).",
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
    }
}
