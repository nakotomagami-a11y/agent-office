pluginManagement {
    repositories {
        gradlePluginPortal()
        maven("https://maven.fabricmc.net/") { name = "Fabric" }
        maven("https://maven.kikugie.dev/releases") { name = "KikuGie" }
    }
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
    id("dev.kikugie.stonecutter") version "0.9.8"
}

// One source tree, one jar per Minecraft version and loader. In src/main, `//? if >=1.21 {` guards Minecraft API and
// `//? if neoforge {` a loader's own API; `gradlew "Set active project to 1.20.1-fabric"` swaps which branch is live in
// the sources (`gradlew "Reset active project"` before committing).
stonecutter {
    create(rootProject) {
        // The NeoForge packs (All of Create, NeoTech Reborn, …).
        version("1.21.1-neoforge", "1.21.1").buildscript = "build.neoforge.gradle"
        // Homestead and other Fabric 1.20.1 packs.
        version("1.20.1-fabric", "1.20.1").buildscript = "build.fabric.gradle"
        vcsVersion = "1.21.1-neoforge"
    }
}
