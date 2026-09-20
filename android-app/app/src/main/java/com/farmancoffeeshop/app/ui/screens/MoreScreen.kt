package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

@Composable
fun MoreScreen(container: AppContainer, nav: NavController) {
    val profile by container.auth.observeProfile().collectAsStateWithLifecycle(initialValue = null)
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("بیشتر", style = MaterialTheme.typography.headlineSmall)
            if (profile != null) {
                Text(
                    "${profile?.name ?: profile?.email ?: ""} • ${roleFa(profile?.role)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        item { MoreRow("منو و محصولات", onClick = { nav.navigate(Routes.CATALOG) }) }
        item { MoreRow("بینش‌های هوشمند", onClick = { nav.navigate(Routes.INSIGHTS) }) }
        item { MoreRow("همگام‌سازی و صف", onClick = { nav.navigate(Routes.SYNC) }) }
        item { MoreRow("تنظیمات", onClick = { nav.navigate(Routes.SETTINGS) }) }
    }
}

@Composable
fun MoreRow(title: String, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Text(title, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)
    }
}

fun roleFa(role: String?): String = when (role) {
    "OWNER" -> "صاحب کافه"
    "CASHIER" -> "صندوق‌دار"
    else -> "مشتری"
}

class SettingsViewModel(private val container: AppContainer) : ViewModel() {
    var serverUrl by mutableStateOf("")
        private set
    private val _saved = MutableStateFlow<String?>(null)
    val saved: StateFlow<String?> = _saved
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    init {
        viewModelScope.launch {
            serverUrl = container.settings.currentServerUrl()
        }
    }

    fun updateServerUrl(v: String) {
        serverUrl = v
        _error.value = null
    }

    fun save() {
        viewModelScope.launch {
            try {
                val normalized = HttpClientFactory.normalizeBaseUrl(serverUrl)
                if (!normalized.startsWith("https://") && !HttpClientFactory.isLocalHost(normalized)) {
                    throw IllegalArgumentException("برای امنیت، فقط اتصال امن (https) مجاز است")
                }
                container.settings.setServerUrl(serverUrl.trim())
                _saved.value = "ذخیره شد"
                container.sync.requestSync()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            container.auth.logout()
            onDone()
        }
    }
}

@Composable
fun SettingsScreen(container: AppContainer) {
    val vm: SettingsViewModel = appViewModel { SettingsViewModel(container) }
    val saved by vm.saved.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    var loggedOut by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("تنظیمات", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = vm.serverUrl, onValueChange = vm::updateServerUrl,
            label = { Text("آدرس سرور") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (!HttpClientFactory.isLocalHost(vm.serverUrl.ifBlank { "x" }) &&
            !vm.serverUrl.trim().startsWith("https://")
        ) {
            Text("هشدار: اتصال ناامن (http) فقط برای شبکه محلی مناسب است.", color = MaterialTheme.colorScheme.error)
        }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        if (saved != null) Text(saved!!, color = MaterialTheme.colorScheme.tertiary)
        Button(onClick = vm::save, modifier = Modifier.fillMaxWidth()) { Text("ذخیره") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { vm.logout { loggedOut = true } }, modifier = Modifier.fillMaxWidth()) {
            Text("خروج از حساب")
        }
        if (loggedOut) {
            Text("خارج شدید. برای ورود دوباره، برنامه را باز کنید.", style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))
        Text("نسخه ۱٫۰ — آفلاین‌محور", style = MaterialTheme.typography.bodySmall)
    }
}
