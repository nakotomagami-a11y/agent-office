plugins {
    id("dev.kikugie.stonecutter")
    id("net.neoforged.moddev") version "2.0.148" apply false
    id("fabric-loom") version "1.15.5" apply false
}

stonecutter active "1.21.1-neoforge"

stonecutter parameters {
    constants.match(current.project.substringAfterLast('-'), "fabric", "neoforge")

    // 1.20.1 has no StreamCodec payloads: shared code imports src/fabric's copies (compat/) instead, same names, same
    // bytes. Each pair maps one way only, so switching the active version back and forth restores the code (Stonecutter
    // itself writes a disabled one-line branch as `//`). ArchitectureTest bans the right-hand sides in src/main and src/test.
    replacements {
        val old = eval(current.version, "<1.21")
        for (name in listOf("network.codec.ByteBufCodecs", "network.codec.StreamCodec",
                "network.protocol.common.custom.CustomPacketPayload", "core.UUIDUtil")) {
            string(old) { replace("import net.minecraft.$name;", "import dev.agentoffice.mc.compat.${name.substringAfterLast('.')};") }
        }
        string(old) { replace("BlockPos.STREAM_CODEC", "ByteBufCodecs.BLOCK_POS") }
        // 1.20.1 builds ids with constructors; the compat factory keeps the two apart for the way back.
        string(old) { replace("ResourceLocation.fromNamespaceAndPath(", "dev.agentoffice.mc.compat.ResourceLocations.fromNamespaceAndPath(") }
        string(old) { replace("ResourceLocation.withDefaultNamespace(", "new ResourceLocation(") }
    }
}
