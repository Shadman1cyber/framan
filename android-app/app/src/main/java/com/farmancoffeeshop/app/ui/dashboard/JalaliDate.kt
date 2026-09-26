package com.farmancoffeeshop.app.ui.dashboard

import java.text.SimpleDateFormat
import java.util.Date
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone

private val persianMonths = listOf(
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
)

private val persianDigits = "۰۱۲۳۴۵۶۷۸۹"

fun formatJalaliDate(date: Date = Date()): String {
    val gregorian = GregorianCalendar(TimeZone.getDefault()).apply { time = date }
    val (year, month, day) = gregorianToJalali(
        gregorian.get(GregorianCalendar.YEAR),
        gregorian.get(GregorianCalendar.MONTH) + 1,
        gregorian.get(GregorianCalendar.DAY_OF_MONTH),
    )
    val weekday = SimpleDateFormat("EEEE", Locale("fa", "IR")).format(date)
    return "$weekday، ${day.toPersianDigits()} ${persianMonths[month - 1]} ${year.toPersianDigits()}"
}

private fun gregorianToJalali(gy: Int, gm: Int, gd: Int): Triple<Int, Int, Int> {
    val year = gy - 1600
    val month = gm - 1
    val day = gd - 1
    var jalaliYear = 979
    var days = 365 * year + (year + 3) / 4 - (year + 99) / 100 + (year + 399) / 400 - 80 + day
    if (month > 0) {
        days += (153 * month + 2) / 5 + 365
    }
    jalaliYear += 400 * (days / 146097)
    days %= 146097
    if (days > 36524) {
        days--
        jalaliYear += 100 * (days / 36524)
        days %= 36524
        if (days >= 365) days++
    }
    jalaliYear += 4 * (days / 1461)
    days %= 1461
    if (days > 365) {
        jalaliYear += (days - 1) / 365
        days = (days - 1) % 365
    }
    val jalaliMonth = if (days < 186) 1 + days / 31 else 7 + (days - 186) / 30
    val jalaliDay = if (days < 186) days % 31 + 1 else (days - 186) % 30 + 1
    return Triple(jalaliYear, jalaliMonth, jalaliDay)
}

private fun Int.toPersianDigits(): String = toString().map { digit ->
    if (digit.isDigit()) persianDigits[digit - '0'] else digit
}.joinToString("")
