package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.ios.ScreenBackground
import com.farmancoffeeshop.app.ui.theme.FarmanBackground
import com.farmancoffeeshop.app.ui.theme.FarmanBorder
import com.farmancoffeeshop.app.ui.theme.FarmanOlive
import com.farmancoffeeshop.app.ui.theme.FarmanRaised
import com.farmancoffeeshop.app.ui.theme.FarmanSecondary
import com.farmancoffeeshop.app.ui.theme.FarmanSurface
import com.farmancoffeeshop.app.ui.theme.FarmanText
import com.farmancoffeeshop.app.ui.theme.FarmanWine
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
                container.ops.bootstrap()
                onDone()
            } catch (e: Exception) {
                _error.value = userMessage(e)
            } finally {
                _busy.value = false
            }
        }
    }
}

/** Mirrors iOS LoginView: cup badge, فرمان title, card with fields, olive CTA. */
@Composable
fun LoginScreen(container: AppContainer, onDone: () -> Unit) {
    val vm: LoginViewModel = appViewModel { LoginViewModel(container) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val busy by vm.busy.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val online by container.sync.uiState.collectAsStateWithLifecycle()

    ScreenBackground {
        Box(Modifier.fillMaxSize()) {
            // Soft olive glow top (like iOS Circle offset).
            Box(
                Modifier.size(360.dp)
                    .align(Alignment.TopStart)
                    .padding(end = 150.dp, top = 0.dp),
            )
            Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.size(96.dp).clip(CircleShape).background(FarmanRaised),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("☕", fontSize = 52.sp)
                }
                Spacer(Modifier.height(16.dp))
                Text("فرمان", fontSize = 36.sp, fontWeight = FontWeight.Black, color = FarmanText)
                Text("مدیریت کافه، حتی وقتی اینترنت نیست", color = FarmanSecondary, fontSize = 14.sp)
                Spacer(Modifier.height(24.dp))
                Surface(
                    shape = RoundedCornerShape(24.dp),
                    color = FarmanSurface,
                    border = androidx.compose.foundation.BorderStroke(1.dp, FarmanBorder),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        NativeField("آدرس سرور", "🌐", vm.serverUrl, vm::updateServerUrl, false, !busy)
                        NativeField("ایمیل", "✉️", email, { email = it }, false, !busy, KeyboardType.Email)
                        NativeField("رمز عبور", "🔒", password, { password = it }, true, !busy, KeyboardType.Password)
                        if (error != null) {
                            Text(error!!, color = FarmanWine, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                        }
                        Button(
                            onClick = { vm.login(email, password, onDone) },
                            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                        ) {
                            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = FarmanBackground)
                            else Text("ورود به پنل", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (online.isOnline) FarmanOlive else FarmanWine))
                    Text(
                        if (online.isOnline) "سرور آماده است" else "ورود نیازمند اتصال به سرور است",
                        fontSize = 12.sp,
                        color = FarmanSecondary,
                    )
                }
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun NativeField(
    title: String,
    icon: String,
    value: String,
    onChange: (String) -> Unit,
    secure: Boolean,
    enabled: Boolean,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(FarmanRaised)
            .padding(horizontal = 14.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(icon, fontSize = 16.sp, color = FarmanOlive)
        Spacer(Modifier.size(8.dp))
        TextField(
            value = value,
            onValueChange = onChange,
            placeholder = { Text(title, color = FarmanSecondary) },
            singleLine = true,
            enabled = enabled,
            visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedTextColor = FarmanText,
                unfocusedTextColor = FarmanText,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.weight(1f),
        )
    }
}
