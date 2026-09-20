package com.farmancoffeeshop.core.sync

import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

const val BASE_DELAY_MS = 1_000L
const val MAX_DELAY_MS = 60_000L
const val MAX_BATCH = 20
const val PULL_TAKE = 200

/**
 * Exponential backoff with ±25% jitter. Ports `computeRetryDelayMs` from
 * src/lib/offline/ledger-outbox.ts so Android retries on the same schedule
 * as the web client: 1s, 2s, 4s, 8s … capped at 60s.
 */
fun computeRetryDelayMs(attempt: Int, rand: () -> Double = Math::random): Long {
    val safeAttempt = min(max(attempt, 1), 10)
    val backoff = min(BASE_DELAY_MS * 2.0.pow(safeAttempt - 1), MAX_DELAY_MS.toDouble())
    val jitter = backoff * 0.25 * (rand() * 2 - 1)
    return (backoff + jitter).roundToLong().coerceAtLeast(0L)
}
