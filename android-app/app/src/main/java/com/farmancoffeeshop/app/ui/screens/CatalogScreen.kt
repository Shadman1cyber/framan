package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.farmancoffeeshop.app.data.local.ProductEntity
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.banner
import com.farmancoffeeshop.app.ui.appViewModel
import com.farmancoffeeshop.app.ui.components.SyncBadge
import com.farmancoffeeshop.app.ui.nav.Routes
import com.farmancoffeeshop.app.ui.toman
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class CatalogViewModel(private val container: AppContainer) : ViewModel() {
    val products = container.catalog.observeProducts()
    val syncState = container.sync.uiState
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            try {
                container.catalog.syncCatalog()
            } catch (_: Exception) {
            } finally {
                _refreshing.value = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(container: AppContainer, nav: NavController) {
    val vm: CatalogViewModel = appViewModel { CatalogViewModel(container) }
    val products by vm.products.collectAsStateWithLifecycle(initialValue = emptyList())
    val sync by vm.syncState.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }

    val shown = if (query.isBlank()) {
        products
    } else {
        products.filter { it.nameFa.contains(query) || (it.nameEn?.contains(query, ignoreCase = true) == true) }
    }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh) {
        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                SyncBadge(banner = sync.banner(), lastSyncAtMs = sync.lastSyncAtMs, onRetry = vm::refresh)
            }
            item {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    label = { Text("جست‌وجو در منو") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (shown.isEmpty()) {
                item { Text("موردی یافت نشد. برای دریافت منو یک‌بار آنلاین شوید.", style = MaterialTheme.typography.bodyMedium) }
            }
            items(shown, key = { it.id }) { p ->
                ProductRow(p, onOpen = { nav.navigate(Routes.product(p.id)) })
            }
        }
    }
}

@Composable
fun ProductRow(p: ProductEntity, onOpen: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                Text(p.nameFa, style = MaterialTheme.typography.titleSmall)
                if (!p.isAvailable) {
                    Text("ناموجود", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
            Text(p.price.toman())
        }
    }
}

@Composable
fun ProductScreen(container: AppContainer, id: String) {
    var detail by remember { mutableStateOf<com.farmancoffeeshop.app.data.repository.ProductDetail?>(null) }
    androidx.compose.runtime.LaunchedEffect(id) {
        detail = container.catalog.productDetail(id)
    }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val d = detail
        if (d == null) {
            Text("در حال بارگذاری…")
        } else {
            Text(d.product.nameFa, style = MaterialTheme.typography.headlineSmall)
            if (!d.product.description.isBlank()) Text(d.product.description)
            Text(d.product.price.toman(), style = MaterialTheme.typography.titleLarge)
            if (d.lines.isNotEmpty()) {
                Text("لاین‌های قهوه:", style = MaterialTheme.typography.titleMedium)
                d.lines.forEach { l ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(l.nameFa)
                        Text(l.price.toman())
                    }
                }
            }
        }
    }
}
