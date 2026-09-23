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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.farmancoffeeshop.app.data.repository.ManagementRecord
import com.farmancoffeeshop.app.data.repository.OpsOrder
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.ios.EmptyInline
import com.farmancoffeeshop.app.ui.ios.FarmanCard
import com.farmancoffeeshop.app.ui.ios.LiveServiceStrip
import com.farmancoffeeshop.app.ui.ios.MetricCard
import com.farmancoffeeshop.app.ui.ios.OfflineBanner
import com.farmancoffeeshop.app.ui.ios.RevenueChart
import com.farmancoffeeshop.app.ui.ios.ScreenBackground
import com.farmancoffeeshop.app.ui.ios.SectionTitle
import com.farmancoffeeshop.app.ui.ios.StatusPill
import com.farmancoffeeshop.app.ui.ios.SyncFooter
import com.farmancoffeeshop.app.ui.ios.faNumber
import com.farmancoffeeshop.app.ui.ios.money
import com.farmancoffeeshop.app.ui.ios.statusTitle
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
import kotlinx.coroutines.launch

class OpsViewModel(private val container: AppContainer) : ViewModel() {
    val ops = container.ops.state
    val profile = container.auth.observeProfile()
    private val _refreshing = mutableStateOf(false)
    val refreshing: Boolean get() = _refreshing.value

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            try {
                container.ops.refreshQuietly()
            } finally {
                _refreshing.value = false
            }
        }
    }

    fun updateOrder(order: OpsOrder, to: String) {
        viewModelScope.launch { container.ops.updateOrder(order, to) }
    }
}

@Composable
private fun rememberOpsVm(container: AppContainer): OpsViewModel =
    appViewModel { OpsViewModel(container) }

// ---------------- Dashboard (mirrors iOS DashboardView) ----------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(container: AppContainer, nav: NavController) {
    val vm = rememberOpsVm(container)
    val s by vm.ops.collectAsStateWithLifecycle()
    val profile by vm.profile.collectAsStateWithLifecycle(initialValue = null)
    LaunchedEffect(Unit) { vm.refresh() }

    ScreenBackground {
        PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = vm::refresh) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (!s.isOnline) {
                    item { OfflineBanner(s.lastSyncMs) }
                }
                item { CafeGreetingHeader(name = profile?.name ?: "آرمان", isOnline = s.isOnline) }
                item { PendingLeaveRequestsCard(records = s.management["leaves"] ?: emptyList(), nav = nav) }
                item { LiveServiceStrip(orders = s.orders) }
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.weight(1f)) {
                                MetricCard("فروش امروز", money(s.dashboard.todayRevenue), "↑ ۱۸٪ نسبت به دیروز", "💳", FarmanOlive)
                            }
                            Box(Modifier.weight(1f)) {
                                MetricCard("سفارش‌های امروز", faNumber(s.dashboard.todayOrders), "↑ ۱۲٪ نسبت به دیروز", "👥", FarmanWine)
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.weight(1f)) {
                                MetricCard("مواد رو به اتمام", faNumber(s.dashboard.lowStock), "آیتم نیازمند خرید", "📦", FarmanWine)
                            }
                            Box(Modifier.weight(1f)) {
                                val avg = if (s.dashboard.todayOrders > 0) s.dashboard.todayRevenue / s.dashboard.todayOrders else 0.0
                                MetricCard("میانگین سبد", if (s.dashboard.todayOrders > 0) money(avg) else "۰ تومان", "↑ ۸٪ نسبت به دیروز", "🛒", FarmanOlive)
                            }
                        }
                    }
                }
                item { RevenueChart(points = s.dashboard.daily) }
                item { ActionRequiredCard(items = s.management["ingredients"] ?: emptyList()) }
                item {
                    Button(
                        onClick = { nav.navigate(Routes.RECORD) },
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = FarmanWine, contentColor = Color.White),
                    ) {
                        Text("+ سفارش دستی", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
                item { SyncFooter(isOnline = s.isOnline, isBusy = s.isBusy) }
            }
        }
    }
}

@Composable
fun CafeGreetingHeader(name: String, isOnline: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.weight(1f)) {
            Text("سلام $name", fontSize = 27.sp, fontWeight = FontWeight.Black, color = FarmanText)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("کافه فرمان", color = FarmanText, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (isOnline) "● آنلاین" else "📶 آفلاین",
                    color = if (isOnline) FarmanOlive else FarmanWine,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Text("روز خوبی برای یک قهوه عالی است!", color = FarmanSecondary, fontSize = 12.sp)
        }
        Box(
            Modifier.size(66.dp).clip(CircleShape)
                .background(Brush.linearGradient(listOf(Color(0xFFB78458), Color(0xFF2B1712)))),
            contentAlignment = Alignment.Center,
        ) {
            Text("☕", fontSize = 28.sp)
        }
    }
}

