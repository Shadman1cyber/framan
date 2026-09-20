package com.farmancoffeeshop.app.data.repository

import com.farmancoffeeshop.app.core.Connectivity
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.local.UserProfileEntity
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.SessionCookieJar
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.data.remote.dto.SessionDto
import com.farmancoffeeshop.app.sync.ApiProvider
import kotlinx.coroutines.flow.Flow

/**
 * Authentication against the EXISTING NextAuth credentials flow (no new auth
 * system): CSRF → form POST callback/credentials (json=true) → session
 * cookie in the Keystore-backed jar → /api/auth/session profile.
 *
 * - First login is online-only (the server checks the password hash).
 * - Afterwards the session cookie + cached profile allow full offline use.
 * - Passwords are never stored. Role follows server normalizeRole
 *   (ADMIN→OWNER, STAFF→CASHIER legacy mapping).
 */
class AuthRepository(
    private val apis: ApiProvider,
    private val cookieJar: SessionCookieJar,
    private val db: FarmanDatabase,
    private val connectivity: Connectivity,
) {
    private val profiles = db.userProfile()
    private val moshi = HttpClientFactory.moshi

    fun observeProfile(): Flow<UserProfileEntity?> = profiles.observe()

    suspend fun profile(): UserProfileEntity? = profiles.get()

    suspend fun login(email: String, password: String): UserProfileEntity {
        val cleanEmail = email.trim()
        if (cleanEmail.isEmpty() || password.isEmpty()) {
            throw RepoException.Validation("ایمیل و رمز عبور را وارد کنید")
        }
        val api = apis.current()
        val online = connectivity.current()
        return apiCall(moshi, online) {
            val csrf = api.csrf().csrfToken ?: throw RepoException.Transport("شروع ورود ناموفق بود")
            val callbackUrl = apis.baseUrl()
            val resp = api.credentials(csrf, cleanEmail, password, callbackUrl)
            val body = resp.body()
            if (!resp.isSuccessful) {
                throw when (resp.code()) {
                    401 -> RepoException.Unauthorized("ایمیل یا رمز عبور نادرست است")
                    else -> RepoException.Transport("ورود ناموفق بود (HTTP ${resp.code()})")
                }
            }
            // NextAuth answers HTTP 200 + {error: "CredentialsSignin"} on bad credentials.
            if (body?.error != null) {
                throw RepoException.Unauthorized("ایمیل یا رمز عبور نادرست است")
            }
            val session = api.session()
            val user = session.user?.takeIf { it.id != null }
                ?: throw RepoException.Unauthorized("نشست برقرار نشد؛ دوباره تلاش کنید")
            val profile = UserProfileEntity(
                id = user.id!!,
                email = user.email,
                name = user.name,
                role = normalizeRole(user.role),
                fetchedAtMs = TimeUtil.nowMs(),
            )
            profiles.upsert(profile)
            profile
        }
    }

    suspend fun logout() {
        val api = runCatching { apis.current() }.getOrNull()
        if (api != null && connectivity.current()) {
            runCatching { apiCall(moshi, true) { api.signout() } }
        }
        cookieJar.clearSession(apis.host())
        profiles.clear()
    }

    /**
     * Re-validate the session with the server. True = signed in (profile
     * refreshed), false = signed out (profile cleared). Throws Offline /
     * Transport when the answer is unknowable — callers keep the cached
     * profile for offline continuation in that case.
     */
    suspend fun refreshSession(): Boolean {
        val api = apis.current()
        val session: SessionDto = apiCall(moshi, connectivity.current()) { api.session() }
        val user = session.user?.takeIf { it.id != null } ?: run {
            profiles.clear()
            return false
        }
        profiles.upsert(
            UserProfileEntity(user.id!!, user.email, user.name, normalizeRole(user.role), TimeUtil.nowMs()),
        )
        return true
    }

    /** Sync endpoints need finance.view = OWNER (server guard). */
    suspend fun requireOwner(): UserProfileEntity {
        val p = profile() ?: throw RepoException.Unauthorized()
        if (p.role != "OWNER") throw RepoException.Forbidden()
        return p
    }

    companion object {
        fun normalizeRole(role: String?): String {
            return when (role?.uppercase()) {
                "OWNER", "ADMIN" -> "OWNER"
                "CASHIER", "STAFF" -> "CASHIER"
                else -> "CUSTOMER"
            }
        }
    }
}

