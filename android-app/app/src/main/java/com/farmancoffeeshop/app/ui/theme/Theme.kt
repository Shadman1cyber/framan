package com.farmancoffeeshop.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Exact palette from iOS FarmanTheme (FarmanNativeApp.swift).
val FarmanBackground = Color(0xFF21100C)
val FarmanDeepBrown = Color(0xFF2B1712)
val FarmanSurface = Color(0xFF382119)
val FarmanRaised = Color(0xFF472A20)
val FarmanBorder = Color(0xFF765044)
val FarmanText = Color(0xFFFFF7EF)
val FarmanSecondary = Color(0xFFCBB8AA)
val FarmanOlive = Color(0xFF9ABD55)
val FarmanOliveDark = Color(0xFF61752E)
val FarmanWine = Color(0xFFC4516D)
val FarmanWarning = Color(0xFFD3A55C)

// Legacy aliases (kept so old screens still compile during migration).
val Espresso = FarmanBackground
val Latte = FarmanText
val Caramel = FarmanOlive
val Cream = FarmanSecondary
val Mocha = FarmanDeepBrown
val LeafGreen = FarmanOlive
val AlertRed = FarmanWine
val MutedBrown = FarmanBorder

private val FarmanColors = darkColorScheme(
    primary = FarmanOlive,
    onPrimary = FarmanBackground,
    secondary = FarmanSecondary,
    onSecondary = FarmanBackground,
    tertiary = FarmanOlive,
    background = FarmanBackground,
    onBackground = FarmanText,
    surface = FarmanSurface,
    onSurface = FarmanText,
    surfaceVariant = FarmanRaised,
    onSurfaceVariant = FarmanSecondary,
    error = FarmanWine,
    onError = FarmanText,
    outline = FarmanBorder,
)

@Composable
fun FarmanTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = FarmanColors, content = content)
}
