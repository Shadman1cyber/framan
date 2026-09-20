package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LoginViewModel(private val container: AppContainer) : ViewModel() {
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    var serverUrl by mutableStateOf("")
        private set

    init {
        viewModelScope.launch {
            serverUrl = container.settings.currentServerUrl()
        }
    }

    fun updateServerUrl(v: String) {
        serverUrl = v
        _error.value = null
    }

    fun login(email: String, password: String, onDone: () -> Unit) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            _error.value = null
            try {
                val normalized = HttpClientFactory.normalizeBaseUrl(serverUrl)
                if (!normalized.startsWith("https://") && !HttpClientFactory.isLocalHost(normalized)) {
                    throw IllegalArgumentException("برای امنیت، فقط اتصال امن (https) مجاز است")
                }
                container.settings.setServerUrl(serverUrl.trim())
                container.auth.login(email, password)
                container.sync.requestSync()
                onDone()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _busy.value = false
            }
        }
    }
}

@Composable
fun LoginScreen(container: AppContainer, onDone: () -> Unit) {
    val vm: LoginViewModel = appViewModel { LoginViewModel(container) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val busy by vm.busy.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("کافه فرمان", style = MaterialTheme.typography.headlineLarge)
        Text("ورود مدیر (آفلاین‌محور)", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = vm.serverUrl, onValueChange = vm::updateServerUrl,
            label = { Text("آدرس سرور") }, singleLine = true,
            modifier = Modifier.fillMaxWidth(), enabled = !busy,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = email, onValueChange = { email = it },
            label = { Text("ایمیل") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(), enabled = !busy,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it },
            label = { Text("رمز عبور") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(), enabled = !busy,
        )
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { vm.login(email, password, onDone) },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) CircularProgressIndicator(modifier = Modifier.height(20.dp)) else Text("ورود")
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "ورود اول نیازمند اینترنت است؛ پس از آن آفلاین هم کار می‌کند.",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
