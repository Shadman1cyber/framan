package com.farmancoffeeshop.app.core

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "farman_settings")

/**
 * Non-secret app settings. The server URL is user-editable at runtime
 * (Settings screen); nothing secret is stored here.
 */
class SettingsStore(private val context: Context) {
    val serverUrl: Flow<String> = context.settingsDataStore.data.map { prefs ->
        prefs[SERVER_URL] ?: DEFAULT_SERVER_URL
    }

    suspend fun setServerUrl(url: String) {
        context.settingsDataStore.edit { it[SERVER_URL] = url }
    }

    suspend fun currentServerUrl(): String =
        context.settingsDataStore.data
            .map { it[SERVER_URL] ?: DEFAULT_SERVER_URL }
            .first()

    companion object {
        private val SERVER_URL = stringPreferencesKey("server_url")

        /**
         * Default backend (same server the Capacitor app targets).
         * Editable in Settings; not a secret.
         */
        const val DEFAULT_SERVER_URL = "https://farman-7hm-hesabetam.runflare.cloud"
    }
}
