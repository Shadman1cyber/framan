package com.farmancoffeeshop.app.sync

import android.content.Context
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.SyncOperationEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Connectivity + queue state for the status pill and Sync screen. */
data class SyncUiState(
    val isOnline: Boolean = false,
    val isSyncing: Boolean = false,
    val pendingCount: Int = 0,
    val failed: List<SyncOperationEntity> = emptyList(),
    val lastSyncAtMs: Long? = null,
    val lastError: String? = null,
    val authRequired: Boolean = false,
    val catalogVersion: Long = 0L,
)

sealed interface ConnectionBanner {
    data object Hidden : ConnectionBanner
    data class Offline(val pending: Int) : ConnectionBanner
    data class Syncing(val pending: Int) : ConnectionBanner
    data class Error(val message: String) : ConnectionBanner
    data object AuthRequired : ConnectionBanner
    data object Synced : ConnectionBanner
}

fun SyncUiState.banner(): ConnectionBanner = when {
    authRequired -> ConnectionBanner.AuthRequired
    !isOnline && pendingCount > 0 -> ConnectionBanner.Offline(pendingCount)
    !isOnline -> ConnectionBanner.Offline(0)
    isSyncing -> ConnectionBanner.Syncing(pendingCount)
    lastError != null -> ConnectionBanner.Error(lastError)
    else -> ConnectionBanner.Synced
}

/**
 * Sync façade for the UI: state flows, manual triggers, failure recovery.
 * The engine itself lives in SyncRunner (shared with the worker).
 */
class SyncRepository(
    private val context: Context,
    private val db: FarmanDatabase,
    val store: RoomSyncStore,
    private val runner: SyncRunner,
    private val connectivity: Connectivity,
    scope: CoroutineScope,
) {
    private val meta = db.syncMeta()

    private val workState: Flow<Set<WorkInfo.State>> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWorkFlow(SyncWorker.UNIQUE_ONE_SHOT)
            .map { infos -> infos.map { it.state }.toSet() }

    val uiState: StateFlow<SyncUiState> = combine(
        connectivity.isOnline,
        workState,
        db.syncOperations().countPendingFlow(),
        db.syncOperations().failedFlow(),
        meta.observe(MetaKeys.LAST_SYNC_AT_MS),
        meta.observe(MetaKeys.LAST_SYNC_ERROR),
        meta.observe(MetaKeys.AUTH_REQUIRED),
        meta.observe(MetaKeys.CATALOG_VERSION),
    ) { args ->
        @Suppress("UNCHECKED_CAST")
        val online = args[0] as Boolean
        val work = args[1] as Set<WorkInfo.State>
        val pending = args[2] as Int
        val failed = args[3] as List<SyncOperationEntity>
        SyncUiState(
            isOnline = online,
            isSyncing = work.any { it == WorkInfo.State.RUNNING || it == WorkInfo.State.ENQUEUED },
            pendingCount = pending,
            failed = failed,
            lastSyncAtMs = (args[4] as String?)?.toLongOrNull(),
            lastError = args[5] as String?,
            authRequired = (args[6] as String?) == "1",
            catalogVersion = (args[7] as String?)?.toLongOrNull() ?: 0L,
        )
    }.stateIn(scope, SharingStarted.WhileSubscribed(5_000), SyncUiState())

    /** Manual trigger (button / pull-to-refresh): worker runs when online. */
    fun requestSync() = SyncWorker.requestNow(context)

    /** Foreground pass (shares the runner; worker stays the background path). */
    suspend fun runForeground() = runner.runOnce()

    suspend fun retryFailed(key: String): Boolean {
        val ok = store.retryFailed(key)
        if (ok) requestSync()
        return ok
    }

    suspend fun retryAllFailed() {
        store.listFailed().forEach { store.retryFailed(it.idempotencyKey) }
        requestSync()
    }

    /** App start: recover crashed runs, ensure periodic work exists. */
    suspend fun startup() {
        store.resetProcessing()
        SyncWorker.schedulePeriodic(context)
    }

    fun observeWorkStates(): Flow<Set<WorkInfo.State>> = workState

    init {
        // Keep a periodic schedule even if startup() ran before WorkManager init.
        scope.launch { runCatching { SyncWorker.schedulePeriodic(context) } }
    }
}
