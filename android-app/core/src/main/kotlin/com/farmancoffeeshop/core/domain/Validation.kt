package com.farmancoffeeshop.core.domain

import com.farmancoffeeshop.core.sync.EntityTypes
import com.farmancoffeeshop.core.sync.LedgerEntryTypes
import com.farmancoffeeshop.core.sync.OperationTypes
import com.farmancoffeeshop.core.sync.isUuid

/**
 * Client-side validation mirroring the server rules
 * (src/lib/ledger/service.ts, src/lib/stock/service.ts) for instant UX
 * feedback. The server remains authoritative — these checks only fail fast.
 */
sealed interface ValidationResult {
    data object Valid : ValidationResult
    data class Invalid(val reason: String) : ValidationResult
}

const val MAX_LEDGER_AMOUNT = 2_000_000_000L
const val MAX_STOCK_DELTA = 1_000_000_000.0
const val MIN_REASON_CHARS = 3
const val MAX_REASON_CHARS = 300

fun validateLedgerEntry(
    entryType: String,
    amount: Long,
    currency: String,
    id: String,
    deviceId: String,
    occurredAtMs: Long?,
): ValidationResult {
    if (entryType !in LedgerEntryTypes.all) return ValidationResult.Invalid("unsupported entry type")
    if (entryType == LedgerEntryTypes.REVERSAL) {
        return ValidationResult.Invalid("reversals are created by the server flow only")
    }
    if (amount == 0L || amount < -MAX_LEDGER_AMOUNT || amount > MAX_LEDGER_AMOUNT) {
        return ValidationResult.Invalid("amount must be a non-zero integer within ±2000000000")
    }
    if (currency != "TOMAN") return ValidationResult.Invalid("unsupported currency")
    if (!isUuid(id) || !isUuid(deviceId)) return ValidationResult.Invalid("ids must be UUIDs")
    if (occurredAtMs == null) return ValidationResult.Invalid("date is required")
    return ValidationResult.Valid
}

fun validateStockMovement(
    ingredientId: String,
    delta: Double,
    reason: String,
    id: String,
    deviceId: String,
    occurredAtMs: Long?,
    allowNegative: Boolean,
    ingredientActive: Boolean,
): ValidationResult {
    if (ingredientId.isBlank()) return ValidationResult.Invalid("ingredient is required")
    if (!delta.isFinite() || delta == 0.0 || kotlin.math.abs(delta) > MAX_STOCK_DELTA) {
        return ValidationResult.Invalid("quantity must be a finite non-zero number")
    }
    val trimmed = reason.trim()
    if (trimmed.length < MIN_REASON_CHARS || trimmed.length > MAX_REASON_CHARS) {
        return ValidationResult.Invalid("reason must be 3..300 characters")
    }
    if (!ingredientActive) return ValidationResult.Invalid("ingredient is inactive")
    if (delta < 0 && !allowNegative) {
        return ValidationResult.Invalid("stock decrease requires explicit confirmation")
    }
    if (!isUuid(id) || !isUuid(deviceId)) return ValidationResult.Invalid("ids must be UUIDs")
    if (occurredAtMs == null) return ValidationResult.Invalid("date is required")
    return ValidationResult.Valid
}

/** Pair an entity type with its only valid operation types (protocol v1.1). */
fun isOperationAllowed(entityType: String, operationType: String): Boolean = when (entityType) {
    EntityTypes.LEDGER_ENTRY -> operationType in setOf(
        OperationTypes.CREATE_TRANSACTION,
        OperationTypes.REVERSE_TRANSACTION,
        OperationTypes.CORRECT_TRANSACTION,
    )
    EntityTypes.STOCK_MOVEMENT -> operationType == OperationTypes.RECORD_MOVEMENT
    else -> false
}
