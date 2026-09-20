package com.farmancoffeeshop.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.farmancoffeeshop.app.data.remote.TimeUtil
import com.farmancoffeeshop.app.sync.ConnectionBanner

/**
 * Non-intrusive connectivity pill. Offline is a mode, not an error:
 * "آفلاین — ۳ تغییر در انتظار".
 */
@Composable
fun SyncBadge(banner: ConnectionBanner, lastSyncAtMs: Long?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val (icon, text, action) = when (banner) {
        is ConnectionBanner.Offline -> Triple(
            Icons.Filled.Warning as ImageVector?,
            if (banner.pending > 0) "آفلاین — ${banner.pending} تغییر در انتظار" else "آفلاین",
            null as String?,
        )
        is ConnectionBanner.Syncing -> Triple(null, "در حال همگام‌سازی…", null)
        is ConnectionBanner.Error -> Triple(Icons.Filled.Warning, "خطای همگام‌سازی", "تلاش مجدد")
        ConnectionBanner.AuthRequired -> Triple(Icons.Filled.Warning, "نیاز به ورود مجدد", null)
        ConnectionBanner.Synced -> Triple(Icons.Filled.Check, "همگام شد", null)
        ConnectionBanner.Hidden -> return
    }
    Surface(
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.small,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start,
        ) {
            if (banner is ConnectionBanner.Syncing) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
            } else if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.width(8.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
            if (lastSyncAtMs != null && banner is ConnectionBanner.Synced) {
                Spacer(Modifier.width(8.dp))
                Text(
                    "• ${TimeUtil.formatAgo(lastSyncAtMs)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (action != null) {
                Spacer(Modifier.width(8.dp))
                FilterChip(selected = false, onClick = onRetry, label = { Text(action) })
            }
        }
    }
}
