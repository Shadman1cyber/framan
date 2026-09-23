package com.farmancoffeeshop.app.data.repository

import com.farmancoffeeshop.app.data.remote.dto.StatusDto
import com.squareup.moshi.Moshi
import retrofit2.HttpException
import java.io.IOException

/**
 * User-facing error model. The app never shows "something went wrong":
 * every failure maps to an actionable state (offline / login / owner /
 * fix-input / retry-later).
 */
sealed class RepoException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    /** No connectivity — local data shown, mutations queue. */
    class Offline(msg: String = "اتصال اینترنت برقرار نیست؛ تغییرات ذخیره و بعداً همگام می‌شود") : RepoException(msg)

    /** 401 or missing session — needs (re-)login. */
    class Unauthorized(msg: String = "نشست منقضی شده؛ لطفاً دوباره وارد شوید") : RepoException(msg)

    /** 403 — a non-owner session can never sync; needs an owner account. */
    class Forbidden(msg: String = "همگام‌سازی نیازمند حساب صاحب کافه است") : RepoException(msg)

    /** Server scope misconfigured (AGENT_CAFE_ID) — admin action required. */
    class ScopeError(msg: String = "پیکربندی سرور ناقص است") : RepoException(msg)

    /** Client-side validation (mirrors server rules; server stays authoritative). */
    class Validation(msg: String) : RepoException(msg)

    /** Reachable server but transport failed — retryable. */
    class Transport(msg: String, cause: Throwable? = null) : RepoException(msg)

    /** 5xx / unexpected — retryable, surfaced. */
    class Server(msg: String) : RepoException(msg)
}

private const val SCOPE_CODE = "SINGLE_CAFE_SCOPE_REQUIRED"

/** Map Retrofit/IO failures to RepoException. `online` = current connectivity. */
suspend fun <T> apiCall(moshi: Moshi, online: Boolean, block: suspend () -> T): T {
    try {
        return block()
    } catch (e: RepoException) {
        throw e
    } catch (e: HttpException) {
        val serverCode = parseServerCode(moshi, e)
        throw when (e.code()) {
            401 -> RepoException.Unauthorized()
            403 -> if (serverCode == SCOPE_CODE) {
                RepoException.ScopeError()
            } else {
                RepoException.Forbidden()
            }
            429 -> RepoException.Transport("محدودیت نرخ؛ کمی بعد تلاش کنید")
            in 500..599 -> RepoException.Server("خطای سرور (${e.code()})؛ بعداً تلاش کنید")
            else -> RepoException.Transport("درخواست ناموفق بود (HTTP ${e.code()})")
        }
    } catch (e: IOException) {
        throw if (online) {
            RepoException.Transport("ارتباط با سرور قطع شد؛ بعداً تلاش کنید", e)
        } else {
            RepoException.Offline()
        }
    } catch (e: IllegalArgumentException) {
        throw RepoException.Validation(e.message ?: "ورودی نامعتبر است")
    }
}

private fun parseServerCode(moshi: Moshi, e: HttpException): String? = runCatching {
    val body = e.response()?.errorBody()?.string() ?: return null
    @Suppress("UNCHECKED_CAST")
    (moshi.adapter(Map::class.java).fromJson(body) as? Map<String, Any?>)?.get("code") as? String
}.getOrNull()
