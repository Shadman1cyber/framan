package com.farmancoffeeshop.app.sync

import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.SyncMetaEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.data.repository.AiRepository
import com.farmancoffeeshop.app.data.repository.CatalogRepository
import com.farmancoffeeshop.core.sync.EngineDeps
import com.farmancoffeeshop.core.sync.SyncSummary
import com.farmancoffeeshop.core.sync.newUuid
import com.farmancoffeeshop.core.sync.runSync

/**
 * One full synchronization pass, shared by the WorkManager worker and
 * foreground refresh: push outbox → pull ledger+stock → catalog snapshot
 * (when due) → meta bookkeeping. Always idempotent; safe to re-run.
 */
class SyncRunner(
    private val db: FarmanDatabase,
    private val store: RoomSyncStore,
    private val api: RetrofitSyncApi,
    private val catalog: CatalogRepository,
    private val ai: AiRepository,
    private val connectivity: Connectivity,
) {
    private val meta = db.syncMeta()

    suspend fun deviceId(): String {
        meta.get(MetaKeys.DEVICE_ID)?.takeIf { it.isNotBlank() }?.let { return it }
        val id = newUuid()
        meta.put(SyncMetaEntity(MetaKeys.DEVICE_ID, id))
        return id
    }

    suspend fun runOnce(): SyncSummary {
        val online = connectivity.current()
        val device = deviceId()
        val result = runSync(
            store,
            api,
            device,
            EngineDeps(isOnline = { online }),
        )
        if (result.authRequired) {
            meta.put(SyncMetaEntity(MetaKeys.AUTH_REQUIRED, "1"))
        } else {
            meta.delete(MetaKeys.AUTH_REQUIRED)
        }
        val error = result.error
        if (error != null) {
            meta.put(SyncMetaEntity(MetaKeys.LAST_SYNC_ERROR, error))
            return result
        }
        // Offline passes attempt nothing; stamping freshness here would lie.
        if (!online) return result
        meta.delete(MetaKeys.LAST_SYNC_ERROR)
        meta.put(SyncMetaEntity(MetaKeys.LAST_SYNC_AT_MS, TimeUtil.nowMs().toString()))
        // Catalog: full fetch only when never fetched, explicitly requested,
        // or stale (>6h). Version compare still guards the replace.
        if (catalogDue()) {
            try {
                catalog.syncCatalog()
                meta.put(SyncMetaEntity(MetaKeys.CATALOG_CHECKED_AT_MS, TimeUtil.nowMs().toString()))
            } catch (e: Exception) {
                meta.put(SyncMetaEntity(MetaKeys.LAST_SYNC_ERROR, "catalog: ${e.message}"))
            }
        }
        // Insights are best-effort here; the UI also refreshes explicitly.
        try {
            ai.refresh()
        } catch (_: Exception) {
        }
        return result
    }

    private suspend fun catalogDue(): Boolean {
        if (!catalog.hasCatalog()) return true
        val checked = meta.get(MetaKeys.CATALOG_CHECKED_AT_MS)?.toLongOrNull() ?: 0L
        return TimeUtil.nowMs() - checked > CATALOG_STALE_MS
    }

    companion object {
        const val CATALOG_STALE_MS = 6L * 60 * 60 * 1000
    }
}

