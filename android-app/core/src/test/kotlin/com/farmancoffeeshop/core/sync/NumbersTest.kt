package com.farmancoffeeshop.core.sync

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class NumbersTest {

    @Test
    fun `integral doubles become longs`() {
        assertEquals(50_000L, normalizeNumbers(50_000.0))
        assertEquals(-3L, normalizeNumbers(-3.0))
        assertEquals(0L, normalizeNumbers(0.0))
    }

    @Test
    fun `fractions survive`() {
        assertEquals(2.5, normalizeNumbers(2.5))
        @Suppress("UNCHECKED_CAST")
        val mapped = normalizeNumbers(mapOf("delta" to 20.5)) as Map<String, Any?>
        assertEquals(20.5, mapped["delta"])
    }

    @Test
    fun `nested maps and lists normalize recursively`() {
        val input = mapOf(
            "entry" to mapOf(
                "amount" to 100.0,
                "metadata" to mapOf("tags" to listOf(1.0, 2.5, "x", null)),
            ),
        )
        @Suppress("UNCHECKED_CAST")
        val out = normalizeNumbers(input) as Map<String, Any?>
        @Suppress("UNCHECKED_CAST")
        val entry = out["entry"] as Map<String, Any?>
        assertEquals(100L, entry["amount"])
        @Suppress("UNCHECKED_CAST")
        val tags = (entry["metadata"] as Map<String, Any?>)["tags"] as List<Any?>
        assertEquals(listOf(1L, 2.5, "x", null), tags)
    }

    @Test
    fun `non numbers pass through`() {
        assertEquals("a", normalizeNumbers("a"))
        assertNull(normalizeNumbers(null))
        assertEquals(true, normalizeNumbers(true))
    }
}
