package com.farmancoffeeshop.app.ui.ios

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.farmancoffeeshop.app.data.repository.DailyMetric
import com.farmancoffeeshop.app.data.repository.OpsOrder
import com.farmancoffeeshop.app.ui.theme.FarmanBackground
import com.farmancoffeeshop.app.ui.theme.FarmanBorder
import com.farmancoffeeshop.app.ui.theme.FarmanDeepBrown
import com.farmancoffeeshop.app.ui.theme.FarmanOlive
import com.farmancoffeeshop.app.ui.theme.FarmanRaised
import com.farmancoffeeshop.app.ui.theme.FarmanSecondary
import com.farmancoffeeshop.app.ui.theme.FarmanSurface
import com.farmancoffeeshop.app.ui.theme.FarmanText
import com.farmancoffeeshop.app.ui.theme.FarmanWarning
import com.farmancoffeeshop.app.ui.theme.FarmanWine
import java.text.NumberFormat
import java.util.Locale

// ---------- formatting (mirrors Swift money()/faNumber()) ----------

fun money(value: Double): String {
    val f = NumberFormat.getNumberInstance(Locale.US)
    f.maximumFractionDigits = 0
    return "${f.format(value)} تومان"
}

fun faNumber(value: Int): String {
    val f = NumberFormat.getNumberInstance(Locale("fa", "IR"))
    return f.format(value)
}

fun faNumber(value: Long): String {
    val f = NumberFormat.getNumberInstance(Locale("fa", "IR"))
    return f.format(value)
}

fun statusTitle(value: String): String = when (value) {
    "PENDING" -> "در انتظار"
    "CONFIRMED" -> "تأیید"
    "PREPARING" -> "در حال آماده‌سازی"
    "READY" -> "آماده"
    "READY_TO_SERVE" -> "آماده سرو"
    "COMPLETED" -> "تکمیل"
    "CANCELLED" -> "لغو"
    "APPROVED" -> "تأیید شد"
    "REJECTED" -> "رد شد"
    "RESERVED" -> "رزرو شده"
    "SEATED" -> "نشسته"
    "NO_SHOW" -> "عدم حضور"
    else -> value
}

// ---------- background + cards (mirrors ScreenBackground + cardStyle) ----------

@Composable
fun ScreenBackground(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .background(FarmanBackground),
    ) {
        // Radial warm glow top-trailing + bottom shade, like SwiftUI gradients.
        Canvas(modifier = Modifier.matchParentSize()) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF683622).copy(alpha = 0.34f), Color.Transparent),
                    center = Offset(size.width * 0.9f, 0f),
                    radius = size.width * 1.1f,
                ),
                radius = size.width * 1.1f,
                center = Offset(size.width * 0.9f, 0f),
            )
            drawRect(
                brush = Brush.linearGradient(
                    colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.16f)),
                    start = Offset(0f, 0f),
                    end = Offset(0f, size.height),
                ),
            )
        }
        content()
    }
}

@Composable
fun FarmanCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.Transparent,
        border = androidx.compose.foundation.BorderStroke(1.dp, FarmanBorder.copy(alpha = 0.7f)),
    ) {
        Box(
            modifier = Modifier.background(
                Brush.linearGradient(
                    colors = listOf(FarmanSurface, FarmanDeepBrown.copy(alpha = 0.96f)),
                    start = Offset.Zero,
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                ),
            ),
        ) {
            Box(Modifier.padding(16.dp)) { content() }
        }
    }
}

@Composable
fun SectionTitle(title: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = FarmanText, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun EmptyInline(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = FarmanSecondary,
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        textAlign = TextAlign.Center,
    )
}

@Composable
fun SyncFooter(isOnline: Boolean, isBusy: Boolean) {
    FarmanCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (isOnline) "✓" else "▣",
                color = FarmanOlive,
                fontSize = 14.sp,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                if (isOnline) "اطلاعات با سرور همگام است" else "داده‌ها از حافظه دستگاه خوانده شده‌اند",
                style = MaterialTheme.typography.bodySmall,
                color = FarmanSecondary,
                modifier = Modifier.weight(1f),
            )
            if (isBusy) Text("…", color = FarmanOlive)
        }
    }
}

// ---------- offline banner (mirrors OfflineBanner capsule) ----------

@Composable
fun OfflineBanner(lastSyncMs: Long?, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = CircleShape,
        color = FarmanWine.copy(alpha = 0.94f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("📶 آفلاین — نسخه ذخیره‌شده", color = FarmanText, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (lastSyncMs != null) {
                Text(relativeFa(lastSyncMs), color = FarmanText, fontSize = 11.sp)
            }
        }
    }
}

