package com.farmancoffeeshop.core.sync

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class BackoffTest {

    @Test
    fun `first attempt waits about one second`() {
        assertEquals(1_000L, computeRetryDelayMs(1) { 0.5 })
    }

    @Test
    fun `attempts double until the cap`() {
        assertEquals(2_000L, computeRetryDelayMs(2) { 0.5 })
        assertEquals(4_000L, computeRetryDelayMs(3) { 0.5 })
        assertEquals(60_000L, computeRetryDelayMs(10) { 0.5 })
        assertEquals(60_000L, computeRetryDelayMs(100) { 0.5 })
    }

    @Test
    fun `jitter stays within 25 percent`() {
        val low = computeRetryDelayMs(2) { 0.0 }
        val high = computeRetryDelayMs(2) { 1.0 }
        assertEquals(1_500L, low)
        assertEquals(2_500L, high)
    }

    @Test
    fun `attempts below one are clamped`() {
        assertEquals(1_000L, computeRetryDelayMs(0) { 0.5 })
        assertEquals(1_000L, computeRetryDelayMs(-3) { 0.5 })
    }
}

class ProtocolTest {

    @Test
    fun `uuid validation matches server rule`() {
        assertTrue(isUuid(newUuid()))
        assertFalse(isUuid("nope"))
        assertFalse(isUuid(""))
    }

    @Test
    fun `change kinds parse from wire`() {
        assertEquals(ChangeKind.LEDGER_ENTRY, ChangeKind.fromWire("ledger_entry"))
        assertEquals(ChangeKind.STOCK_MOVEMENT, ChangeKind.fromWire("stock_movement"))
        assertNull(ChangeKind.fromWire("product"))
    }
}
