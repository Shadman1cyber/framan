package com.farmancoffeeshop.app.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Connectivity abstraction. Offline is a first-class mode: the UI reads
 * Room, writes queue up, and connectivity only drives the status pill and
 * WorkManager triggers.
 */
interface Connectivity {
    /** Synchronous snapshot (used by the engine gate and write paths). */
    fun current(): Boolean

    /** Hot connectivity state. */
    val isOnline: StateFlow<Boolean>

    /** Cold flow of connectivity changes (must be collected to activate). */
    fun observe(): Flow<Boolean>
}

/** Production implementation over ConnectivityManager. */
class ConnectivityObserver(context: Context) : Connectivity {
    private val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _isOnline = MutableStateFlow(checkCurrent())
    override val isOnline: StateFlow<Boolean> = _isOnline

    /** Live check (also refreshes the hot state). */
    override fun current(): Boolean {
        val now = checkCurrent()
        _isOnline.value = now
        return now
    }

    override fun observe(): Flow<Boolean> = callbackFlow {
        _isOnline.value = checkCurrent()
        trySend(_isOnline.value)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _isOnline.value = true
                trySend(true)
            }

            override fun onLost(network: Network) {
                val now = checkCurrent()
                _isOnline.value = now
                trySend(now)
            }

            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                val now = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                _isOnline.value = now
                trySend(now)
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        manager.registerNetworkCallback(request, callback)
        awaitClose { manager.unregisterNetworkCallback(callback) }
    }

    private fun checkCurrent(): Boolean {
        val net = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
