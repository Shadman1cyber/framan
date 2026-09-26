package com.farmancoffeeshop.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.farmancoffeeshop.app.sync.FarmanApp
import com.farmancoffeeshop.app.ui.dashboard.BottomTabBar
import com.farmancoffeeshop.app.ui.dashboard.DashboardHomeScreen
import com.farmancoffeeshop.app.ui.ios.ScreenBackground
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.screens.AssistantScreen
import com.farmancoffeeshop.app.ui.screens.CatalogScreen
import com.farmancoffeeshop.app.ui.screens.InsightsScreen
import com.farmancoffeeshop.app.ui.screens.InventoryScreen
import com.farmancoffeeshop.app.ui.screens.LedgerScreen
import com.farmancoffeeshop.app.ui.screens.LoginScreen
import com.farmancoffeeshop.app.ui.screens.ManagementModuleScreen
import com.farmancoffeeshop.app.ui.screens.ManagementScreen
import com.farmancoffeeshop.app.ui.screens.MoreScreen
import com.farmancoffeeshop.app.ui.screens.OperationsScreen
import com.farmancoffeeshop.app.ui.screens.OrderDetailScreen
import com.farmancoffeeshop.app.ui.screens.OrdersScreen
import com.farmancoffeeshop.app.ui.screens.ProductScreen
import com.farmancoffeeshop.app.ui.screens.RecordScreen
import com.farmancoffeeshop.app.ui.screens.SettingsScreen
import com.farmancoffeeshop.app.ui.screens.SyncScreen
import com.farmancoffeeshop.app.ui.theme.FarmanBackground
import com.farmancoffeeshop.app.ui.theme.FarmanBorder
import com.farmancoffeeshop.app.ui.theme.FarmanOlive
import com.farmancoffeeshop.app.ui.theme.FarmanSecondary
import com.farmancoffeeshop.app.ui.theme.FarmanTheme
import com.farmancoffeeshop.app.ui.theme.FarmanText

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as FarmanApp).container
        setContent {
            FarmanTheme {
                // Persian RTL across the whole app (matches iOS layoutDirection .rightToLeft).
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    FarmanNav(container)
                }
            }
        }
    }
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Routes.DASHBOARD, "خانه", Icons.Filled.Home),
    Tab(Routes.OPERATIONS, "عملیات", Icons.Filled.List),
    Tab(Routes.MANAGEMENT, "مدیریت", Icons.Filled.Settings),
    Tab(Routes.ASSISTANT, "دستیار", Icons.Filled.Star),
    Tab(Routes.MORE, "بیشتر", Icons.Filled.MoreVert),
)

private fun isDashboardTabDestination(entry: androidx.navigation.NavBackStackEntry?): Boolean {
    val destination = entry?.destination ?: return false
    return destination.hierarchy.any { route ->
        route.route == Routes.DASHBOARD ||
            route.route == Routes.LEDGER ||
            route.route == Routes.INVENTORY ||
            (route.route == Routes.MODULE && entry.arguments?.getString("key") == "customers")
    }
}

@Composable
fun FarmanNav(container: com.farmancoffeeshop.app.sync.AppContainer) {
    val nav = rememberNavController()
    val profile by container.auth.observeProfile().collectAsStateWithLifecycle(initialValue = null)
    var authChecked by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        container.auth.profile()
        container.ops.bootstrap()
        authChecked = true
    }
    if (!authChecked) {
        ScreenBackground {
            Box(Modifier.fillMaxSize()) {
                Text("کافه فرمان", modifier = Modifier.padding(24.dp), color = FarmanText)
            }
        }
        return
    }
    val start = if (profile == null) Routes.LOGIN else Routes.DASHBOARD
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination
    LaunchedEffect(profile) {
        if (profile == null && current?.route != null && current?.route != Routes.LOGIN) {
            nav.navigate(Routes.LOGIN) {
                popUpTo(nav.graph.findStartDestination().id) { inclusive = true }
            }
        }
    }
    val showDashboardBar = isDashboardTabDestination(backStack)
    val showLegacyBar = current?.hierarchy?.any { it.route in TABS.map { t -> t.route } } == true && !showDashboardBar

    Scaffold(
        containerColor = FarmanBackground,
        bottomBar = {
            when {
                showDashboardBar -> BottomTabBar(nav)
                showLegacyBar -> {
                    NavigationBar(containerColor = Color(0xFF21100C).copy(alpha = 0.98f)) {
                        TABS.forEach { tab ->
                            val selected = current?.hierarchy?.any { it.route == tab.route } == true
                            NavigationBarItem(
                                selected = selected,
                                onClick = {
                                    nav.navigate(tab.route) {
                                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                icon = { Icon(tab.icon, contentDescription = tab.label) },
                                label = { Text(tab.label) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = FarmanOlive,
                                    selectedTextColor = FarmanOlive,
                                    unselectedIconColor = FarmanSecondary,
                                    unselectedTextColor = FarmanSecondary,
                                    indicatorColor = FarmanOlive.copy(alpha = 0.15f),
                                ),
                            )
                        }
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = start, modifier = Modifier.padding(padding)) {
            composable(Routes.LOGIN) {
                LoginScreen(container, onDone = {
                    nav.navigate(Routes.DASHBOARD) { popUpTo(Routes.LOGIN) { inclusive = true } }
                })
            }
            composable(Routes.DASHBOARD) { DashboardHomeScreen(nav) }
            composable(Routes.OPERATIONS) { OperationsScreen(container, nav) }
            composable(Routes.ORDERS) { OrdersScreen(container, nav) }
            composable(Routes.ORDER_DETAIL) { backStack ->
                OrderDetailScreen(container, backStack.arguments?.getString("id") ?: "")
            }
            composable(Routes.MANAGEMENT) { ManagementScreen(container, nav) }
            composable(Routes.MODULE) { backStack ->
                ManagementModuleScreen(container, nav, backStack.arguments?.getString("key") ?: "")
            }
            composable(Routes.ASSISTANT) { AssistantScreen(container) }
            composable(Routes.MORE) { MoreScreen(container, nav) }
            // Legacy offline-first screens (kept, reachable from مدیریت).
            composable(Routes.LEDGER) { LedgerScreen(container) }
            composable(Routes.RECORD) { RecordScreen(container) }
            composable(Routes.INVENTORY) { InventoryScreen(container) }
            composable(Routes.CATALOG) { CatalogScreen(container, nav) }
            composable(Routes.PRODUCT) { backStack ->
                ProductScreen(container, backStack.arguments?.getString("id") ?: "")
            }
            composable(Routes.INSIGHTS) { InsightsScreen(container) }
            composable(Routes.SYNC) { SyncScreen(container) }
            composable(Routes.SETTINGS) { SettingsScreen(container) }
        }
    }
}
