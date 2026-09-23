package com.farmancoffeeshop.app.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import com.farmancoffeeshop.app.FakeFarmanServer
import com.farmancoffeeshop.app.core.Connectivity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.Assert.*
import org.junit.Before
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The REAL SyncWorker against a fake server: proves the WorkManager path
 * (constraints → engine → outbox → server) converges end to end.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = SyncWorkerTest.TestApp::class)
class SyncWorkerTest {

    class OnlineConnectivity : Connectivity {
        override fun current(): Boolean = true
        override val isOnline = MutableStateFlow(true)
        override fun observe(): Flow<Boolean> = isOnline
    }

    class TestApp : FarmanApp() {
        override fun createContainer(): AppContainer {
            val prefs = getSharedPreferences("worker-test", MODE_PRIVATE)
            val container = AppContainer(
                this,
                prefsOverride = prefs,
                connectivityOverride = OnlineConnectivity(),
            )
            runBlocking {
                container.settings.setServerUrl(TestHooks.baseUrl)
                container.apis.current()
                container.primeDeviceId()
            }
            return container
        }

        override fun onContainerReady() {
            // Skip periodic scheduling/recovery: the test drives work directly.
        }
    }

    object TestHooks {
        var baseUrl: String = ""
    }

    companion object {
        private lateinit var fake: FakeFarmanServer

        /**
         * The test Application is created before @Before methods run, so the
         * fake server (whose URL the app bakes into its container) must be up
         * in @BeforeClass.
         */
        @BeforeClass
        @JvmStatic
        fun startServer() {
            fake = FakeFarmanServer()
            fake.start()
            TestHooks.baseUrl = fake.baseUrl
        }

        @AfterClass
        @JvmStatic
        fun stopServer() {
            fake.shutdown()
        }
    }

    @Before
    fun setup() {
        fake.reset()
        val context: Context = ApplicationProvider.getApplicationContext()
        // Wipe rows (not the file: Room may hold the open connection across
        // tests when the Application instance is shared).
        runBlocking(kotlinx.coroutines.Dispatchers.IO) {
            (context as TestApp).container.db.clearAllTables()
        }
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
    }

    @Test
    fun `worker pushes queued ops and pulls server changes`() {
        val context: Context = ApplicationProvider.getApplicationContext()
        val app = context as TestApp
        runBlocking {
            app.container.auth.login("admin@farmans.cafe", "correct")
            app.container.ledger.recordSale(7_000L)
        }
        val worker = TestListenableWorkerBuilder<SyncWorker>(context).build()
        val result = runBlocking { worker.doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        runBlocking {
            assertEquals(0, app.container.db.syncOperations().countPending())
            val rows = app.container.db.ledger().observeAll().first()
            assertEquals(1, rows.count { it.localState == "SYNCED" })
        }
        assertEquals(7_000L, fake.ledgerChanges.single()["amount"])
    }

    @Test
    fun `worker without session succeeds without retry storm`() {
        val context: Context = ApplicationProvider.getApplicationContext()
        val app = context as TestApp
        runBlocking {
            // No login: push 401s → authRequired → success (user action needed).
            app.container.ledger.recordSale(1_000L)
        }
        val worker = TestListenableWorkerBuilder<SyncWorker>(context).build()
        val result = runBlocking { worker.doWork() }
        assertEquals(ListenableWorker.Result.success(), result)
        runBlocking {
            assertEquals(1, app.container.db.syncOperations().countPending())
        }
    }
}
