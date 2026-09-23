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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavController
import com.farmancoffeeshop.app.data.repository.ManagementRecord
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.ios.EmptyInline
import com.farmancoffeeshop.app.ui.ios.FarmanCard
import com.farmancoffeeshop.app.ui.ios.RevenueChart
import com.farmancoffeeshop.app.ui.ios.ScreenBackground
import com.farmancoffeeshop.app.ui.ios.SectionTitle
import com.farmancoffeeshop.app.ui.ios.SyncFooter
import com.farmancoffeeshop.app.ui.ios.faNumber
import com.farmancoffeeshop.app.ui.ios.money
import com.farmancoffeeshop.app.ui.ios.statusTitle
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.theme.FarmanBackground
import com.farmancoffeeshop.app.ui.theme.FarmanOlive
import com.farmancoffeeshop.app.ui.theme.FarmanSecondary
import com.farmancoffeeshop.app.ui.theme.FarmanSurface
import com.farmancoffeeshop.app.ui.theme.FarmanText
import com.farmancoffeeshop.app.ui.theme.FarmanWine
import kotlinx.coroutines.launch

data class ManagementModule(val key: String, val title: String, val subtitle: String, val icon: String, val color: Color)

private val MODULES = listOf(
    ManagementModule("products", "محصولات", "مدیریت آیتم‌های منو، قیمت و موجودی", "🛍️", FarmanWine),
    ManagementModule("categories", "دسته‌ها", "سازمان‌دهی و ویرایش دسته‌های منو", "🗂️", FarmanOlive),
    ManagementModule("ingredients", "مواد اولیه", "موجودی، حداقل و تأمین‌کنندگان", "🌿", FarmanOlive),
    ManagementModule("allergens", "آلرژن‌ها", "مدیریت مواد حساسیت‌زا در منو", "⚠️", FarmanOlive),
    ManagementModule("customers", "مشتریان", "اطلاعات مشتری و سوابق سفارش", "👥", FarmanWine),
    ManagementModule("tables", "میزها", "وضعیت آزاد یا اشغال میزها", "🪑", FarmanOlive),
    ManagementModule("reservations", "رزروها", "مدیریت رزرو و حضور مهمان", "📅", FarmanWine),
    ManagementModule("ratings", "نظرات", "بازخورد و امتیاز مشتریان", "⭐", FarmanOlive),
    ManagementModule("finance", "گزارش مالی", "درآمد، هزینه‌ها و روند فروش", "📊", FarmanWine),
    ManagementModule("staff", "پرسنل", "کارکنان و وضعیت فعالیت", "🧑‍🤝‍🧑", FarmanOlive),
    ManagementModule("leaves", "مرخصی‌ها", "درخواست‌ها و تأیید مرخصی پرسنل", "🏖️", FarmanOlive),
    ManagementModule("cashier", "دسترسی صندوق‌دار", "نقش‌ها و مسئولیت‌های کاربران", "🔒", FarmanWine),
    ManagementModule("qr", "کدهای QR", "لینک منو و سفارش سریع میز", "🔳", FarmanOlive),
    ManagementModule("settings", "تنظیمات", "پیکربندی سرویس‌ها و کافه", "⚙️", FarmanWine),
)

fun findModule(key: String): ManagementModule =
    MODULES.firstOrNull { it.key == key } ?: ManagementModule(key, key, "", "📦", FarmanSecondary)

