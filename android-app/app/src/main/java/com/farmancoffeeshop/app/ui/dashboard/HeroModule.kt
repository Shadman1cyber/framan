package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip

private val heroStats = listOf(
    DashboardStat("درآمدها", "۱۲", "ثبت شده", DashboardTone.Green),
    DashboardStat("هزینه‌ها", "۵", "در حال بررسی", DashboardTone.Yellow),
    DashboardStat("پرداخت‌ها", "۲", "در انتظار", DashboardTone.Red),
)

@Composable
fun HeroModule(onAccountingClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = DashboardTokens.heroTop),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ProgressRing(
            size = DashboardTokens.heroRingSize,
            radius = DashboardTokens.heroRingRadius,
            stroke = DashboardTokens.heroRingStroke,
            percent = 86f,
            color = DashboardTokens.green,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(DashboardTokens.heroIconSize)
                        .clip(CircleShape)
                        .background(DashboardTokens.heroIconBackground),
                    contentAlignment = Alignment.Center,
                ) {
                    CoinsIcon(modifier = Modifier.size(DashboardTokens.heroIconGlyphSize), tint = DashboardTokens.green)
                }
                Text(
                    text = "حسابداری",
                    style = DashboardTokens.heroTitle,
                    color = DashboardTokens.text,
                    modifier = Modifier.padding(top = DashboardTokens.heroTitleTop),
                )
                Text(
                    text = "مالی، هزینه‌ها و درآمدها",
                    style = DashboardTokens.mutedBody,
                    color = DashboardTokens.muted,
                )
                Text(
                    text = "۸۶٪",
                    style = DashboardTokens.heroPercent,
                    color = DashboardTokens.text,
                    modifier = Modifier.padding(top = DashboardTokens.heroPercentTop),
                )
                Text(text = "عملکرد کلی", style = DashboardTokens.mutedBody, color = DashboardTokens.muted)
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = DashboardTokens.heroStatsTop),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            heroStats.forEach { stat ->
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    StatItem(stat, StatVariant.Hero)
                }
            }
        }
        Spacer(modifier = Modifier.height(DashboardTokens.heroButtonTop))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(DashboardTokens.primaryButtonTouchHeight)
                .clickable(onClick = onAccountingClick),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(DashboardTokens.primaryButtonHeight)
                    .clip(DashboardTokens.pillShape)
                    .background(DashboardTokens.primaryButton),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "ورود به بخش حسابداری",
                    style = DashboardTokens.button,
                    color = DashboardTokens.primaryButtonText,
                )
                androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(DashboardTokens.greetingGap))
                ArrowLeftIcon(modifier = Modifier.size(DashboardTokens.iconSize))
            }
        }
    }
}
