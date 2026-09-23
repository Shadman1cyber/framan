package com.farmancoffeeshop.app.data.repository

import com.farmancoffeeshop.app.FakeFarmanServer
import com.farmancoffeeshop.app.TestKit
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AuthFlowTest {
    private lateinit var fake: FakeFarmanServer

    @Before
    fun setup() {
        fake = FakeFarmanServer()
        fake.start()
    }

    @After
    fun teardown() {
        fake.shutdown()
    }

    @Test
    fun `login stores profile and normalizes legacy roles`() = runTest {
        fake.userRole = "ADMIN" // legacy role, like older server rows
        val kit = TestKit(fake.baseUrl)
        val profile = kit.auth.login("admin@farmans.cafe", "correct")
        assertEquals("OWNER", profile.role)
        assertEquals("admin@farmans.cafe", profile.email)
        assertEquals(profile.id, kit.auth.observeProfile().first()?.id)
        // The session cookie is sent on later calls (sync endpoints demand it).
        kit.ledger.recordSale(1_000L)
        val summary = kit.runner.runOnce()
        assertNull(summary.error)
        assertEquals(1, summary.synced)
        kit.close()
    }

    @Test
    fun `wrong password is unauthorized without profile`() = runTest {
        val kit = TestKit(fake.baseUrl)
        try {
            kit.auth.login("admin@farmans.cafe", "wrong")
            fail("expected Unauthorized")
        } catch (e: RepoException.Unauthorized) {
            // expected
        }
        assertNull(kit.auth.profile())
        kit.close()
    }

    @Test
    fun `unreachable server maps to offline or transport`() = runTest {
        // Nothing listens on port 1: connection refused. The offline flag only
        // selects the error mapping (login always attempts; localhost fakes
        // are reachable even when the flag says offline).
        val kit = TestKit("http://127.0.0.1:1/")
        kit.connectivity.online = false
        try {
            kit.auth.login("a@b.c", "correct")
            fail("expected Offline")
        } catch (e: RepoException.Offline) {
            // expected
        }
        kit.connectivity.online = true
        try {
            kit.auth.login("a@b.c", "correct")
            fail("expected Transport")
        } catch (e: RepoException.Transport) {
            // expected: reachable-looking but refused
        }
        kit.close()
    }

    @Test
    fun `previously authenticated session continues offline`() = runTest {
        val kit = TestKit(fake.baseUrl)
        kit.auth.login("admin@farmans.cafe", "correct")
        kit.connectivity.online = false
        val id = kit.ledger.recordSale(2_000L)
        assertNotNull(kit.db.ledger().getById(id))
        kit.close()
    }

    @Test
    fun `logout clears profile and session cookie`() = runTest {
        val kit = TestKit(fake.baseUrl)
        kit.auth.login("admin@farmans.cafe", "correct")
        kit.auth.logout()
        assertNull(kit.auth.profile())
        assertFalse(kit.auth.refreshSession())
        kit.close()
    }

    @Test
    fun `non-owner login succeeds but sync is forbidden`() = runTest {
        fake.userRole = "CASHIER"
        val kit = TestKit(fake.baseUrl)
        kit.auth.login("cashier@farmans.cafe", "correct")
        try {
            kit.auth.requireOwner()
            fail("expected Forbidden")
        } catch (e: RepoException.Forbidden) {
            // honest gating: cashiers cannot use the sync endpoints
        }
        kit.close()
    }
}
