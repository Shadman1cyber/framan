package com.farmancoffeeshop.app.data.remote

import android.content.SharedPreferences
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Persistent OkHttp CookieJar for the NextAuth session (+ CSRF double-submit
 * cookie). Cookies live in EncryptedSharedPreferences (Keystore-backed), so
 * the session survives app restarts without ever storing a password.
 * Only session/CSRF cookies are persisted; everything else stays in memory.
 */
class SessionCookieJar(private val prefs: SharedPreferences) : CookieJar {
    private val memory = LinkedHashMap<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val kept = cookies.filter { isManaged(it.name) }
        if (kept.isNotEmpty()) {
            memory[url.host] = kept
            persist(url.host, kept)
        }
        // Always keep the latest in-memory view (even unmanaged ones).
        if (cookies.isNotEmpty() && memory[url.host].isNullOrEmpty()) {
            memory[url.host] = cookies
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val stored = memory[url.host] ?: load(url.host)
        val valid = stored.filter { it.expiresAt > now && it.matches(url) }
        memory[url.host] = valid
        return valid
    }

    /** True when a non-expired session cookie exists for the server host. */
    fun hasSession(host: String): Boolean =
        (memory[host] ?: load(host)).any { it.name == SESSION_COOKIE || it.name == SECURE_SESSION_COOKIE }

    fun clearSession(host: String) {
        memory.remove(host)
        prefs.edit().remove(keyFor(host)).apply()
    }

    fun clearAll() {
        memory.clear()
        val edit = prefs.edit()
        prefs.all.keys.filter { it.startsWith(PREFIX) }.forEach { edit.remove(it) }
        edit.apply()
    }

    private fun persist(host: String, cookies: List<Cookie>) {
        val encoded = cookies.joinToString("\n") { encode(it) }
        prefs.edit().putString(keyFor(host), encoded).apply()
    }

    private fun load(host: String): List<Cookie> {
        val raw = prefs.getString(keyFor(host), null) ?: return emptyList()
        return raw.lines().mapNotNull { runCatching { decode(host, it) }.getOrNull() }
    }

    companion object {
        const val SESSION_COOKIE = "next-auth.session-token"
        const val SECURE_SESSION_COOKIE = "__Secure-next-auth.session-token"
        const val CSRF_COOKIE = "next-auth.csrf-token"
        const val SECURE_CSRF_COOKIE = "__Host-next-auth.csrf-token"
        private const val PREFIX = "cookies|"

        private fun isManaged(name: String): Boolean =
            name == SESSION_COOKIE || name == SECURE_SESSION_COOKIE ||
                name == CSRF_COOKIE || name == SECURE_CSRF_COOKIE

        private fun keyFor(host: String): String = "$PREFIX$host"

        private fun encode(c: Cookie): String = listOf(
            c.name,
            c.value,
            c.expiresAt.toString(),
            c.domain,
            c.path,
            c.secure.toString(),
            c.hostOnly.toString(),
        ).joinToString("\u0001")

        private fun decode(host: String, raw: String): Cookie? {
            val p = raw.split("\u0001")
            if (p.size != 7) return null
            return runCatching {
                Cookie.Builder()
                    .name(p[0]).value(p[1])
                    .expiresAt(p[2].toLong())
                    .path(p[4])
                    .apply {
                        if (p[6].toBoolean()) hostOnlyDomain(host) else domain(p[3])
                        if (p[5].toBoolean()) secure()
                    }
                    .build()
            }.getOrNull()
        }
    }
}
