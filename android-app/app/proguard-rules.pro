# Add rules here to keep model classes and other reflection-based code.
# Moshi uses reflection on the DTOs in data/remote/dto; keep them.
-keep class com.farmancoffeeshop.app.data.remote.dto.** { *; }
-keep class com.squareup.moshi.** { *; }
-keepnames @com.squareup.moshi.JsonClass class *
# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.**
# error-prone annotations are compile-time only (Tink references them).
-dontwarn com.google.errorprone.**
