plugins {
    alias(libs.plugins.kotlin.jvm)
}

group = "com.farmancoffeeshop"
version = "1.0.0"

kotlin {
    // JDK 21 runs the build (matches CI); library bytecode stays at 17.
    jvmToolchain(21)
}

dependencies {
    implementation(libs.kotlinx.coroutines.core)
    testImplementation(libs.junit5.jupiter)
    testImplementation(libs.kotlinx.coroutines.test)
}

tasks.withType<Test> {
    useJUnitPlatform()
}
