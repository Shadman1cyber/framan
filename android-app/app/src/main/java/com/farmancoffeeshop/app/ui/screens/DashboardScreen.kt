package com.farmancoffeeshop.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farmancoffeeshop.app.data.local.LedgerEntryEntity
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.ui.toman

/** Legacy ledger helpers (used by LedgerScreen). The iOS-parity Dashboard lives in OpsScreens.kt. */

@Composable
fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall)
        }
    }
}

@Composable
fun EntryRow(e: LedgerEntryEntity) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(entryTypeFa(e.entryType), style = MaterialTheme.typography.titleSmall)
                Text(
                    e.amount.toman(),
                    color = if (e.amount >= 0) MaterialTheme.colorScheme.tertiary
                    else MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    if (e.localState == "SYNCED") "همگام شد" else "در انتظار همگام‌سازی",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    TimeUtil.formatIsoAgo(e.occurredAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

fun entryTypeFa(t: String): String = when (t) {
    "ORDER_COMPLETED" -> "فروش"
    "ORDER_CANCELLED" -> "لغو سفارش"
    "EXPENSE" -> "هزینه"
    "REVERSAL" -> "برگشت"
    "CORRECTION" -> "اصلاح"
    else -> t
}
