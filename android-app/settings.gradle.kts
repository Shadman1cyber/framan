pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    // NOTE: no repositoriesMode restriction on purpose — a local init script
    // may append mirror fallbacks on networks where google() is unreachable.
    // Canonical order stays google() then mavenCentral().
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "farman-android"
include(":core")
include(":app")
