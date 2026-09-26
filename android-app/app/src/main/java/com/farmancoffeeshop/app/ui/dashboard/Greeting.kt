package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip

@Composable
fun Greeting() {
    val date = remember { formatJalaliDate() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = DashboardTokens.greetingTop, bottom = DashboardTokens.greetingBottom),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BoxDot()
            Spacer(modifier = Modifier.size(DashboardTokens.greetingGap))
            Text(
                text = "صبح بخیر،",
                style = DashboardTokens.greetingTitle,
                color = DashboardTokens.text,
            )
        }
        Text(
            text = "کسب‌وکار شما در وضعیت پایدار قرار دارد.",
            style = DashboardTokens.mutedBody,
            color = DashboardTokens.muted,
            modifier = Modifier.padding(top = DashboardTokens.greetingDescriptionTop),
        )
        Row(
            modifier = Modifier.padding(top = DashboardTokens.greetingDateTop),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CalendarIcon(modifier = Modifier.size(DashboardTokens.calendarSize))
            Spacer(modifier = Modifier.size(DashboardTokens.greetingGap))
            Text(text = date, style = DashboardTokens.mutedBody, color = DashboardTokens.muted)
        }
    }
}

@Composable
private fun BoxDot() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .size(DashboardTokens.notificationDotSize)
            .clip(CircleShape)
            .background(DashboardTokens.green),
    )
}
