package com.farmancoffeeshop.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.farmancoffeeshop.app.data.repository.RepoException
import com.farmancoffeeshop.app.sync.AppContainer
import com.farmancoffeeshop.app.sync.FarmanApp

@Composable
fun appContainer(): AppContainer =
    (LocalContext.current.applicationContext as FarmanApp).container

class VmFactory(private val create: () -> ViewModel) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}

@Composable
inline fun <reified VM : ViewModel> appViewModel(noinline create: () -> VM): VM =
    viewModel(factory = VmFactory(create))

/** User-facing message for any failure (RepoException messages are Persian). */
fun userMessage(e: Throwable?): String = when (e) {
    null -> ""
    is RepoException -> e.message ?: "خطا"
    else -> "خطای غیرمنتظره؛ دوباره تلاش کنید"
}

fun Long.toman(): String = "%,d تومان".format(this)

fun Double.compact(): String = if (this % 1.0 == 0.0) {
    "%,.0f".format(this)
} else {
    "%,.2f".format(this).trimEnd('0').trimEnd('.')
}
