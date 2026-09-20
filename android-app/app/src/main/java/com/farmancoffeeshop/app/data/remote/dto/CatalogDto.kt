package com.farmancoffeeshop.app.data.remote.dto

import com.squareup.moshi.Json

/** GET /api/sync/catalog (protocol v1.1). All keys are snake_case on the wire. */
data class CatalogDto(
    val version: Long? = null,
    @Json(name = "server_time") val serverTime: String? = null,
    val categories: List<CategoryDto>? = null,
    val products: List<ProductDto>? = null,
    val ingredients: List<IngredientDto>? = null,
    @Json(name = "coffee_lines") val coffeeLines: List<CoffeeLineDto>? = null,
    val staff: List<StaffDto>? = null,
    val tables: List<TableDto>? = null,
)

data class CategoryDto(
    val id: String,
    val slug: String,
    @Json(name = "name_fa") val nameFa: String,
    @Json(name = "name_en") val nameEn: String? = null,
    val icon: String? = null,
    @Json(name = "is_active") val isActive: Boolean = true,
    @Json(name = "sort_order") val sortOrder: Int = 0,
)

data class ProductCoffeeLineDto(
    @Json(name = "coffee_line_id") val coffeeLineId: String,
    @Json(name = "name_fa") val nameFa: String,
    @Json(name = "name_en") val nameEn: String? = null,
    val price: Long,
    @Json(name = "is_active") val isActive: Boolean = true,
)

data class ProductDto(
    val id: String,
    val slug: String,
    @Json(name = "name_fa") val nameFa: String,
    @Json(name = "name_en") val nameEn: String? = null,
    val description: String = "",
    val price: Long,
    val image: String? = null,
    @Json(name = "category_id") val categoryId: String,
    @Json(name = "is_available") val isAvailable: Boolean = true,
    @Json(name = "is_featured") val isFeatured: Boolean = false,
    @Json(name = "sort_order") val sortOrder: Int = 0,
    @Json(name = "allergen_status") val allergenStatus: String = "FREE",
    @Json(name = "prep_base_min") val prepBaseMin: Int = 3,
    @Json(name = "updated_at") val updatedAt: String? = null,
    @Json(name = "coffee_lines") val coffeeLines: List<ProductCoffeeLineDto>? = null,
)

data class IngredientDto(
    val id: String,
    @Json(name = "name_fa") val nameFa: String,
    @Json(name = "name_en") val nameEn: String? = null,
    val unit: String = "GRAM",
    @Json(name = "stock_quantity") val stockQuantity: Double = 0.0,
    @Json(name = "min_quantity") val minQuantity: Double? = null,
    @Json(name = "cost_per_unit") val costPerUnit: Double? = null,
    val supplier: String? = null,
    @Json(name = "is_active") val isActive: Boolean = true,
    @Json(name = "updated_at") val updatedAt: String? = null,
)

data class CoffeeLineDto(
    val id: String,
    @Json(name = "name_fa") val nameFa: String,
    @Json(name = "name_en") val nameEn: String? = null,
    @Json(name = "is_active") val isActive: Boolean = true,
)

data class StaffDto(val id: String, val name: String, val role: String)

data class TableDto(
    val id: String,
    @Json(name = "branch_id") val branchId: String,
    val number: String,
    val label: String? = null,
    @Json(name = "is_occupied") val isOccupied: Boolean = false,
)

/** GET /api/admin/ai/insights */
data class InsightDto(
    val id: String,
    val kind: String = "GENERAL",
    val severity: String = "INFO",
    val title: String = "",
    val body: String = "",
    val createdAt: String? = null,
)

data class InsightsDto(val insights: List<InsightDto>? = null)
