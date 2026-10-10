package dev.agentoffice.mc.client;

import com.mojang.blaze3d.platform.NativeImage;
import dev.agentoffice.mc.AgentOfficeMod;
import dev.agentoffice.mc.core.AgentLooks;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.resources.DefaultPlayerSkin;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.fml.loading.FMLPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * An agent's skin (64x64, both layers), first found wins:
 * {@code config/agentoffice-skins/<agentId>.slim.png} or {@code <agentId>.png} (yours), the built-in
 * character for that agent ({@link AgentLooks}), else one of Minecraft's default skins picked by name.
 * Read once; F3+T (resource reload) reads the folder again.
 */
final class AgentSkins {
    record Skin(ResourceLocation texture, boolean slim) {}

    private static final Logger LOG = LoggerFactory.getLogger("agentoffice");
    private static final Map<String, Skin> cache = new HashMap<>();
    private static final Map<String, ResourceLocation> loaded = new HashMap<>();

    private AgentSkins() {}

    /** Render thread. Cached: the first draw of an agent after a reload checks the folder and may read a PNG. */
    static Skin of(String agentId) {
        return cache.computeIfAbsent(agentId, AgentSkins::resolve);
    }

    /** Forget every skin (custom files are read again on next use). */
    static void clear() {
        loaded.values().forEach(t -> Minecraft.getInstance().getTextureManager().release(t));
        loaded.clear();
        cache.clear();
    }

    static Path folder() {
        return FMLPaths.CONFIGDIR.get().resolve("agentoffice-skins");
    }

    /** Makes the folder, with a note on how to use it, so a player can find where skins go. */
    static void ensureFolder() {
        Path readme = folder().resolve("README.txt");
        if (Files.exists(readme)) return;
        try {
            Files.createDirectories(folder());
            Files.writeString(readme, """
                    Agent skins for Agent Office bodies. Put a 64x64 Minecraft skin (both layers) here, named after the agent:
                      developer.png        wide arms (Steve-style)
                      developer.slim.png   slim arms (Alex-style)
                    The name is the agent's name in Agent Office (qa-code-review.png, tech-writer.slim.png, ...).
                    Press F3+T in game to pick up changes. Without a file, an agent wears its built-in character or a default skin.
                    Paint skins in Blockbench (free, 3D preview of both layers) or any online skin editor.
                    """);
        } catch (IOException e) {
            LOG.warn("could not create {}: {}", folder(), e.toString());
        }
    }

    private static Skin resolve(String agentId) {
        Skin custom = custom(agentId);
        if (custom != null) return custom;
        String cast = AgentLooks.castFor(agentId);
        if (cast != null) {
            return new Skin(ResourceLocation.fromNamespaceAndPath(AgentOfficeMod.MOD_ID, "textures/entity/agent/" + cast + ".png"),
                    AgentLooks.slim(cast));
        }
        PlayerSkin d = DefaultPlayerSkin.get(UUID.nameUUIDFromBytes(agentId.getBytes(StandardCharsets.UTF_8)));
        return new Skin(d.texture(), d.model() == PlayerSkin.Model.SLIM);
    }

    private static Skin custom(String agentId) {
        if (!AgentLooks.fileSafe(agentId)) return null;
        for (boolean slim : new boolean[] {true, false}) {
            Path file = folder().resolve(agentId + (slim ? ".slim.png" : ".png"));
            if (!Files.isRegularFile(file)) continue;
            try (InputStream in = Files.newInputStream(file)) {
                NativeImage image = NativeImage.read(in);
                if (image.getWidth() != 64 || image.getHeight() != 64) {
                    LOG.warn("agent skin {} is {}x{}; skins must be 64x64 (both layers)", file, image.getWidth(), image.getHeight());
                    image.close();
                    continue;
                }
                // As vanilla does for downloaded skins: only the outer layer may be see-through.
                opaque(image, 0, 0, 32, 16);
                opaque(image, 0, 16, 64, 32);
                opaque(image, 16, 48, 48, 64);
                ResourceLocation id = ResourceLocation.fromNamespaceAndPath(AgentOfficeMod.MOD_ID,
                        "skin/custom/" + agentId.toLowerCase(Locale.ROOT) + "_" + Integer.toHexString(agentId.hashCode()));
                Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(image));
                loaded.put(agentId, id);
                return new Skin(id, slim);
            } catch (IOException | RuntimeException e) {
                LOG.warn("could not read agent skin {}: {}", file, e.toString());
            }
        }
        return null;
    }

    private static void opaque(NativeImage image, int x0, int y0, int x1, int y1) {
        for (int x = x0; x < x1; x++) {
            for (int y = y0; y < y1; y++) image.setPixelRGBA(x, y, image.getPixelRGBA(x, y) | 0xFF000000);
        }
    }
}
