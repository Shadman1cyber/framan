package com.farmancoffeeshop.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Warm premium café palette (matches the web app's aesthetic).
val Espresso = Color(0xFF1A120B)
val Latte = Color(0xFFF5E6C8)
val Caramel = Color(0xFFC98A3D)
val Cream = Color(0xFFE8D5B5)
val Mocha = Color(0xFF2A1E14)
val LeafGreen = Color(0xFF7FB069)
val AlertRed = Color(0xFFD64545)
val MutedBrown = Color(0xFF8A6F4D)

private val FarmanColors = darkColorScheme(
    primary = Caramel,
    onPrimary = Espresso,
    secondary = Cream,
    onSecondary = Espresso,
    tertiary = LeafGreen,
    background = Espresso,
    onBackground = Latte,
    surface = Mocha,
    onSurface = Latte,
    surfaceVariant = Color(0xFF3A2A1C),
    onSurfaceVariant = Cream,
    error = AlertRed,
    onError = Latte,
    outline = MutedBrown,
)

@Composable
fun FarmanTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = FarmanColors, content = content)
}