// ---------------- Management list (mirrors iOS ManagementView) ----------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManagementScreen(container: AppContainer, nav: NavController) {
    val vm: OpsViewModel = appViewModel { OpsViewModel(container) }
    val s by vm.ops.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.refresh() }

    val filtered = if (query.isBlank()) MODULES else MODULES.filter {
        it.title.contains(query) || it.subtitle.contains(query)
    }

    ScreenBackground {
        PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = vm::refresh) {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("مدیریت کافه", fontSize = 30.sp, fontWeight = FontWeight.Black, color = FarmanText)
                            Text("همه‌چیز برای مدیریت بهتر کافه شما", color = FarmanSecondary, fontSize = 14.sp)
                        }
                        Box(
                            Modifier.size(52.dp).clip(CircleShape)
                                .background(FarmanWine.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("☕", fontSize = 24.sp)
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("جستجوی منو، محصول یا…", color = FarmanSecondary) },
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
                if (s.dashboard.lowStock > 0 && query.isBlank()) {
                    item {
                        FarmanCard(modifier = Modifier.clickable { nav.navigate(Routes.module("ingredients")) }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier.size(48.dp).clip(RoundedCornerShape(13.dp))
                                        .background(FarmanWine.copy(alpha = 0.15f)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text("⚠️", fontSize = 22.sp)
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${faNumber(s.dashboard.lowStock)} قلم موجودی در آستانه اتمام است!", color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                    Text("برای جلوگیری از توقف سرویس، موجودی را بررسی کنید.", color = FarmanSecondary, fontSize = 12.sp)
                                }
                                Text("‹", color = FarmanText, fontSize = 20.sp)
                            }
                        }
                    }
                }
                if (query.isBlank()) {
                    item { SectionTitle("منو و موجودی") }
                    items(filtered.take(5), key = { it.key }) { m ->
                        ManagementNavigationRow(m, s.management[m.key]?.size ?: 0) { nav.navigate(routeFor(m, nav)) }
                    }
                    item { SectionTitle("کسب‌وکار") }
                    items(filtered.drop(5), key = { it.key }) { m ->
                        ManagementNavigationRow(m, s.management[m.key]?.size ?: 0) { nav.navigate(routeFor(m, nav)) }
                    }
                } else {
                    items(filtered, key = { it.key }) { m ->
                        ManagementNavigationRow(m, s.management[m.key]?.size ?: 0) { nav.navigate(routeFor(m, nav)) }
                    }
                }
                item { SyncFooter(isOnline = s.isOnline, isBusy = s.isBusy) }
            }
        }
    }
}

/** Legacy offline-first destinations stay reachable from مدیریت. */
private fun routeFor(m: ManagementModule, nav: NavController): String = when (m.key) {
    "products" -> Routes.CATALOG
    "ingredients" -> Routes.INVENTORY
    "finance" -> Routes.LEDGER
    "settings" -> Routes.SETTINGS
    else -> Routes.module(m.key)
}

