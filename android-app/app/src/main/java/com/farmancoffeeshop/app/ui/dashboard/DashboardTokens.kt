package com.farmancoffeeshop.app.ui.dashboard

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.farmancoffeeshop.app.R

object DashboardTokens {
    val background = Color(0xFF0A1020)
    val card = Color(0xFF111A2E)
    val cardBorder = Color(0xFF1C2740)
    val ringTrack = Color(0xFF1C2A45)
    val text = Color(0xFFE8ECF5)
    val muted = Color(0xFF7F8AA3)
    val green = Color(0xFF22E6B0)
    val blue = Color(0xFF4F86FF)
    val purple = Color(0xFF9B5CF6)
    val yellow = Color(0xFFF5C542)
    val red = Color(0xFFFF5A6E)
    val primaryButton = Color(0xFF17B894)
    val primaryButtonText = Color(0xFF04231C)
    val heroIconBackground = Color(0xFF0F2A35)
    val icon = Color(0xFFB6BFD4)
    val tabBackground = Color(0xFF0C1426)

    val fontFamily = FontFamily(
        Font(R.font.vazirmatn_regular, FontWeight.Normal),
        Font(R.font.vazirmatn_medium, FontWeight.Medium),
        Font(R.font.vazirmatn_semibold, FontWeight.SemiBold),
        Font(R.font.vazirmatn_bold, FontWeight.Bold),
    )

    val screenPadding = 14.dp
    val maxContentWidth = 640.dp
    val headerTop = 12.dp
    val headerBottom = 10.dp
    val headerGap = 8.dp
    val profileGap = 8.dp
    val avatarSize = 34.dp
    val iconButtonSize = 34.dp
    val touchTarget = 44.dp
    val iconSize = 18.dp
    val notificationDotSize = 7.dp
    val borderWidth = 1.dp
    val cardShape = RoundedCornerShape(14.dp)
    val pillShape = RoundedCornerShape(percent = 50)

    val greetingTop = 12.dp
    val greetingBottom = 6.dp
    val greetingGap = 6.dp
    val greetingDescriptionTop = 4.dp
    val greetingDateTop = 6.dp
    val calendarSize = 14.dp

    val heroTop = 8.dp
    val heroRingSize = 190.dp
    val heroRingRadius = 80.dp
    val heroRingStroke = 14.dp
    val heroIconSize = 36.dp
    val heroIconGlyphSize = 20.dp
    val heroTitleTop = 4.dp
    val heroPercentTop = 2.dp
    val heroStatsTop = 12.dp
    val heroButtonTop = 12.dp
    val primaryButtonHeight = 36.dp
    val primaryButtonTouchHeight = 44.dp

    val modulesTop = 16.dp
    val moduleGap = 10.dp
    val cardPadding = 12.dp
    val moduleRingSize = 104.dp
    val moduleRingRadius = 44.dp
    val moduleRingStroke = 8.dp
    val moduleIconSize = 18.dp
    val moduleNameTop = 4.dp
    val moduleSubtitleTop = 4.dp
    val moduleSubtitleBottom = 8.dp
    val moduleStatLineHeight = 20.sp
    val moduleButtonTop = 8.dp
    val moduleButtonHeight = 32.dp
    val moduleButtonTouchHeight = 44.dp

    val tabTopPadding = 10.dp
    val tabBottomPadding = 8.dp
    val tabHeight = 63.dp
    val tabIconSize = 20.dp
    val tabGap = 2.dp
    val mainBottom = 8.dp
    val iconStroke = 1.8f

    val profileName = TextStyle(fontFamily = fontFamily, fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp)
    val profileRole = TextStyle(fontFamily = fontFamily, fontSize = 11.sp, lineHeight = 15.sp)
    val greetingTitle = TextStyle(fontFamily = fontFamily, fontSize = 18.sp, fontWeight = FontWeight.Medium, lineHeight = 25.sp)
    val mutedBody = TextStyle(fontFamily = fontFamily, fontSize = 11.sp, lineHeight = 19.sp)
    val heroTitle = TextStyle(fontFamily = fontFamily, fontSize = 16.sp, fontWeight = FontWeight.Medium, lineHeight = 22.sp)
    val heroPercent = TextStyle(fontFamily = fontFamily, fontSize = 24.sp, fontWeight = FontWeight.Medium, lineHeight = 32.sp)
    val heroStatValue = TextStyle(fontFamily = fontFamily, fontSize = 18.sp, fontWeight = FontWeight.Medium, lineHeight = 24.sp)
    val moduleName = TextStyle(fontFamily = fontFamily, fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp)
    val modulePercent = TextStyle(fontFamily = fontFamily, fontSize = 16.sp, fontWeight = FontWeight.Medium, lineHeight = 21.sp)
    val moduleStat = TextStyle(fontFamily = fontFamily, fontSize = 11.sp, lineHeight = moduleStatLineHeight)
    val button = TextStyle(fontFamily = fontFamily, fontSize = 12.sp, fontWeight = FontWeight.Medium, lineHeight = 16.sp)
    val moduleButton = TextStyle(fontFamily = fontFamily, fontSize = 11.sp, lineHeight = 15.sp)
    val tabLabel = TextStyle(fontFamily = fontFamily, fontSize = 11.sp, lineHeight = 15.sp)
}