fun relativeFa(ms: Long): String {
    val mins = ((System.currentTimeMillis() - ms) / 60000).coerceAtLeast(0)
    return when {
        mins < 1 -> "لحظاتی پیش"
        mins < 60 -> "‏$mins دقیقه پیش"
        else -> "‏${mins / 60} ساعت پیش"
    }
}

// ---------- dashboard pieces ----------

@Composable
fun MetricCard(title: String, value: String, detail: String, icon: String, tint: Color) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(title, fontSize = 12.sp, color = FarmanSecondary)
                    Text(value, fontSize = 19.sp, fontWeight = FontWeight.Bold, color = FarmanText)
                }
                Box(
                    modifier = Modifier.size(42.dp).clip(CircleShape)
                        .background(tint.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(icon, fontSize = 18.sp)
                }
            }
            Text(
                detail,
                fontSize = 11.sp,
                color = if (detail.contains("↑")) FarmanOlive else FarmanSecondary,
            )
        }
    }
}

@Composable
fun LiveServiceStrip(orders: List<OpsOrder>) {
    val states = remember {
        listOf(
            Quad("PENDING", "در انتظار", "🕐", FarmanWine),
            Quad("CONFIRMED", "تأیید شده", "✅", FarmanOlive),
            Quad("PREPARING", "آماده‌سازی", "🍳", FarmanWine),
            Quad("READY", "آماده تحویل", "🛍️", FarmanOlive),
        )
    }
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row {
                Text("📡 ریل سرویس زنده", color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.weight(1f))
                Text("مشاهده همه ‹", color = FarmanSecondary, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                states.forEach { s ->
                    val count = orders.count { it.status == s.key }
                    Column(
                        modifier = Modifier.weight(1f)
                            .clip(RoundedCornerShape(13.dp))
                            .background(s.tint.copy(alpha = 0.08f))
                            .padding(vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        Text(s.icon, fontSize = 18.sp)
                        Text(s.label, fontSize = 11.sp, color = FarmanText)
                        Text(faNumber(count), fontSize = 19.sp, fontWeight = FontWeight.Bold, color = FarmanText)
                    }
                }
            }
        }
    }
}

private data class Quad(val key: String, val label: String, val icon: String, val tint: Color)

@Composable
fun RevenueChart(points: List<DailyMetric>) {
    FarmanCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("📊 روند فروش", color = FarmanText, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.weight(1f))
                Box(
                    Modifier.clip(RoundedCornerShape(9.dp)).background(FarmanRaised).padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text("۱۴ روز گذشته ⌄", color = FarmanText, fontSize = 12.sp)
                }
            }
            if (points.isEmpty()) {
                EmptyInline("داده نمودار هنوز ذخیره نشده است")
            } else {
                SalesLineGraph(points, Modifier.fillMaxWidth().height(160.dp))
            }
        }
    }
}

@Composable
fun SalesLineGraph(points: List<DailyMetric>, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val maxValue = maxOf(points.maxOfOrNull { it.revenue } ?: 1.0, 1.0)
        val count = maxOf(points.size, 2)
        val inset = 8.dp.toPx()
        val width = maxOf(size.width - inset * 2, 1f)
        val height = maxOf(size.height - 16.dp.toPx(), 1f)
        val coords = points.indices.map { i ->
            val x = inset + i * width / (count - 1)
            val y = size.height - 8.dp.toPx() - (points[i].revenue / maxValue).toFloat() * height
            Offset(x, y)
        }
        // grid lines
        repeat(4) { r ->
            val y = size.height * r / 3f
            drawLine(
                FarmanBorder.copy(alpha = 0.55f),
                Offset(0f, y),
                Offset(size.width, y),
                strokeWidth = 1.dp.toPx(),
            )
        }
        if (coords.size > 1) {
            val path = Path().apply {
                moveTo(coords[0].x, coords[0].y)
                coords.drop(1).forEach { lineTo(it.x, it.y) }
            }
            drawPath(path, FarmanWine, style = Stroke(width = 3.dp.toPx()))
            coords.forEach {
                drawCircle(FarmanWine, radius = 4.5.dp.toPx(), center = it)
            }
        }
    }
}

@Composable
fun StatusPill(status: String, label: String) {
    val tint = if (status == "READY" || status == "COMPLETED") FarmanOlive else FarmanWine
    Box(
        Modifier.clip(CircleShape).background(tint.copy(alpha = 0.14f))
            .padding(horizontal = 10.dp, vertical = 7.dp),
    ) {
        Text(statusTitle(label.ifBlank { status }), color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}