@Composable
private fun ManagementNavigationRow(module: ManagementModule, count: Int, onClick: () -> Unit) {
    FarmanCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(46.dp).clip(RoundedCornerShape(13.dp))
                    .background(module.color.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(module.icon, fontSize = 20.sp)
            }
            Spacer(Modifier.width(13.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(module.title, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text(module.subtitle, color = FarmanSecondary, fontSize = 12.sp, maxLines = 1)
            }
            Box(
                Modifier.clip(CircleShape).background(module.color.copy(alpha = 0.12f))
                    .padding(horizontal = 10.dp, vertical = 7.dp),
            ) {
                Text(faNumber(count), color = module.color, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(6.dp))
            Text("‹", color = FarmanText, fontSize = 16.sp)
        }
    }
}

// ---------------- Module detail (mirrors iOS ManagementModuleDetail) ----------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManagementModuleScreen(container: AppContainer, nav: NavController, key: String) {
    val vm: OpsViewModel = appViewModel { OpsViewModel(container) }
    val s by vm.ops.collectAsStateWithLifecycle()
    val module = findModule(key)
    var query by remember { mutableStateOf("") }
    var showReservation by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.refresh() }

    val source = s.management[key] ?: emptyList()
    val records = if (query.isBlank()) source else source.filter {
        it.title.contains(query) || it.subtitle.contains(query)
    }

    ScreenBackground {
        PullToRefreshBox(isRefreshing = vm.refreshing, onRefresh = vm::refresh) {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Text(module.title, fontSize = 26.sp, fontWeight = FontWeight.Black, color = FarmanText)
                    Text(module.subtitle, color = FarmanSecondary, fontSize = 13.sp)
                }
                if (key == "finance") {
                    item { FinanceDashboardCard(container) }
                }
                if (key == "reservations") {
                    item {
                        Button(
                            onClick = { showReservation = true },
                            enabled = s.isOnline,
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                        ) {
                            Text("+ رزرو جدید", fontWeight = FontWeight.Bold)
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("جستجو در ${module.title}", color = FarmanSecondary) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = FarmanSurface,
                            unfocusedContainerColor = FarmanSurface,
                            focusedTextColor = FarmanText,
                            unfocusedTextColor = FarmanText,
                        ),
                    )
                }
                if (records.isEmpty()) {
                    item {
                        FarmanCard {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                                EmptyInline(if (s.isOnline) "موردی در این بخش ثبت نشده است" else "داده ذخیره‌شده‌ای برای این بخش وجود ندارد")
                                if (key == "reservations" && s.isOnline) {
                                    Text(
                                        "ثبت اولین رزرو",
                                        color = FarmanOlive,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.clickable { showReservation = true }.padding(8.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                items(records, key = { it.id }) { record ->
                    if (key == "finance") {
                        ManagementRecordCard(container, vm, module, record, s.isOnline)
                    } else {
                        ManagementRecordCard(container, vm, module, record, s.isOnline)
                    }
                }
            }
        }
        if (showReservation) {
            ReservationCreateSheet(container, vm, onDismiss = { showReservation = false })
        }
    }
}

@Composable
private fun FinanceDashboardCard(container: AppContainer) {
    val vm: OpsViewModel = appViewModel { OpsViewModel(container) }
    val s by vm.ops.collectAsStateWithLifecycle()
    val d = s.dashboard
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("📊 نمای مالی زنده", color = FarmanText, fontWeight = FontWeight.Bold)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FinanceCell("فروش امروز", money(d.todayRevenue), Modifier.weight(1f))
                    FinanceCell("فروش ماه", money(d.monthRevenue), Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    FinanceCell("سفارش امروز", faNumber(d.todayOrders), Modifier.weight(1f))
                    FinanceCell("سفارش فعال", faNumber(d.activeOrders), Modifier.weight(1f))
                }
            }
            if (d.topProducts.isNotEmpty()) {
                Spacer(Modifier.height(1.dp).fillMaxWidth().background(com.farmancoffeeshop.app.ui.theme.FarmanBorder))
                Text("پرفروش‌ترین‌ها", color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                d.topProducts.take(3).forEach { p ->
                    Row {
                        Text(p.name, color = FarmanText, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Text(money(p.revenue), color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            if (d.daily.isNotEmpty()) {
                RevenueChart(points = d.daily)
            }
        }
    }
}

@Composable
private fun FinanceCell(title: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clip(RoundedCornerShape(12.dp))
            .background(com.farmancoffeeshop.app.ui.theme.FarmanRaised.copy(alpha = 0.5f)).padding(12.dp),
    ) {
        Text(title, color = FarmanSecondary, fontSize = 12.sp)
        Text(value, color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

@Composable
private fun ManagementRecordCard(
    container: AppContainer,
    vm: OpsViewModel,
    module: ManagementModule,
    record: ManagementRecord,
    isOnline: Boolean,
) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(42.dp).clip(RoundedCornerShape(11.dp))
                        .background(module.color.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(module.icon, fontSize = 20.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(record.title, color = FarmanText, fontWeight = FontWeight.Bold)
                    Text(record.subtitle, color = FarmanSecondary, fontSize = 12.sp)
                    if (record.value != null) {
                        Text(record.value, color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (record.status != null) {
                    Box(
                        Modifier.clip(CircleShape).background(module.color.copy(alpha = 0.12f))
                            .padding(horizontal = 7.dp, vertical = 5.dp),
                    ) {
                        Text(statusTitle(record.status), color = module.color, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            RecordActionControls(container, vm, module, record, isOnline)
        }
    }
}

@Composable
private fun RecordActionControls(
    container: AppContainer,
    vm: OpsViewModel,
    module: ManagementModule,
    record: ManagementRecord,
    isOnline: Boolean,
) {
    val scope = vm.viewModelScope
    when (record.action) {
        "ingredientAdjust" -> {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { scope.launch { container.ops.perform(record, amount = -1.0) } },
                    enabled = isOnline,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = FarmanSurface, contentColor = module.color),
                ) { Text("− کاهش") }
                Button(
                    onClick = { scope.launch { container.ops.perform(record, amount = 1.0) } },
                    enabled = isOnline,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = FarmanSurface, contentColor = module.color),
                ) { Text("+ افزایش") }
            }
        }
        "reservationStatus" -> {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { scope.launch { container.ops.perform(record, status = "SEATED") } },
                    enabled = isOnline,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                ) { Text("مهمان نشست") }
                Button(
                    onClick = { scope.launch { container.ops.perform(record, status = "CANCELLED") } },
                    enabled = isOnline,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = FarmanWine, contentColor = Color.White),
                ) { Text("لغو رزرو") }
            }
        }
        "leaveStatus" -> {
            if (record.enabled == true) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { scope.launch { container.ops.perform(record, status = "APPROVED") } },
                        enabled = isOnline,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                    ) { Text("تأیید") }
                    Button(
                        onClick = { scope.launch { container.ops.perform(record, status = "REJECTED") } },
                        enabled = isOnline,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = FarmanWine, contentColor = Color.White),
                    ) { Text("رد") }
                }
            }
        }
        "ratingDelete" -> {
            Button(
                onClick = { scope.launch { container.ops.perform(record) } },
                enabled = isOnline,
                colors = ButtonDefaults.buttonColors(containerColor = FarmanSurface, contentColor = FarmanWine),
            ) { Text("🗑 حذف نظر") }
        }
        null -> {}
        else -> {
            Button(
                onClick = { scope.launch { container.ops.perform(record, enabled = !(record.enabled ?: false)) } },
                enabled = isOnline,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = module.color.copy(alpha = 0.16f), contentColor = module.color),
            ) {
                Text(if (record.enabled == true) "⏸ غیرفعال کردن" else "✓ فعال کردن")
            }
        }
    }
}

