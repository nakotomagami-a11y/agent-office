package dev.agentoffice.mc.client.ui;

import com.mojang.blaze3d.platform.NativeImage;
import dev.agentoffice.mc.core.AgentOfficeClient;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;
import org.lwjgl.stb.STBImage;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;

/**
 * Chat image previews: fetched from Agent Office, decoded off the render thread with STB (PNG, JPEG,
 * GIF first frame, BMP — vanilla NativeImage.read only takes PNG) and uploaded as dynamic textures.
 * Main thread only, except the fetch/decode job. {@link #clear} frees every texture.
 */
public final class ImageCache {
    private static final int MAX_BYTES = 16 * 1024 * 1024;
    private static final int MAX_SIDE = 4096;

    public record Img(ResourceLocation texture, int width, int height) {}

    private static final Object LOADING = new Object();
    private static final Object FAILED = new Object();
    private static final Map<String, Object> entries = new HashMap<>();
    private static int next;
    // Few threads: each decode can hold tens of MB, and a long thread can reference many images.
    private static final ExecutorService LOADER = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "agentoffice-images");
        t.setDaemon(true);
        return t;
    });

    private ImageCache() {}

    /** The ready image, or null while it loads (or if it failed: see {@link #failed}). */
    public static Img get(AgentOfficeClient client, String path) {
        Object e = entries.get(path);
        if (e == null) {
            entries.put(path, LOADING);
            load(client, path);
            return null;
        }
        return e instanceof Img img ? img : null;
    }

    /** The ready image or null, without starting a load. */
    public static Img peek(String path) {
        return entries.get(path) instanceof Img img ? img : null;
    }

    public static boolean failed(String path) {
        return entries.get(path) == FAILED;
    }

    /** Frees every texture unless a chat (or an image opened from one) is on screen; call every tick. */
    public static void clearUnlessShowing(Object screen) {
        if (entries.isEmpty()) return;
        // The link prompt opens over a chat and goes back to it: keep its images.
        if (screen instanceof ImageScreen || screen instanceof dev.agentoffice.mc.client.ChatScreen
                || screen instanceof net.minecraft.client.gui.screens.ConfirmLinkScreen) return;
        clear();
    }

    public static void clear() {
        Minecraft mc = Minecraft.getInstance();
        for (Object e : entries.values()) {
            if (e instanceof Img img) mc.getTextureManager().release(img.texture());
        }
        entries.clear();
    }

    private static void load(AgentOfficeClient client, String path) {
        Minecraft mc = Minecraft.getInstance();
        LOADER.execute(() -> {
            NativeImage image;
            try {
                image = decode(client.bytes(path, MAX_BYTES));
            } catch (IOException | RuntimeException | OutOfMemoryError e) {
                mc.execute(() -> {
                    if (entries.get(path) == LOADING) entries.put(path, FAILED);
                });
                return;
            }
            mc.execute(() -> {
                // Cleared while loading (screen closed): don't leak a texture nobody will release.
                if (entries.get(path) != LOADING) {
                    image.close();
                    return;
                }
                ResourceLocation id = ResourceLocation.fromNamespaceAndPath("agentoffice", "chat_image/" + next++);
                mc.getTextureManager().register(id, new DynamicTexture(image));
                entries.put(path, new Img(id, image.getWidth(), image.getHeight()));
            });
        });
    }

    static NativeImage decode(byte[] bytes) throws IOException {
        ByteBuffer data = MemoryUtil.memAlloc(bytes.length);
        try (MemoryStack stack = MemoryStack.stackPush()) {
            data.put(bytes).flip();
            IntBuffer w = stack.mallocInt(1);
            IntBuffer h = stack.mallocInt(1);
            IntBuffer channels = stack.mallocInt(1);
            // Header first: a small file can declare a huge image, and decoding allocates all of it.
            if (!STBImage.stbi_info_from_memory(data, w, h, channels)) throw new IOException("undecodable: " + STBImage.stbi_failure_reason());
            if (w.get(0) > MAX_SIDE || h.get(0) > MAX_SIDE) throw new IOException("too_large");
            ByteBuffer rgba = STBImage.stbi_load_from_memory(data, w, h, channels, 4);
            if (rgba == null) throw new IOException("undecodable: " + STBImage.stbi_failure_reason());
            try {
                int width = w.get(0);
                int height = h.get(0);
                if (width > MAX_SIDE || height > MAX_SIDE) throw new IOException("too_large");
                NativeImage image = new NativeImage(NativeImage.Format.RGBA, width, height, false);
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        int i = (y * width + x) * 4;
                        int r = rgba.get(i) & 0xFF;
                        int g = rgba.get(i + 1) & 0xFF;
                        int b = rgba.get(i + 2) & 0xFF;
                        int a = rgba.get(i + 3) & 0xFF;
                        image.setPixelRGBA(x, y, a << 24 | b << 16 | g << 8 | r);
                    }
                }
                return image;
            } finally {
                STBImage.stbi_image_free(rgba);
            }
        } finally {
            MemoryUtil.memFree(data);
        }
    }
}
