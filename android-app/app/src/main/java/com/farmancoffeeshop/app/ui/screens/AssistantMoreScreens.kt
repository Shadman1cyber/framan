package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.ios.EmptyInline
import com.farmancoffeeshop.app.ui.ios.FarmanCard
import com.farmancoffeeshop.app.ui.ios.OfflineBanner
import com.farmancoffeeshop.app.ui.ios.ScreenBackground
import com.farmancoffeeshop.app.ui.ios.faNumber
import com.farmancoffeeshop.app.ui.ios.money
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.theme.FarmanBackground
import com.farmancoffeeshop.app.ui.theme.FarmanBorder
import com.farmancoffeeshop.app.ui.theme.FarmanOlive
import com.farmancoffeeshop.app.ui.theme.FarmanRaised
import com.farmancoffeeshop.app.ui.theme.FarmanSecondary
import com.farmancoffeeshop.app.ui.theme.FarmanSurface
import com.farmancoffeeshop.app.ui.theme.FarmanText
import com.farmancoffeeshop.app.ui.theme.FarmanWarning
import com.farmancoffeeshop.app.ui.theme.FarmanWine
import com.farmancoffeeshop.app.ui.userMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// ---------------- Assistant (mirrors iOS AssistantView) ----------------

data class ChatMessage(val text: String, val isUser: Boolean)

class AssistantViewModel(private val container: AppContainer) : ViewModel() {
    val ops = container.ops.state
    var messages = mutableStateOf(
        listOf(ChatMessage("سلام! درباره فروش، موجودی یا عملیات کافه از من بپرس.", false)),
    )
        private set
    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending

    fun clear() {
        messages.value = messages.value.take(1)
    }

    fun send(input: String) {
        val text = input.trim()
        if (text.isEmpty() || _sending.value) return
        messages.value = messages.value + ChatMessage(text, true)
        _sending.value = true
        viewModelScope.launch {
            try {
                val answer = container.ops.askAssistant(text)
                messages.value = messages.value + ChatMessage(answer, false)
            } catch (e: Exception) {
                messages.value = messages.value + ChatMessage(userMessage(e), false)
            } finally {
                _sending.value = false
            }
        }
    }
}