// ---------------- Reservation sheet (mirrors iOS ReservationCreateView) ----------------

@Composable
private fun ReservationCreateSheet(container: AppContainer, vm: OpsViewModel, onDismiss: () -> Unit) {
    val s by vm.ops.collectAsStateWithLifecycle()
    val tables = s.management["tables"] ?: emptyList()
    var tableId by remember { mutableStateOf(tables.firstOrNull()?.id ?: "") }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var guests by remember { mutableStateOf(2) }
    var saving by remember { mutableStateOf(false) }
    val scope = vm.viewModelScope

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable(onClick = onDismiss),
        contentAlignment = Alignment.BottomCenter,
    ) {
        FarmanCard(modifier = Modifier.clickable(enabled = false) {}) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("رزرو جدید", color = FarmanText, fontWeight = FontWeight.Black, fontSize = 20.sp)
                Text("میز: ${tables.firstOrNull { it.id == tableId }?.title ?: "انتخاب کنید"}", color = FarmanSecondary, fontSize = 13.sp)
                LazyColumn(Modifier.height(120.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(tables, key = { it.id }) { t ->
                        Text(
                            "${t.title} • ${t.status ?: ""}",
                            color = if (t.id == tableId) FarmanOlive else FarmanText,
                            fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth().clickable { tableId = t.id }.padding(6.dp),
                        )
                    }
                }
                OutlinedTextField(
                    value = name, onValueChange = { name = it },
                    placeholder = { Text("نام مشتری", color = FarmanSecondary) },
                    modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = FarmanText, unfocusedTextColor = FarmanText),
                )
                OutlinedTextField(
                    value = phone, onValueChange = { phone = it },
                    placeholder = { Text("تلفن (اختیاری)", color = FarmanSecondary) },
                    modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedTextColor = FarmanText, unfocusedTextColor = FarmanText),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("نفرات: ${faNumber(guests)}", color = FarmanText, modifier = Modifier.weight(1f))
                    Text("−", color = FarmanOlive, fontSize = 22.sp, modifier = Modifier.clickable { if (guests > 1) guests-- }.padding(8.dp))
                    Text("+", color = FarmanOlive, fontSize = 22.sp, modifier = Modifier.clickable { if (guests < 40) guests++ }.padding(8.dp))
                }
                Button(
                    onClick = {
                        saving = true
                        scope.launch {
                            val ok = container.ops.createReservation(
                                tableId, name.trim(), phone, guests,
                                System.currentTimeMillis() + 3600_000, 60,
                            )
                            saving = false
                            if (ok) onDismiss()
                        }
                    },
                    enabled = tableId.isNotBlank() && name.isNotBlank() && !saving && s.isOnline,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = FarmanOlive, contentColor = FarmanBackground),
                ) {
                    Text(if (saving) "در حال ثبت…" else "ثبت رزرو", fontWeight = FontWeight.Bold)
                }
                if (!s.isOnline) {
                    Text("برای ثبت رزرو به سرور متصل شوید", color = com.farmancoffeeshop.app.ui.theme.FarmanWarning, fontSize = 12.sp)
                }
                Text("بستن", color = FarmanSecondary, modifier = Modifier.align(Alignment.CenterHorizontally).clickable(onClick = onDismiss).padding(8.dp))
            }
        }
    }
}
