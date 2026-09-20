package com.farmancoffeeshop.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.screens.CatalogScreen
import com.farmancoffeeshop.app.ui.screens.DashboardScreen
import com.farmancoffeeshop.app.ui.screens.InsightsScreen
import com.farmancoffeeshop.app.ui.screens.InventoryScreen
import com.farmancoffeeshop.app.ui.screens.LedgerScreen
import com.farmancoffeeshop.app.ui.screens.LoginScreen
import com.farmancoffeeshop.app.ui.screens.MoreScreen
import com.farmancoffeeshop.app.ui.screens.ProductScreen
import com.farmancoffeeshop.app.ui.screens.RecordScreen
import com.farmancoffeeshop.app.ui.screens.SettingsScreen
import com.farmancoffeeshop.app.ui.screens.SyncScreen
import com.farmancoffeeshop.app.ui.theme.FarmanTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as FarmanApp).container
        setContent {
            FarmanTheme {
                // Persian RTL across the whole app.
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
    Tab(Routes.LEDGER, "دفتر", Icons.Filled.List),
    Tab(Routes.RECORD, "ثبت", Icons.Filled.Add),
    Tab(Routes.INVENTORY, "انبار", Icons.Filled.ShoppingCart),
    Tab(Routes.MORE, "بیشتر", Icons.Filled.MoreVert),
)

@Composable
fun FarmanNav(container: com.farmancoffeeshop.app.sync.AppContainer) {
    val nav = rememberNavController()
    val profile by container.auth.observeProfile().collectAsStateWithLifecycle(initialValue = null)
    var authChecked by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        container.auth.profile()
        authChecked = true
    }
    if (!authChecked) {
        // Splash: avoids flashing LOGIN before the cached profile loads, so a
        // previously authenticated user opens straight into offline content.
        Box(Modifier.fillMaxSize()) {
            Text("کافه فرمان", modifier = Modifier.padding(24.dp))
        }
        return
    }
    val start = if (profile == null) Routes.LOGIN else Routes.DASHBOARD
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination
    // After logout the profile vanishes: send the user back to LOGIN.
    LaunchedEffect(profile) {
        if (profile == null && current?.route != null && current?.route != Routes.LOGIN) {
            nav.navigate(Routes.LOGIN) {
                popUpTo(nav.graph.findStartDestination().id) { inclusive = true }
            }
        }
    }
    val showBar = current?.hierarchy?.any { it.route in TABS.map { t -> t.route } } == true

    Scaffold(
        bottomBar = {
            if (showBar) {
                NavigationBar {
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
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = start, modifier = Modifier.padding(padding)) {
            composable(Routes.LOGIN) { LoginScreen(container, onDone = {
                nav.navigate(Routes.DASHBOARD) { popUpTo(Routes.LOGIN) { inclusive = true } }
            }) }
            composable(Routes.DASHBOARD) { DashboardScreen(container) }
            composable(Routes.LEDGER) { LedgerScreen(container) }
            composable(Routes.RECORD) { RecordScreen(container) }
            composable(Routes.INVENTORY) { InventoryScreen(container) }
            composable(Routes.MORE) { MoreScreen(container, nav) }
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
