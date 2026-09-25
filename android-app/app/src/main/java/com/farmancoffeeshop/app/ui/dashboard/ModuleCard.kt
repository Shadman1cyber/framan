package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip

enum class ModuleKind {
    ERP,
    CRM,
}

data class ModuleData(
    val kind: ModuleKind,
    val label: String,
    val subtitle: String,
    val percent: Float,
    val stats: List<DashboardStat>,
    val actionLabel: String,
    val onClick: () -> Unit,
)

@Composable
fun ModuleCard(module: ModuleData, modifier: Modifier = Modifier) {
    val color = when (module.kind) {
        ModuleKind.ERP -> DashboardTokens.blue
        ModuleKind.CRM -> DashboardTokens.purple
    }
    Surface(
        modifier = modifier,
        shape = DashboardTokens.cardShape,
        color = DashboardTokens.card,
        border = BorderStroke(DashboardTokens.borderWidth, DashboardTokens.cardBorder),
    ) {
        Column(
            modifier = Modifier.padding(DashboardTokens.cardPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            ProgressRing(
                size = DashboardTokens.moduleRingSize,
                radius = DashboardTokens.moduleRingRadius,
                stroke = DashboardTokens.moduleRingStroke,
                percent = module.percent,
                color = color,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    DashboardIcon(
                        kind = if (module.kind == ModuleKind.ERP) DashboardIconKind.Cube else DashboardIconKind.Users,
                        modifier = Modifier.size(DashboardTokens.moduleIconSize),
                        tint = color,
                    )
                    Text(
                        text = module.label,
                        style = DashboardTokens.moduleName,
                        color = DashboardTokens.text,
                        modifier = Modifier.padding(top = DashboardTokens.moduleNameTop),
                    )
                    Text(
                        text = "${module.percent.toInt().toFaPercent()}",
                        style = DashboardTokens.modulePercent,
                        color = DashboardTokens.text,
                    )
                }
            }
            Text(
                text = module.subtitle,
                style = DashboardTokens.mutedBody,
                color = DashboardTokens.muted,
                maxLines = 1,
                modifier = Modifier.padding(top = DashboardTokens.moduleSubtitleTop, bottom = DashboardTokens.moduleSubtitleBottom),
            )
            Column(modifier = Modifier.fillMaxWidth()) {
                module.stats.forEach { stat ->
                    StatItem(stat, StatVariant.Module)
                }
            }
            Spacer(modifier = Modifier.height(DashboardTokens.moduleButtonTop))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(DashboardTokens.moduleButtonTouchHeight)
                    .clickable(onClick = module.onClick),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(DashboardTokens.moduleButtonHeight)
                        .clip(DashboardTokens.pillShape)
                        .background(DashboardTokens.card)
                        .border(DashboardTokens.borderWidth, DashboardTokens.cardBorder, DashboardTokens.pillShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = module.actionLabel, style = DashboardTokens.moduleButton, color = DashboardTokens.text)
                }
            }
        }
    }
}

private fun Int.toFaPercent(): String = toString().map { digit ->
    when (digit) {
        '0' -> '۰'
        '1' -> '۱'
        '2' -> '۲'
        '3' -> '۳'
        '4' -> '۴'
        '5' -> '۵'
        '6' -> '۶'
        '7' -> '۷'
        '8' -> '۸'
        else -> '۹'
    }
}.joinToString("") + "٪"
