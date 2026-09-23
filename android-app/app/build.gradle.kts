plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    // Declared here (not in the root project): see the note in build.gradle.kts.
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.farmancoffeeshop.app"
    compileSdk = 35
    // AGP 8.7.x floor is build-tools 34.0.0 (installed everywhere incl. CI).
    buildToolsVersion = providers.environmentVariable("FARMAN_BUILD_TOOLS").getOrElse("34.0.0")

    defaultConfig {
        applicationId = "com.farmancoffeeshop.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // True when a real upload keystore is provided via env (CI secrets or
    // local export). Mirrors the Capacitor app's signing policy: release is
    // debug-signed (installable) only as a fallback — never for the Play Store.
    val hasUploadKeystore = providers.environmentVariable("ANDROID_KEYSTORE_PATH").isPresent &&
        providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").isPresent &&
        providers.environmentVariable("ANDROID_KEY_ALIAS").isPresent &&
        providers.environmentVariable("ANDROID_KEY_PASSWORD").isPresent
    signingConfigs {
        if (hasUploadKeystore) {
            create("release") {
                storeFile = file(providers.environmentVariable("ANDROID_KEYSTORE_PATH").get())
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        debug {
            // Debug builds may log HTTP metadata (never bodies/secrets); see
            // data/remote/HttpClientFactory.
            buildConfigField("boolean", "VERBOSE_NETWORK_LOG", "true")
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("boolean", "VERBOSE_NETWORK_LOG", "false")
            signingConfig = if (hasUploadKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
    buildFeatures {
        buildConfig = true
        compose = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.work.runtime)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.moshi)
    implementation(libs.moshi)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.junit4)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.androidx.room.testing)
    testImplementation(libs.androidx.work.testing)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
}
