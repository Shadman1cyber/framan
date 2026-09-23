package com.farmancoffeeshop.core.domain

import com.farmancoffeeshop.core.sync.ChangeKind
import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.PulledChange
import com.farmancoffeeshop.core.sync.newUuid
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class DeriveTest {

    @Test
    fun `balances derive per account as signed sums`() {
        val entries = listOf(
            LedgerEntryView("a", "ORDER_COMPLETED", "cash", 100, 1, null),
            LedgerEntryView("b", "EXPENSE", "cash", -30, 2, null),
            LedgerEntryView("c", "EXPENSE", "bank", -10, 3, null),
        )
        assertEquals(mapOf("cash" to 70L, "bank" to -10L), deriveBalances(entries))
    }

    @Test
    fun `reversal keeps both rows and nets to the correction`() {
        // +100, reversal −100, correction +120 → 120, original row untouched.
        val entries = listOf(
            LedgerEntryView("orig", "EXPENSE", "cash", 100, 1, null),
            LedgerEntryView("rev", "REVERSAL", "cash", -100, 2, "orig"),
            LedgerEntryView("corr", "CORRECTION", "cash", 120, 3, null),
        )
        assertEquals(120L, deriveBalances(entries)["cash"])
    }

    @Test
    fun `stock merges additively across devices`() {
        // 100 +20 (device A offline) −5 (device B offline) = 115.
        assertEquals(115.0, deriveStockLevel(100.0, listOf(20.0, -5.0)))
    }

    @Test
    fun `low stock uses min quantity threshold`() {
        assertTrue(isLowStock(5.0, 10.0))
        assertTrue(isLowStock(10.0, 10.0))
        assertFalse(isLowStock(11.0, 10.0))
        assertFalse(isLowStock(0.0, null))
    }

    @Test
    fun `wire changes fold into views, unknown kinds ignored`() {
        val changes = listOf(
            PulledChange(ChangeKind.LEDGER_ENTRY, "a", 1L, mapOf("entry_type" to "EXPENSE", "account_id" to "cash", "amount" to 50)),
            PulledChange(ChangeKind.STOCK_MOVEMENT, "m", 2L, mapOf("delta" to 5.0)),
        )
        val views = changesToLedgerViews(changes)
        assertEquals(1, views.size)
        assertEquals(50L, views.single().amount)
    }
}

class ValidationTest {
    private val id = newUuid()
    private val device = newUuid()

    @Test
    fun `valid sale passes`() {
        assertEquals(
            ValidationResult.Valid,
            validateLedgerEntry("ORDER_COMPLETED", 50_000L, "TOMAN", id, device, 1L),
        )
    }

    @Test
    fun `ledger rejects bad input`() {
        assertInstanceOf(ValidationResult.Invalid::class.java, validateLedgerEntry("NOPE", 1L, "TOMAN", id, device, 1L))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateLedgerEntry("EXPENSE", 0L, "TOMAN", id, device, 1L))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateLedgerEntry("EXPENSE", 1L, "USD", id, device, 1L))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateLedgerEntry("REVERSAL", 1L, "TOMAN", id, device, 1L))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateLedgerEntry("EXPENSE", 1L, "TOMAN", "x", device, 1L))
    }

    @Test
    fun `stock validation mirrors server rules`() {
        assertEquals(
            ValidationResult.Valid,
            validateStockMovement("ing", 20.0, "خرید روزانه", id, device, 1L, false, true),
        )
        assertInstanceOf(ValidationResult.Invalid::class.java, validateStockMovement("", 1.0, "abc", id, device, 1L, false, true))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateStockMovement("ing", 0.0, "abc", id, device, 1L, false, true))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateStockMovement("ing", 1.0, "ab", id, device, 1L, false, true))
        assertInstanceOf(ValidationResult.Invalid::class.java, validateStockMovement("ing", -1.0, "مصرف روزانه", id, device, 1L, false, true))
        assertEquals(
            ValidationResult.Valid,
            validateStockMovement("ing", -1.0, "مصرف روزانه", id, device, 1L, true, true),
        )
        assertInstanceOf(ValidationResult.Invalid::class.java, validateStockMovement("ing", 1.0, "abc", id, device, 1L, false, false))
    }

    @Test
    fun `operation pairing follows protocol`() {
        assertTrue(isOperationAllowed(EntityTypes.LEDGER_ENTRY, OperationTypes.CREATE_TRANSACTION))
        assertTrue(isOperationAllowed(EntityTypes.STOCK_MOVEMENT, OperationTypes.RECORD_MOVEMENT))
        assertFalse(isOperationAllowed(EntityTypes.STOCK_MOVEMENT, OperationTypes.CREATE_TRANSACTION))
        assertFalse(isOperationAllowed("product", OperationTypes.CREATE_TRANSACTION))
    }
}
