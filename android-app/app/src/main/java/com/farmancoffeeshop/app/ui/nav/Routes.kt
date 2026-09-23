package com.farmancoffeeshop.app.ui.nav

object Routes {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard" // خانه
    const val OPERATIONS = "operations" // عملیات
    const val ORDERS = "orders"
    const val ORDER_DETAIL = "order/{id}"
    const val MANAGEMENT = "management" // مدیریت
    const val MODULE = "module/{key}"
    const val ASSISTANT = "assistant" // دستیار
    const val MORE = "more" // بیشتر

    // Legacy offline-first screens, reachable from مدیریت (no function removed).
    const val LEDGER = "ledger"
    const val RECORD = "record"
    const val INVENTORY = "inventory"
    const val CATALOG = "catalog"
    const val PRODUCT = "product/{id}"
    const val INSIGHTS = "insights"
    const val SYNC = "sync"
    const val SETTINGS = "settings"

    fun order(id: String) = "order/$id"
    fun module(key: String) = "module/$key"
    fun product(id: String) = "product/$id"
}