@Composable
fun AssistantScreen(container: AppContainer) {
    val vm: AssistantViewModel = appViewModel { AssistantViewModel(container) }
    val s by vm.ops.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    var question by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(vm.messages.value.size) {
        if (vm.messages.value.isNotEmpty()) listState.animateScrollToItem(vm.messages.value.size - 1)
    }
    LaunchedEffect(Unit) { container.ops.bootstrap() }

    ScreenBackground {
        Column(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (!s.isOnline) {
                    item { OfflineBanner(s.lastSyncMs) }
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(46.dp).clip(RoundedCornerShape(14.dp)).background(FarmanSurface)
                                .clickable { vm.clear() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("🕘", fontSize = 20.sp)
                        }
                        Spacer(Modifier.weight(1f))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("دستیار فرمان", fontSize = 26.sp, fontWeight = FontWeight.Black, color = FarmanText)
                            Text(
                                if (s.isOnline) "🔒 اطلاعات شما امن است" else "حالت آفلاین",
                                color = if (s.isOnline) FarmanOlive else FarmanWine,
                                fontSize = 12.sp,
                            )
                        }
                        Spacer(Modifier.weight(1f))
                        Box(
                            Modifier.size(52.dp).clip(CircleShape).background(FarmanRaised),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("☕", fontSize = 24.sp)
                        }
                    }
                }
                item {
                    Box(
                        Modifier.clip(CircleShape).background(FarmanSurface).padding(horizontal = 24.dp, vertical = 10.dp),
                    ) {
                        Text("امروز • کافه فرمان", color = FarmanText, fontSize = 13.sp)
                    }
                }
                item { AssistantSummaryCardInner(s.dashboard.todayRevenue, s.dashboard.todayOrders) }
                val low = (s.management["ingredients"] ?: emptyList()).firstOrNull { it.status == "رو به اتمام" }
                if (low != null) {
                    item { AssistantInventoryCard(low.title, low.value ?: low.subtitle) }
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(
                            listOf("فروش امروز چطور بوده؟", "چه چیزی رو به اتمام است؟", "سفارش‌های فعال را تحلیل کن"),
                        ) { prompt ->
                            Box(
                                Modifier.clip(CircleShape).background(FarmanSurface)
                                    .clickable(enabled = s.isOnline) { vm.send(prompt) }
                                    .padding(horizontal = 13.dp, vertical = 9.dp),
                            ) {
                                Text(prompt, color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                items(vm.messages.value) { m ->
                    Row(modifier = Modifier.fillMaxWidth()) {
                        if (m.isUser) Spacer(Modifier.weight(1f))
                        Box(
                            Modifier.clip(RoundedCornerShape(16.dp))
                                .background(if (m.isUser) FarmanOlive else FarmanSurface)
                                .padding(13.dp),
                        ) {
                            Text(
                                m.text,
                                color = if (m.isUser) FarmanBackground else FarmanText,
                                fontSize = 14.sp,
                            )
                        }
                        if (!m.isUser) Spacer(Modifier.weight(1f))
                    }
                }
                if (sending) {
                    item { Text("در حال پاسخ…", color = FarmanSecondary, fontSize = 12.sp) }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextField(
                    value = question,
                    onValueChange = { question = it },
                    placeholder = { Text("از فرمان بپرس…", color = FarmanSecondary) },
                    modifier = Modifier.weight(1f),
                    shape = CircleShape,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = FarmanSurface,
                        unfocusedContainerColor = FarmanSurface,
                        focusedTextColor = FarmanText,
                        unfocusedTextColor = FarmanText,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
                Spacer(Modifier.width(10.dp))
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(FarmanWine)
                        .clickable(enabled = question.isNotBlank() && !sending && s.isOnline) {
                            vm.send(question)
                            question = ""
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Text("✈️", fontSize = 20.sp, color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun AssistantSummaryCard() {
    // Local ops snapshot without new ViewModel creation inside card.
    Box {
        SummaryCardInner()
    }
}

@Composable
private fun SummaryCardInner() {
    // Read from ambient container via simple placeholder: real values injected by parent recomposition.
    // To avoid extra plumbing, this card is filled by AssistantScreen's state via remember below.
    // (Values passed through composition locals would be overkill; keep direct.)
    // NOTE: actual dashboard values rendered by caller variant below.
    AssistantSummaryCardContent()
}

@Composable
private fun AssistantSummaryCardContent() {
    // Placeholder replaced by overload with params — kept for structure parity with iOS.
    // Real card:
    Box { }
}

// Real summary card with dashboard (called from AssistantScreen via inline copy to keep file simple).
// We implement it as a separate composable taking explicit params:
@Composable
fun AssistantSummaryCardInner(todayRevenue: Double, todayOrders: Int) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(FarmanWine.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("📊", fontSize = 22.sp)
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    "سلام!\nتا این لحظه فروش کافه ${money(todayRevenue)} بوده است.",
                    color = FarmanText,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(1.dp).fillMaxWidth().background(FarmanBorder))
            Row {
                Text("🍴 ${faNumber(todayOrders)} سفارش", color = FarmanText, modifier = Modifier.weight(1f))
                val avg = if (todayOrders > 0) money(todayRevenue / todayOrders) else "۰ تومان"
                Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("میانگین هر سفارش", color = FarmanSecondary, fontSize = 11.sp)
                    Text(avg, color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun AssistantInventoryCard(title: String, subtitle: String) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row {
                Text("⚠️", fontSize = 22.sp, color = FarmanWine)
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("موجودی برخی اقلام در حال اتمام است.", color = FarmanText, fontWeight = FontWeight.Bold)
                    Text("بهتر است به‌زودی سفارش داده شوند.", color = FarmanSecondary, fontSize = 12.sp)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("📦", color = FarmanWarning, fontSize = 18.sp)
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(title, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text(subtitle, color = FarmanSecondary, fontSize = 12.sp)
                }
            }
        }
    }
}

// ---------------- More (mirrors iOS MoreView) ----------------

class MoreViewModel(private val container: AppContainer) : ViewModel() {
    var serverText = mutableStateOf("")
        private set
    private val _saved = MutableStateFlow<String?>(null)
    val saved: StateFlow<String?> = _saved

    init {
        viewModelScope.launch {
            serverText.value = container.settings.currentServerUrl()
        }
    }

    fun updateServer(v: String) {
        serverText.value = v
    }

    fun saveAndConnect(onDone: () -> Unit) {
        viewModelScope.launch {
            try {
                val normalized = HttpClientFactory.normalizeBaseUrl(serverText.value)
                if (!normalized.startsWith("https://") && !HttpClientFactory.isLocalHost(normalized)) {
                    throw IllegalArgumentException("برای امنیت، فقط اتصال امن (https) مجاز است")
                }
                container.settings.setServerUrl(serverText.value.trim())
                container.ops.bootstrap()
                _saved.value = "ذخیره شد"
                onDone()
            } catch (e: Exception) {
                container.ops.setError(userMessage(e))
            }
        }
    }

    fun logout() {
        viewModelScope.launch { container.auth.logout() }
    }
}

@Composable
fun MoreScreen(container: AppContainer, nav: NavController) {
    val vm: MoreViewModel = appViewModel { MoreViewModel(container) }
    val profile by container.auth.observeProfile().collectAsStateWithLifecycle(initialValue = null)
    val ops by container.ops.state.collectAsStateWithLifecycle()
    val sync by container.sync.uiState.collectAsStateWithLifecycle()
    val scope = vm.viewModelScope

    ScreenBackground {
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("بیشتر", fontSize = 26.sp, fontWeight = FontWeight.Black, color = FarmanText)
            }
            item {
                FarmanCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("👤", fontSize = 44.sp, color = FarmanOlive)
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text(profile?.name ?: "مدیر", color = FarmanText, fontWeight = FontWeight.Bold)
                            Text(
                                profile?.email ?: "حساب ذخیره‌شده",
                                color = FarmanSecondary,
                                fontSize = 12.sp,
                            )
                        }
                    }
                }
            }
            item {
                FarmanCard {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("وضعیت", color = FarmanText, fontWeight = FontWeight.Bold)
                        Text(
                            if (ops.isOnline) "🌐 سرور متصل" else "📶 حالت آفلاین",
                            color = FarmanText,
                            fontSize = 14.sp,
                        )
                        Text(ops.serverLabel.ifBlank { sync.toString() }, color = FarmanSecondary, fontSize = 12.sp)
                        if (!ops.isOnline) {
                            Text(
                                "گوشی روی LTE است ولی سرور روی وای‌فای/هات‌اسپات مک است؛ به همان شبکه وصل شوید.",
                                color = FarmanWarning,
                                fontSize = 12.sp,
                            )
                        }
                        if (ops.lastSyncMs != null) {
                            Row {
                                Text("🕐 آخرین همگام‌سازی", color = FarmanText, fontSize = 13.sp, modifier = Modifier.weight(1f))
                                Text(
                                    com.farmancoffeeshop.app.ui.ios.relativeFa(ops.lastSyncMs!!),
                                    color = FarmanSecondary,
                                    fontSize = 12.sp,
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = { scope.launch { container.ops.bootstrap() } },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = FarmanSurface, contentColor = FarmanText),
                            ) { Text("تلاش اتصال مجدد", fontSize = 13.sp) }
                            Button(
                                onClick = { scope.launch { container.ops.refreshQuietly() } },
                                enabled = ops.isOnline,
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = FarmanSurface, contentColor = FarmanText),
                            ) { Text("همگام‌سازی الآن", fontSize = 13.sp) }
                        }
                    }
                }
            }
            item {
                FarmanCard {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("سرور", color = FarmanText, fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = vm.serverText.value,
                            onValueChange = vm::updateServer,
                            placeholder = { Text("آدرس سرور (مثل http://172.20.10.5:3080)", color = FarmanSecondary) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = FarmanText,
                                unfocusedTextColor = FarmanText,
                            ),
                        )
                        Button(
                            onClick = { vm.saveAndConnect {} },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                        ) { Text("ذخیره و اتصال", fontWeight = FontWeight.Bold) }
                    }
                }
            }
            item {
                FarmanCard {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("آفلاین‌محور", color = FarmanText, fontWeight = FontWeight.Bold)
                        MoreRow("📒 دفتر مالی", onClick = { nav.navigate(Routes.LEDGER) })
                        MoreRow("➕ ثبت سند", onClick = { nav.navigate(Routes.RECORD) })
                        MoreRow("📦 انبار", onClick = { nav.navigate(Routes.INVENTORY) })
                        MoreRow("🛍️ منو و محصولات", onClick = { nav.navigate(Routes.CATALOG) })
                        MoreRow("✨ بینش‌های هوشمند", onClick = { nav.navigate(Routes.INSIGHTS) })
                        MoreRow("🔄 همگام‌سازی و صف", onClick = { nav.navigate(Routes.SYNC) })
                        MoreRow("⚙️ تنظیمات", onClick = { nav.navigate(Routes.SETTINGS) })
                    }
                }
            }
            item {
                FarmanCard {
                    Text(
                        "⎋ خروج از حساب",
                        color = FarmanWine,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.fillMaxWidth().clickable { vm.logout() }.padding(8.dp),
                    )
                }
            }
            if (ops.error != null) {
                item {
                    FarmanCard {
                        Text(ops.error!!, color = FarmanWine, fontSize = 13.sp)
                        Text(
                            "باشه",
                            color = FarmanOlive,
                            modifier = Modifier.clickable { container.ops.clearError() }.padding(top = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MoreRow(title: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(FarmanRaised.copy(alpha = 0.4f))
            .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = FarmanText, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text("‹", color = FarmanSecondary)
    }
}
