package com.farmancoffeeshop.app.data.remote

import com.farmancoffeeshop.app.data.remote.dto.AuthCallbackDto
import com.farmancoffeeshop.app.data.remote.dto.CatalogDto
import com.farmancoffeeshop.app.data.remote.dto.CsrfDto
import com.farmancoffeeshop.app.data.remote.dto.InsightsDto
import com.farmancoffeeshop.app.data.remote.dto.PullResponseDto
import com.farmancoffeeshop.app.data.remote.dto.PushRequestDto
import com.farmancoffeeshop.app.data.remote.dto.PushResponseDto
import com.farmancoffeeshop.app.data.remote.dto.SessionDto
import com.farmancoffeeshop.app.data.remote.dto.StatusDto
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * Retrofit surface over the existing FARMAN Next.js API. No new endpoints
 * were invented for the app except GET /api/sync/catalog (protocol v1.1,
 * documented in docs/sync-protocol.md).
 */
interface FarmanApi {
    @GET("api/auth/csrf")
    suspend fun csrf(): CsrfDto

    /**
     * NextAuth credentials callback. Mirrors the web signIn() POST:
     * form-encoded csrfToken + credentials + callbackUrl + json=true.
     * The session cookie arrives via Set-Cookie (see SessionCookieJar).
     */
    @FormUrlEncoded
    @POST("api/auth/callback/credentials")
    suspend fun credentials(
        @Field("csrfToken") csrfToken: String,
        @Field("email") email: String,
        @Field("password") password: String,
        @Field("callbackUrl") callbackUrl: String,
        @Field("json") json: String = "true",
    ): Response<AuthCallbackDto>

    @GET("api/auth/session")
    suspend fun session(): SessionDto

    @POST("api/auth/signout")
    suspend fun signout(): Response<ResponseBody>

    @POST("api/sync/push")
    suspend fun push(@Body request: PushRequestDto): PushResponseDto

    @GET("api/sync/pull")
    suspend fun pull(
        @Query("after") after: Long,
        @Query("take") take: Int,
    ): PullResponseDto

    @GET("api/sync/status")
    suspend fun status(): StatusDto

    @GET("api/sync/catalog")
    suspend fun catalog(): CatalogDto

    @GET("api/admin/ai/insights")
    suspend fun insights(): InsightsDto
}
