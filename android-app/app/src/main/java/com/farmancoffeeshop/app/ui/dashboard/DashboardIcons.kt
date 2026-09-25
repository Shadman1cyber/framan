package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

enum class DashboardIconKind {
    Home,
    Coins,
    Cube,
    Users,
}

@Composable
fun DashboardIcon(kind: DashboardIconKind, modifier: Modifier = Modifier, tint: Color = DashboardTokens.icon) {
    when (kind) {
        DashboardIconKind.Home -> Icon(Icons.Filled.Home, contentDescription = null, modifier = modifier, tint = tint)
        DashboardIconKind.Coins -> CoinsIcon(modifier, tint)
        DashboardIconKind.Cube -> CubeIcon(modifier, tint)
        DashboardIconKind.Users -> UsersIcon(modifier, tint)
    }
}

@Composable
fun SearchIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.icon) {
    Icon(Icons.Filled.Search, contentDescription = null, modifier = modifier, tint = tint)
}

@Composable
fun BellIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.icon) {
    Icon(Icons.Filled.Notifications, contentDescription = null, modifier = modifier, tint = tint)
}

@Composable
fun CalendarIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.icon) {
    Icon(Icons.Filled.DateRange, contentDescription = null, modifier = modifier, tint = tint)
}

@Composable
fun UserIcon(modifier: Modifier = Modifier, tint: Color = Color.White) {
    Icon(Icons.Filled.Person, contentDescription = null, modifier = modifier, tint = tint)
}

@Composable
fun ArrowLeftIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.primaryButtonText) {
    Canvas(modifier = modifier) {
        val stroke = DashboardTokens.iconStroke.dp.toPx()
        val centerY = size.height / 2f
        drawLine(tint, Offset(size.width * 0.86f, centerY), Offset(size.width * 0.14f, centerY), stroke, StrokeCap.Round)
        drawLine(tint, Offset(size.width * 0.14f, centerY), Offset(size.width * 0.4f, size.height * 0.24f), stroke, StrokeCap.Round)
        drawLine(tint, Offset(size.width * 0.14f, centerY), Offset(size.width * 0.4f, size.height * 0.76f), stroke, StrokeCap.Round)
    }
}

@Composable
fun CoinsIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.green) {
    Canvas(modifier = modifier) {
        val stroke = DashboardTokens.iconStroke.dp.toPx()
        val center = Offset(size.width / 2f, size.height / 2f)
        val radiusX = size.width * 0.34f
        val radiusY = size.height * 0.17f
        val left = center.x - radiusX
        val top = center.y - radiusY
        val right = center.x + radiusX
        val bottom = center.y + radiusY
        repeat(3) { index ->
            val offset = index * size.height * 0.18f
            drawOval(
                color = tint,
                topLeft = Offset(left, top + offset),
                size = androidx.compose.ui.geometry.Size(radiusX * 2f, radiusY * 2f),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        drawLine(tint, Offset(left, top + size.height * 0.18f), Offset(left, bottom + size.height * 0.18f), stroke, StrokeCap.Round)
        drawLine(tint, Offset(right, top + size.height * 0.18f), Offset(right, bottom + size.height * 0.18f), stroke, StrokeCap.Round)
    }
}

@Composable
fun CubeIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.blue) {
    Canvas(modifier = modifier) {
        val stroke = DashboardTokens.iconStroke.dp.toPx()
        val path = Path().apply {
            moveTo(size.width / 2f, size.height * 0.08f)
            lineTo(size.width * 0.9f, size.height * 0.3f)
            lineTo(size.width * 0.9f, size.height * 0.72f)
            lineTo(size.width / 2f, size.height * 0.94f)
            lineTo(size.width * 0.1f, size.height * 0.72f)
            lineTo(size.width * 0.1f, size.height * 0.3f)
            close()
            moveTo(size.width * 0.1f, size.height * 0.3f)
            lineTo(size.width / 2f, size.height * 0.52f)
            lineTo(size.width * 0.9f, size.height * 0.3f)
            moveTo(size.width / 2f, size.height * 0.52f)
            lineTo(size.width / 2f, size.height * 0.94f)
        }
        drawPath(path, tint, style = Stroke(width = stroke, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

@Composable
fun UsersIcon(modifier: Modifier = Modifier, tint: Color = DashboardTokens.purple) {
    Canvas(modifier = modifier) {
        val stroke = DashboardTokens.iconStroke.dp.toPx()
        drawCircle(
            color = tint,
            radius = size.width * 0.27f,
            center = Offset(size.width * 0.38f, size.height * 0.32f),
            style = Stroke(width = stroke),
        )
        drawCircle(
            color = tint,
            radius = size.width * 0.2f,
            center = Offset(size.width * 0.72f, size.height * 0.38f),
            style = Stroke(width = stroke),
        )
        val firstBody = Path().apply {
            moveTo(size.width * 0.1f, size.height * 0.9f)
            cubicTo(size.width * 0.12f, size.height * 0.62f, size.width * 0.28f, size.height * 0.55f, size.width * 0.4f, size.height * 0.55f)
            cubicTo(size.width * 0.53f, size.height * 0.55f, size.width * 0.65f, size.height * 0.64f, size.width * 0.68f, size.height * 0.9f)
        }
        val secondBody = Path().apply {
            moveTo(size.width * 0.62f, size.height * 0.58f)
            cubicTo(size.width * 0.78f, size.height * 0.6f, size.width * 0.9f, size.height * 0.7f, size.width * 0.92f, size.height * 0.9f)
        }
        drawPath(firstBody, tint, style = Stroke(width = stroke, cap = StrokeCap.Round))
        drawPath(secondBody, tint, style = Stroke(width = stroke, cap = StrokeCap.Round))
    }
}
