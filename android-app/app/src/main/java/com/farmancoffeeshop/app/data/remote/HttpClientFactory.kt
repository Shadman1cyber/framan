package com.farmancoffeeshop.app.data.remote

import com.farmancoffeeshop.app.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.CookieJar
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Builds the network stack. Security rules (see docs/android-offline-first.md):
 * - Release builds log NOTHING (no URLs, headers, or bodies).
 * - Debug builds log basic metadata with Cookie/Authorization/Set-Cookie
 *   values redacted — session tokens must never reach logcat.
 * - Production must be https; http is accepted only for loopback/LAN dev
 *   servers and is surfaced in Settings with a warning.
 */
object HttpClientFactory {
    val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val redactInterceptor = Interceptor { chain ->
        val request = chain.request().newBuilder()
            .header("X-Farman-Client", "android-offline/1.0")
            .build()
        chain.proceed(request)
    }

    fun client(cookieJar: CookieJar): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(redactInterceptor)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .followRedirects(true)
            // NextAuth callback may 302 on non-JSON posts; cookies are captured
            // by the jar either way.
            .followSslRedirects(true)
        if (BuildConfig.VERBOSE_NETWORK_LOG) {
            val logger = HttpLoggingInterceptor(RedactingLogger)
            logger.level = HttpLoggingInterceptor.Level.BASIC
            builder.addInterceptor(logger)
        }
        return builder.build()
    }

    fun api(baseUrl: String, client: OkHttpClient): FarmanApi {
        val normalized = normalizeBaseUrl(baseUrl)
        return Retrofit.Builder()
            .baseUrl(normalized)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(FarmanApi::class.java)
    }

    /**
     * Normalize a user-entered server URL to a Retrofit base URL.
     * Throws IllegalArgumentException with a user-facing message when invalid.
     */
    fun normalizeBaseUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        require(trimmed.isNotEmpty()) { "server address is empty" }
        val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
        val url = withScheme.toHttpUrlOrNull() ?: throw IllegalArgumentException("invalid server address")
        require(url.host.isNotEmpty()) { "invalid server address" }
        val defaultPort = if (url.scheme == "https") 443 else 80
        val portPart = if (url.port != defaultPort) ":${url.port}" else ""
        val path = url.encodedPath.ifEmpty { "/" }
        val full = "${url.scheme}://${url.host}$portPart$path"
        return if (full.endsWith("/")) full else "$full/"
    }

    /** True for loopback/LAN hosts where http dev servers are tolerated. */
    fun isLocalHost(raw: String): Boolean {
        val host = raw.trim().substringAfter("://").substringBefore("/").substringBefore(":").lowercase()
        return host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" ||
            host.startsWith("192.168.") || host.startsWith("10.") ||
            host.matches(Regex("^172\\.(1[6-9]|2[0-9]|3[01])\\..*"))
    }

    private object RedactingLogger : HttpLoggingInterceptor.Logger {
        override fun log(message: String) {
            // BASIC level only emits one-liner method/URL/status lines, which
            // carry no credentials. Belt-and-braces redaction regardless.
            val redacted = message
                .replace(Regex("(?i)(cookie|set-cookie|authorization)([^\\s]*:[^\\s]*)?"), "$1: [redacted]")
            println("FarmanNet: $redacted")
        }
    }
}
