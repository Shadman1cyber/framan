package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.core.SettingsStore
import com.farmancoffeeshop.app.data.remote.FarmanApi
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.SessionCookieJar
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Holds the current Retrofit API, rebuilt whenever the server URL changes.
 * Suspend [current] always returns an API bound to the latest saved URL.
 */
class ApiProvider(
    private val settings: SettingsStore,
    cookieJar: SessionCookieJar,
) {
    private val client = HttpClientFactory.client(cookieJar)
    private val mutex = Mutex()
    private var cached: Pair<String, FarmanApi>? = null
    private val _baseUrl = MutableStateFlow(SettingsStore.DEFAULT_SERVER_URL)
    val baseUrl: StateFlow<String> = _baseUrl

    suspend fun current(): FarmanApi = mutex.withLock {
        val url = HttpClientFactory.normalizeBaseUrl(settings.currentServerUrl())
        val hit = cached
        if (hit != null && hit.first == url) return hit.second
        val api = HttpClientFactory.api(url, client)
        cached = url to api
        _baseUrl.value = url
        api
    }

    /** Normalized base URL without coroutines (falls back to default). */
    fun baseUrl(): String = _baseUrl.value

    /** Cached API without suspending; null until [current] has run once. */
    fun peek(): FarmanApi? = cached?.second

    /** Host of the current server (for cookie scoping). */
    fun host(): String =
        _baseUrl.value.toHttpUrlOrNull()?.host ?: _baseUrl.value
}