@Composable
private fun PendingLeaveRequestsCard(records: List<ManagementRecord>, nav: NavController) {
    val pending = records.filter { it.status == "PENDING" }
    if (pending.isNotEmpty()) {
        FarmanCard(
            modifier = Modifier.clickable { nav.navigate(Routes.module("leaves")) },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(13.dp))
                        .background(FarmanWarning.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("🔔", fontSize = 22.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("${faNumber(pending.size)} درخواست مرخصی جدید", color = FarmanText, fontWeight = FontWeight.Bold)
                    Text("برای تأیید یا رد درخواست‌ها لمس کنید", color = FarmanSecondary, fontSize = 12.sp)
                }
                Text("‹", color = FarmanText, fontSize = 20.sp)
            }
        }
    }
}

@Composable
private fun ActionRequiredCard(items: List<ManagementRecord>) {
    val low = items.filter { it.status == "رو به اتمام" }.take(3)
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("🔔 نیازمند اقدام", color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            if (low.isEmpty()) {
                Text("در حال حاضر مورد فوری وجود ندارد", color = FarmanSecondary, fontSize = 12.sp, modifier = Modifier.padding(vertical = 10.dp))
            }
            low.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(FarmanRaised.copy(alpha = 0.45f)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(36.dp).clip(RoundedCornerShape(9.dp))
                            .background(FarmanWarning.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("📦", fontSize = 18.sp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.title, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(item.value ?: item.subtitle, color = FarmanSecondary, fontSize = 12.sp)
                    }
                    Box(
                        Modifier.clip(CircleShape).background(FarmanWine.copy(alpha = 0.12f))
                            .padding(horizontal = 7.dp, vertical = 5.dp),
                    ) {
                        Text("رو به اتمام", color = FarmanWine, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

// ---------------- Operations (mirrors iOS OperationsView) ----------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperationsScreen(container: AppContainer, nav: NavController) {
    val vm = rememberOpsVm(container)
    val s by vm.ops.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.refresh() }

    ScreenBackground {
        PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = vm::refresh) {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (!s.isOnline) {
                    item { OfflineBanner(s.lastSyncMs) }
                }
                item {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("عملیات امروز", fontSize = 30.sp, fontWeight = FontWeight.Black, color = FarmanText)
                            Text("همه چیز در جریان است", color = FarmanSecondary, fontSize = 14.sp)
                        }
                        Box(
                            Modifier.clip(CircleShape).background(FarmanSurface).padding(horizontal = 10.dp, vertical = 8.dp),
                        ) {
                            Text(
                                if (s.isOnline) "● زنده" else "آفلاین",
                                color = if (s.isOnline) FarmanOlive else FarmanWine,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }
                }
                item { LiveServiceStrip(orders = s.orders) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f).clickable { nav.navigate(Routes.ORDERS) }) {
                            OperationCountCard("سفارش‌ها", s.orders.size, "${s.dashboard.activeOrders} فعال", "🧾", FarmanWine)
                        }
                        Box(Modifier.weight(1f).clickable { nav.navigate(Routes.module("tables")) }) {
                            OperationCountCard("میزها", s.management["tables"]?.size ?: 0, "مدیریت میز", "🪑", FarmanOlive)
                        }
                        Box(Modifier.weight(1f).clickable { nav.navigate(Routes.module("reservations")) }) {
                            OperationCountCard("رزروها", s.management["reservations"]?.size ?: 0, "امروز", "📅", FarmanSecondary)
                        }
                    }
                }
                item { SectionTitle("اقدام فوری") }
                item {
                    val urgent = s.orders.filter { it.status == "PENDING" || it.status == "CONFIRMED" || it.status == "PREPARING" }.take(4)
                    if (urgent.isEmpty()) {
                        FarmanCard { EmptyInline("سفارشی در کش محلی وجود ندارد") }
                    } else {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(urgent, key = { it.id }) { order ->
                                Box(Modifier.width(220.dp).clickable { nav.navigate(Routes.order(order.id)) }) {
                                    OrderTicketCard(order)
                                }
                            }
                        }
                    }
                }
                item { SectionTitle("رزروهای پیش رو") }
                item {
                    val res = (s.management["reservations"] ?: emptyList()).take(3)
                    FarmanCard {
                        Column {
                            if (res.isEmpty()) {
                                EmptyInline("موردی ثبت نشده است")
                            }
                            res.forEachIndexed { i, r ->
                                Row(Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text("📅", color = FarmanOlive, fontSize = 18.sp)
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(r.title, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        Text(r.subtitle, color = FarmanSecondary, fontSize = 12.sp)
                                    }
                                    Text(r.status ?: "", color = FarmanOlive, fontSize = 12.sp)
                                }
                                if (i != res.lastIndex) {
                                    Spacer(Modifier.height(1.dp).fillMaxWidth().background(FarmanBorder))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OperationCountCard(title: String, value: Int, detail: String, icon: String, tint: Color) {
    FarmanCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.fillMaxWidth()) {
            Box(
                Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(icon, fontSize = 20.sp)
            }
            Text(title, color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(faNumber(value), color = FarmanText, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Text(detail, color = FarmanSecondary, fontSize = 11.sp)
        }
    }
}

@Composable
fun OrderTicketCard(order: OpsOrder) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusPill(order.status, order.statusLabel)
                Spacer(Modifier.weight(1f))
                Text("#${order.id.take(4)}", color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Text(order.customerName, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("${order.itemCount} آیتم • ${order.tableLabel ?: "بیرون‌بر"}", color = FarmanSecondary, fontSize = 12.sp)
            Spacer(Modifier.height(1.dp).fillMaxWidth().background(FarmanBorder))
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(FarmanSurface).padding(10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("مشاهده جزئیات ‹", color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ---------------- Orders (mirrors iOS OrdersView + detail) ----------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(container: AppContainer, nav: NavController) {
    val vm = rememberOpsVm(container)
    val s by vm.ops.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("ALL") }
    val filters = listOf("ALL" to "همه", "PENDING" to "در انتظار", "PREPARING" to "آماده‌سازی", "READY" to "آماده تحویل", "COMPLETED" to "تکمیل")
    val visible = s.orders.filter {
        (filter == "ALL" || it.status == filter) &&
            (query.isBlank() || it.customerName.contains(query) || it.id.contains(query))
    }

    ScreenBackground {
        PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = vm::refresh) {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    Text("سفارش‌ها", fontSize = 30.sp, fontWeight = FontWeight.Black, color = FarmanText)
                    Text("همه سفارش‌های کافه در یک نگاه", color = FarmanSecondary, fontSize = 14.sp)
                }
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("جستجوی سفارش", color = FarmanSecondary) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = FarmanSurface,
                            unfocusedContainerColor = FarmanSurface,
                            focusedTextColor = FarmanText,
                            unfocusedTextColor = FarmanText,
                        ),
                    )
                }
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(filters) { f ->
                            val selected = filter == f.first
                            Box(
                                Modifier.clip(CircleShape)
                                    .background(if (selected) FarmanOlive.copy(alpha = 0.5f) else FarmanSurface)
                                    .clickable { filter = f.first }
                                    .padding(horizontal = 15.dp, vertical = 10.dp),
                            ) {
                                Text(f.second, color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                items(visible, key = { it.id }) { order ->
                    Box(Modifier.clickable { nav.navigate(Routes.order(order.id)) }) {
                        OrderRow(order)
                    }
                }
                if (visible.isEmpty()) {
                    item { FarmanCard { EmptyInline("سفارشی با این فیلتر پیدا نشد") } }
                }
            }
        }
    }
}

@Composable
fun OrderRow(order: OpsOrder) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    Modifier.size(48.dp).clip(RoundedCornerShape(13.dp))
                        .background(FarmanOlive.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (order.orderType == "TABLE") "🍽️" else "🛍️", fontSize = 22.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("سفارش ${order.id.take(6)}", color = FarmanText, fontWeight = FontWeight.Bold)
                    Text(order.customerName, color = FarmanSecondary, fontSize = 12.sp)
                    Text(order.tableLabel ?: "بیرون‌بر", color = FarmanSecondary, fontSize = 12.sp)
                }
                StatusPill(order.status, order.statusLabel)
            }
            Spacer(Modifier.height(1.dp).fillMaxWidth().background(FarmanBorder))
            Row {
                Text("${faNumber(order.itemCount)} آیتم", color = FarmanSecondary, fontSize = 13.sp)
                Spacer(Modifier.weight(1f))
                Text(money(order.total.toDouble()), color = FarmanText, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun OrderDetailScreen(container: AppContainer, id: String) {
    val vm = rememberOpsVm(container)
    val s by vm.ops.collectAsStateWithLifecycle()
    val order = s.orders.firstOrNull { it.id == id }

    ScreenBackground {
        LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Text("جزئیات سفارش", fontSize = 24.sp, fontWeight = FontWeight.Black, color = FarmanText)
            }
            if (order == null) {
                item { FarmanCard { EmptyInline("سفارش یافت نشد") } }
            } else {
                item { OrderRow(order) }
                item {
                    Text("تغییر وضعیت سفارش", color = FarmanText, fontWeight = FontWeight.Bold)
                }
                items(order.allowedNext) { status ->
                    val destructive = status == "CANCELLED"
                    Button(
                        onClick = { vm.updateOrder(order, status) },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                        enabled = s.isOnline,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (destructive) FarmanSurface else FarmanWine,
                            contentColor = if (destructive) FarmanWine else Color.White,
                        ),
                    ) {
                        Text(if (destructive) "✕ ${statusTitle(status)}" else "✓ ${statusTitle(status)}")
                    }
                }
                if (!s.isOnline) {
                    item {
                        Text("📶 برای تغییر وضعیت به سرور متصل شوید", color = FarmanWarning, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
