package com.farmancoffeeshop.core.domain

import com.farmancoffeeshop.core.sync.ChangeKind
import com.farmancoffeeshop.core.sync.PulledChange

/**
 * Derived-read math. Balances and stock levels are NEVER stored — they are
 * computed from the append-only mirrors, exactly like the server derives
 * `ledgerBalance` (src/lib/ledger/service.ts). This is what makes concurrent
 * offline devices merge additively (100 +20 −5 = 115) instead of
 * last-write-wins.
 */

data class LedgerEntryView(
    val id: String,
    val entryType: String,
    val accountId: String,
    val amount: Long,
    val serverSequence: Long,
    val reversalOf: String?,
)

/** Authoritative balance per account: SUM(amount) over mirrored entries. */
fun deriveBalances(entries: List<LedgerEntryView>): Map<String, Long> {
    val totals = HashMap<String, Long>()
    for (e in entries) totals[e.accountId] = (totals[e.accountId] ?: 0L) + e.amount
    return totals
}

/** Total revenue basis: ORDER_COMPLETED postings minus ORDER_CANCELLED ones. */
fun deriveRevenue(entries: List<LedgerEntryView>): Long =
    entries.filter { it.entryType == "ORDER_COMPLETED" || it.entryType == "ORDER_CANCELLED" }
        .sumOf { it.amount }

/**
 * Local stock level = last server snapshot + sum of ALL known movement deltas
 * (synced pulls + local pending ops, which are already applied locally at
 * write time). Never max(), never overwrite.
 */
fun deriveStockLevel(snapshotQuantity: Double, deltas: List<Double>): Double =
    deltas.fold(snapshotQuantity) { acc, d -> acc + d }

/** Low-stock check mirrors the server `minQuantity` semantics. */
fun isLowStock(level: Double, minQuantity: Double?): Boolean =
    minQuantity != null && level <= minQuantity

/** Fold pulled wire changes into typed views (unknown kinds are ignored). */
fun changesToLedgerViews(changes: List<PulledChange>): List<LedgerEntryView> =
    changes.filter { it.kind == ChangeKind.LEDGER_ENTRY }.mapNotNull { c ->
        val amount = (c.data["amount"] as? Number)?.toLong() ?: return@mapNotNull null
        LedgerEntryView(
            id = c.id,
            entryType = c.data["entry_type"] as? String ?: return@mapNotNull null,
            accountId = c.data["account_id"] as? String ?: "cash",
            amount = amount,
            serverSequence = c.serverSequence,
            reversalOf = c.data["reversal_of"] as? String,
        )
    }
