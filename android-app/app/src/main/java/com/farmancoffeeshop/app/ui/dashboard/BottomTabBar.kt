package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.currentBackStackEntryAsState
import com.farmancoffeeshop.app.ui.nav.Routes

private data class DashboardTab(
    val route: String,
    val label: String,
    val icon: DashboardIconKind,
)

private val dashboardTabs = listOf(
    DashboardTab(Routes.DASHBOARD, "خانه", DashboardIconKind.Home),
    DashboardTab(Routes.LEDGER, "حسابداری", DashboardIconKind.Coins),
    DashboardTab(Routes.INVENTORY, "ERP", DashboardIconKind.Cube),
    DashboardTab(Routes.module("customers"), "CRM", DashboardIconKind.Users),
)

@Composable
fun BottomTabBar(nav: NavController) {
    val entry by nav.currentBackStackEntryAsState()
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.navigationBars),
        color = DashboardTokens.tabBackground,
        border = BorderStroke(DashboardTokens.borderWidth, DashboardTokens.cardBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(DashboardTokens.tabHeight)
                .padding(top = DashboardTokens.tabTopPadding, bottom = DashboardTokens.tabBottomPadding),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            dashboardTabs.forEach { tab ->
                val selected = isSelected(tab, entry)
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .height(DashboardTokens.touchTarget)
                        .clickable {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                        .semantics {
                            contentDescription = tab.label
                            role = Role.Tab
                        },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    DashboardIcon(
                        kind = tab.icon,
                        modifier = Modifier.size(DashboardTokens.tabIconSize),
                        tint = if (selected) DashboardTokens.green else DashboardTokens.muted,
                    )
                    androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(DashboardTokens.tabGap))
                    Text(
                        text = tab.label,
                        style = DashboardTokens.tabLabel,
                        color = if (selected) DashboardTokens.green else DashboardTokens.muted,
                    )
                }
            }
        }
    }
}

private fun isSelected(tab: DashboardTab, entry: androidx.navigation.NavBackStackEntry?): Boolean {
    if (tab.route == Routes.module("customers")) {
        return entry?.destination?.route == Routes.MODULE && entry.arguments?.getString("key") == "customers"
    }
    return entry?.destination?.hierarchy?.any { it.route == tab.route } == true
}
