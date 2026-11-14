package dev.agentoffice.mc.compat;

import net.minecraft.resources.ResourceLocation;

/**
 * 1.21's {@code ResourceLocation.fromNamespaceAndPath} for 1.20.1: throws on a bad id as 1.21 does (1.20.1's tryBuild
 * would return null). Stonecutter rewrites the 1.21 call to this one (stonecutter.gradle.kts).
 */
public final class ResourceLocations {
    private ResourceLocations() {}

    public static ResourceLocation fromNamespaceAndPath(String namespace, String path) {
        return new ResourceLocation(namespace, path);
    }
}
