package com.farmancoffeeshop.app.data.repository

import com.farmancoffeeshop.app.data.local.AiInsightEntity
import com.farmancoffeeshop.app.data.local.FarmanDatabase
import com.farmancoffeeshop.app.data.remote.HttpClientFactory
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.ApiProvider
import com.farmancoffeeshop.app.sync.insightEntityOf
import kotlinx.coroutines.flow.Flow

/**
 * AI insights are cached server products: readable offline, (re)generated
 * online only. The app never fabricates insight content on-device.
 */
class AiRepository(
    private val db: FarmanDatabase,
    private val apis: ApiProvider,
    private val online: () -> Boolean,
) {
    private val dao = db.aiInsights()
    private val moshi = HttpClientFactory.moshi

    fun observe(): Flow<List<AiInsightEntity>> = dao.observe()

    /** Explicit online refresh (pull-to-refresh / retry button). */
    suspend fun refresh() {
        val dto = apiCall(moshi, online()) { apis.current().insights() }
        val now = TimeUtil.nowMs()
        val rows = dto.insights.orEmpty().map { insightEntityOf(it, now) }
        db.aiInsights().let {
            it.clear()
            it.upsertAll(rows)
        }
    }
}
