package com.farmancoffeeshop.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.core.SettingsStore
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.SessionCookieJar
import com.farmancoffeeshop.app.data.repository.AiRepository
import com.farmancoffeeshop.app.data.repository.AuthRepository
import com.farmancoffeeshop.app.data.repository.CatalogRepository
import com.farmancoffeeshop.app.data.repository.LedgerRepository
import com.farmancoffeeshop.app.data.repository.StockRepository
import com.farmancoffeeshop.app.sync.ApiProvider
import com.farmancoffeeshop.app.sync.RetrofitSyncApi
import com.farmancoffeeshop.app.sync.RoomSyncStore
import com.farmancoffeeshop.app.sync.SyncRepository
import com.farmancoffeeshop.app.sync.SyncRunner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockWebServer

/**
 * Shared harness for app tests. Assembles the REAL production graph
 * (Room + Retrofit + engine + repositories) against a MockWebServer, with
 * only the secret store (plain prefs) and connectivity swapped for fakes.
 */
class TestKit(val baseUrl: String, dbFile: java.io.File? = null) {
    val context: Context = ApplicationProvider.getApplicationContext()
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** Database file (a temp file is created when none is supplied). */
    val dbFile: java.io.File =
        dbFile ?: java.io.File(context.cacheDir, "test-${System.nanoTime()}.db")

    val db: FarmanDatabase = Room.databaseBuilder(context, FarmanDatabase::class.java, this.dbFile.absolutePath)
        .allowMainThreadQueries()
        .build()

    val prefs = context.getSharedPreferences("test-cookies", Context.MODE_PRIVATE)
    val cookieJar = SessionCookieJar(prefs)
    val settings = SettingsStore(context)
    val connectivity = FakeConnectivity()
    val apis = ApiProvider(settings, cookieJar)
    val store = RoomSyncStore(db, HttpClientFactory.moshi)
    val retrofitApi: RetrofitSyncApi

    val auth: AuthRepository
    val ledger: LedgerRepository
    val stock: StockRepository
    val catalog: CatalogRepository
    val ai: AiRepository
    val runner: SyncRunner
    val sync: SyncRepository

    init {
        runBlocking {
            settings.setServerUrl(baseUrl)
            // Prime the API cache (worker does this via apis.current()).
            apis.current()
        }
        retrofitApi = RetrofitSyncApi({ apis.peek() ?: error("API not primed") })
        val deviceId = runBlocking { resolveDeviceId() }
        auth = AuthRepository(apis, cookieJar, db, connectivity)
        ledger = LedgerRepository(db, store) { deviceId }
        stock = StockRepository(db, store) { deviceId }
        catalog = CatalogRepository(db, apis) { connectivity.online }
        ai = AiRepository(db, apis) { connectivity.online }
        runner = SyncRunner(db, store, retrofitApi, catalog, ai, connectivity)
        sync = SyncRepository(context, db, store, runner, connectivity, scope)
    }

    private suspend fun resolveDeviceId(): String {
        val meta = db.syncMeta()
        return meta.get(com.farmancoffeeshop.app.data.local.MetaKeys.DEVICE_ID)
            ?: com.farmancoffeeshop.core.sync.newUuid().also {
                meta.put(com.farmancoffeeshop.app.data.local.SyncMetaEntity(com.farmancoffeeshop.app.data.local.MetaKeys.DEVICE_ID, it))
            }
    }

    fun close() {
        runCatching { db.close() }
    }

    /** Deterministic connectivity double (no framework needed). */
    class FakeConnectivity(var online: Boolean = true) : Connectivity {
        private val state = MutableStateFlow(online)
        override fun current(): Boolean = online
        override val isOnline: StateFlow<Boolean> = state
        override fun observe(): Flow<Boolean> = state
    }
}

/** Starts a MockWebServer and returns (server, baseUrl). Caller shuts down. */
fun startServer(): Pair<MockWebServer, String> {
    val server = MockWebServer()
    server.start()
    // MockWebServer.url() returns http://localhost:port/ — Retrofit-ready.
    return server to server.url("/").toString()
}
