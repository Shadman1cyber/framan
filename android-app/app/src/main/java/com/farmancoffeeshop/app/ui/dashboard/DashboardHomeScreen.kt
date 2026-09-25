package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavController
import com.farmancoffeeshop.app.ui.nav.Routes

@Composable
fun DashboardHomeScreen(nav: NavController) {
    val erp = ModuleData(
        kind = ModuleKind.ERP,
        label = "ERP",
        subtitle = "تأمین، موجودی و عملیات",
        percent = 72f,
        stats = listOf(
            DashboardStat("تأمین‌کنندگان", "۱", tone = DashboardTone.Red),
            DashboardStat("موجودی", "۲", tone = DashboardTone.Yellow),
            DashboardStat("خریدها", "۴", tone = DashboardTone.Blue),
        ),
        actionLabel = "ورود به ERP",
        onClick = { nav.navigate(Routes.INVENTORY) },
    )
    val crm = ModuleData(
        kind = ModuleKind.CRM,
        label = "CRM",
        subtitle = "مشتریان و ارتباطات",
        percent = 68f,
        stats = listOf(
            DashboardStat("مشتریان", "۲۴", tone = DashboardTone.Green),
            DashboardStat("پیگیری‌ها", "۷", tone = DashboardTone.Yellow),
            DashboardStat("فرصت‌ها", "۳", tone = DashboardTone.Blue),
        ),
        actionLabel = "ورود به CRM",
        onClick = { nav.navigate(Routes.module("customers")) },
    )
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DashboardTokens.background),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = DashboardTokens.maxContentWidth)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = DashboardTokens.screenPadding)
                .padding(bottom = DashboardTokens.mainBottom),
        ) {
            Header()
            Greeting()
            HeroModule(onAccountingClick = { nav.navigate(Routes.LEDGER) })
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = DashboardTokens.modulesTop),
                horizontalArrangement = Arrangement.spacedBy(DashboardTokens.moduleGap),
            ) {
                ModuleCard(module = erp, modifier = Modifier.weight(1f))
                ModuleCard(module = crm, modifier = Modifier.weight(1f))
            }
        }
    }
}
