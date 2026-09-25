package com.farmancoffeeshop.app.ui.dashboard

import java.util.GregorianCalendar
import org.junit.Assert.assertEquals
import org.junit.Test

class JalaliDateTest {
    @Test
    fun formatsKnownGregorianDateAsJalali() {
        val date = GregorianCalendar(2024, GregorianCalendar.MARCH, 20).time
        assertEquals("چهارشنبه، ۳۰ اسفند ۱۴۰۳", formatJalaliDate(date))
    }
}
