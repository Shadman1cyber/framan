package com.farmancoffeeshop.app.sync

import android.content.Context
import androidx.room.Room
import androidx.work.Configuration
import androidx.work.WorkManager
import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.core.ConnectivityObserver
import com.farmancoffeeshop.app.core.SecureStore
import com.farmancoffeeshop.app.core.SettingsStore
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.MetaKeys
import com.farmancoffeeshop.app.data.local.SyncMetaEntity
import com.farmancoffeeshop.app.data.remote.FarmanApi
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.SessionCookieJar
import com.farmancoffeeshop.app.data.repository.AiRepository
import com.farmancoffeeshop.app.data.repository.AuthRepository
import com.farmancoffeeshop.app.data.repository.CatalogRepository
import com.farmancoffeeshop.app.data.repository.LedgerRepository
import com.farmancoffeeshop.app.data.repository.OpsRepository
import com.farmancoffeeshop.app.data.repository.StockRepository
import com.farmancoffeeshop.core.sync.newUuid
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Manual dependency injection (no Hilt: keeps the build reproducible and the
 * graph explicit). UI layers only ever receive repositories, never Retrofit.
 */
class AppContainer(
    private val context: Context,
    prefsOverride: android.content.SharedPreferences? = null,
    connectivityOverride: Connectivity? = null,
) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val db: FarmanDatabase = Room.databaseBuilder(
        context,
        FarmanDatabase::class.java,
        "farman.db",
    ).build()

    private val secureStore: SecureStore by lazy { SecureStore(context) }

    /**
     * Lazy so that CONSTRUCTING the container never touches the Android
     * Keystore (unavailable under Robolectric) or the network. First use
     * happens on a real device, or in tests with prefsOverride.
     */
    val cookieJar: SessionCookieJar by lazy { SessionCookieJar(prefsOverride ?: secureStore.prefs) }
    val settings = SettingsStore(context)
    val connectivity = connectivityOverride ?: ConnectivityObserver(context)

    val apis: ApiProvider by lazy { ApiProvider(settings, cookieJar) }
    val store = RoomSyncStore(db, HttpClientFactory.moshi)
    val retrofitApi = RetrofitSyncApi(
        api = { apis.peek() ?: throw IllegalStateException("API not primed") },
    )

    /** Device UUID, generated once and stored in sync_meta. */
    private suspend fun resolveDeviceId(): String {
        val meta = db.syncMeta()
        meta.get(MetaKeys.DEVICE_ID)?.takeIf { it.isNotBlank() }?.let { return it }
        val id = newUuid()
        meta.put(SyncMetaEntity(MetaKeys.DEVICE_ID, id))
        return id
    }

    // Repositories need the device id synchronously at write time; it is
    // cached after the first suspend read (primed at app start, before any UI
    // write path can run — screens suspend on container readiness anyway).
    @Volatile private var cachedDeviceId: String? = null
    private fun deviceIdNow(): String = cachedDeviceId
        ?: throw IllegalStateException("device id not primed yet")

    /** Resolve + cache the device id (app start does this; tests call it too). */
    suspend fun primeDeviceId(): String {
        val id = resolveDeviceId()
        cachedDeviceId = id
        return id
    }

    val auth: AuthRepository by lazy { AuthRepository(apis, cookieJar, db, connectivity) }
    val ledger: LedgerRepository by lazy { LedgerRepository(db, store, ::deviceIdNow) }
    val stock: StockRepository by lazy { StockRepository(db, store, ::deviceIdNow) }
    val catalog: CatalogRepository by lazy { CatalogRepository(db, apis) { connectivity.current() } }
    val ai: AiRepository by lazy { AiRepository(db, apis) { connectivity.current() } }
    /** iOS-parity ops store (orders/analytics/overview/chat + offline cache). */
    val ops: OpsRepository by lazy { OpsRepository(context, apis, connectivity) }

    val syncRunner: SyncRunner by lazy { SyncRunner(db, store, retrofitApi, catalog, ai, connectivity) }
    val sync: SyncRepository by lazy { SyncRepository(context, db, store, syncRunner, connectivity, appScope) }

    fun start() {
        appScope.launch(Dispatchers.IO) {
            runCatching { apis.current() }
            cachedDeviceId = runCatching { resolveDeviceId() }.getOrNull()
            runCatching { sync.startup() }
        }
    }
}

/** Application: owns the container and provides manual WorkManager init. */
open class FarmanApp : android.app.Application(), Configuration.Provider {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = createContainer()
        // Manual init (auto-init is disabled in the manifest) so the worker
        // factory/configuration is always ours.
        runCatching { WorkManager.initialize(this, workManagerConfiguration) }
        onContainerReady()
    }

    /** Overridden by tests to inject a container bound to a fake server. */
    protected open fun createContainer(): AppContainer = AppContainer(this)

    /** Starts sync recovery/scheduling; tests override to drive work manually. */
    protected open fun onContainerReady() {
        container.start()
        container.appScope.launch(Dispatchers.IO) {
            container.connectivity.observe().collect { }
        }
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().build()
}
