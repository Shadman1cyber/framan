package com.farmancoffeeshop.app.data.remote

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * UTC ISO-8601 formatting/parsing without java.time (minSdk 24 has no
 * java.time without desugaring; SimpleDateFormat works everywhere).
 * Wire format matches the server: 2026-09-19T08:00:00.000Z.
 */
object TimeUtil {
    private val threadFormat = ThreadLocal.withInitial {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    }

    fun nowIso(): String = threadFormat.get()!!.format(Date())

    fun nowMs(): Long = System.currentTimeMillis()

    fun parseIso(iso: String): Long? = runCatching {
        threadFormat.get()!!.parse(iso)?.time
    }.getOrNull()

    fun formatAgo(ms: Long, nowMs: Long = nowMs()): String {
        val diff = (nowMs - ms).coerceAtLeast(0)
        val minutes = diff / 60_000
        return when {
            minutes < 1 -> "لحظاتی پیش"
            minutes < 60 -> "$minutes دقیقه پیش"
            minutes < 60 * 24 -> "${minutes / 60} ساعت پیش"
            else -> "${minutes / (60 * 24)} روز پیش"
        }
    }

    fun formatIsoAgo(iso: String?, nowMs: Long = nowMs()): String {
        val ms = iso?.let { parseIso(it) } ?: return "—"
        return formatAgo(ms, nowMs)
    }
}
