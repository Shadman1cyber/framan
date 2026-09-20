package com.farmancoffeeshop.app.ui.nav

object Routes {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
    const val LEDGER = "ledger"
    const val RECORD = "record"
    const val INVENTORY = "inventory"
    const val MORE = "more"
    const val CATALOG = "catalog"
    const val PRODUCT = "product/{id}"
    const val INSIGHTS = "insights"
    const val SYNC = "sync"
    const val SETTINGS = "settings"

    fun product(id: String) = "product/$id"
}
