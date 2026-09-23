package com.farmancoffeeshop.core.sync

import kotlin.math.abs

/**
 * JSON has no int/float distinction and Moshi decodes every JSON number as
 * Double. The outbox payload round-trips through untyped maps, so integral
 * values (ledger amounts, sequences) come back as e.g. 50000.0 and would hit
 * the wire that way. The FARMAN server validates amounts with
 * Number.isSafeInteger (50000.0 passes) but Prisma rejects non-integers for
 * Int columns — so normalize integral Doubles back to Long before pushing.
 * Genuine fractions (stock deltas like 2.5) are preserved.
 */
fun normalizeNumbers(value: Any?): Any? = when (value) {
    is Map<*, *> -> {
        val out = LinkedHashMap<String, Any?>(value.size)
        for ((k, v) in value) out[k as String] = normalizeNumbers(v)
        out
    }
    is List<*> -> value.map { normalizeNumbers(it) }
    is Double -> if (value % 1.0 == 0.0 && abs(value) < 9e15) value.toLong() else value
    is Float -> if (value % 1.0f == 0.0f && abs(value) < 9e15f) value.toLong() else value.toDouble()
    else -> value
}
