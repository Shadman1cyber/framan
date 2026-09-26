package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow

enum class DashboardTone {
    Green,
    Yellow,
    Red,
    Blue,
    Purple,
}

data class DashboardStat(
    val label: String,
    val value: String,
    val status: String? = null,
    val tone: DashboardTone,
)

@Composable
fun StatItem(stat: DashboardStat, variant: StatVariant) {
    when (variant) {
        StatVariant.Hero -> HeroStatItem(stat)
        StatVariant.Module -> ModuleStatItem(stat)
    }
}

enum class StatVariant {
    Hero,
    Module,
}

@Composable
private fun HeroStatItem(stat: DashboardStat) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            ToneDot(stat.tone)
            SpacerGap()
            Text(
                text = stat.label,
                style = DashboardTokens.mutedBody,
                color = DashboardTokens.muted,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
        }
        Text(
            text = stat.value,
            style = DashboardTokens.heroStatValue,
            color = DashboardTokens.text,
            modifier = Modifier.padding(top = DashboardTokens.greetingDescriptionTop),
        )
        Text(
            text = stat.status.orEmpty(),
            style = DashboardTokens.mutedBody,
            color = DashboardTokens.muted,
            maxLines = 1,
            overflow = TextOverflow.Clip,
            modifier = Modifier.padding(top = DashboardTokens.greetingDescriptionTop),
        )
    }
}

@Composable
private fun ModuleStatItem(stat: DashboardStat) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ToneDot(stat.tone)
            SpacerGap()
            Text(
                text = stat.label,
                style = DashboardTokens.moduleStat,
                color = DashboardTokens.muted,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
        }
        Text(
            text = stat.value,
            style = DashboardTokens.moduleStat,
            color = DashboardTokens.text,
            maxLines = 1,
        )
    }
}

@Composable
private fun ToneDot(tone: DashboardTone) {
    val color = when (tone) {
        DashboardTone.Green -> DashboardTokens.green
        DashboardTone.Yellow -> DashboardTokens.yellow
        DashboardTone.Red -> DashboardTokens.red
        DashboardTone.Blue -> DashboardTokens.blue
        DashboardTone.Purple -> DashboardTokens.purple
    }
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .size(DashboardTokens.notificationDotSize)
            .clip(CircleShape)
            .background(color),
    )
}

@Composable
private fun SpacerGap() {
    androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(DashboardTokens.greetingGap))
}
