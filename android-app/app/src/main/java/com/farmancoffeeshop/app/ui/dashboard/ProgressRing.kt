package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp

@Composable
fun ProgressRing(
    size: Dp,
    radius: Dp,
    stroke: Dp,
    percent: Float,
    color: Color,
    content: @Composable () -> Unit,
) {
    Box(modifier = Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize().padding(stroke / 2)) {
            val radiusPx = radius.toPx()
            val strokePx = stroke.toPx()
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val diameter = radiusPx * 2f
            drawCircle(
                color = DashboardTokens.ringTrack,
                radius = radiusPx,
                center = center,
                style = Stroke(width = strokePx),
            )
            drawArc(
                color = color,
                startAngle = -90f,
                sweepAngle = percent * 360f / 100f,
                useCenter = false,
                topLeft = Offset(center.x - radiusPx, center.y - radiusPx),
                size = Size(diameter, diameter),
                style = Stroke(width = strokePx, cap = StrokeCap.Round),
            )
        }
        content()
    }
}
