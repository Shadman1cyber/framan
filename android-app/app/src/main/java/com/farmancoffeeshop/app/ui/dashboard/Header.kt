package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow

@Composable
fun Header() {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = DashboardTokens.headerTop, bottom = DashboardTokens.headerBottom),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(DashboardTokens.avatarSize)
                        .clip(CircleShape)
                        .background(DashboardTokens.blue),
                    contentAlignment = Alignment.Center,
                ) {
                    UserIcon(modifier = Modifier.size(DashboardTokens.iconSize))
                }
                Spacer(modifier = Modifier.size(DashboardTokens.profileGap))
                Column {
                    Text(
                        text = "رستوران آریانا",
                        style = DashboardTokens.profileName,
                        color = DashboardTokens.text,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                    )
                    Text(
                        text = "مدیر عامل",
                        style = DashboardTokens.profileRole,
                        color = DashboardTokens.muted,
                        maxLines = 1,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(DashboardTokens.headerGap)) {
                HeaderIconButton(label = "جستجو") {
                    SearchIcon(modifier = Modifier.size(DashboardTokens.iconSize))
                }
                HeaderIconButton(label = "اعلان‌ها", showNotification = true) {
                    BellIcon(modifier = Modifier.size(DashboardTokens.iconSize))
                }
            }
        }
        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(),
            thickness = DashboardTokens.borderWidth,
            color = DashboardTokens.cardBorder,
        )
    }
}

@Composable
private fun HeaderIconButton(
    label: String,
    showNotification: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = Modifier
            .size(DashboardTokens.touchTarget)
            .clickable(onClick = {})
            .semantics {
                contentDescription = label
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(DashboardTokens.iconButtonSize)
                .clip(CircleShape)
                .background(DashboardTokens.card)
                .border(DashboardTokens.borderWidth, DashboardTokens.cardBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            content()
            if (showNotification) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(DashboardTokens.notificationDotSize / 2)
                        .size(DashboardTokens.notificationDotSize)
                        .clip(CircleShape)
                        .background(DashboardTokens.red),
                )
            }
        }
    }
}
