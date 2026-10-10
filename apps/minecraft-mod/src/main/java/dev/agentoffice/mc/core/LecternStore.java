package dev.agentoffice.mc.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Which project each Review Lectern shows, keyed by world, dimension and block position. Client-side
 * only (one JSON file in the game's config dir), like agent bodies: nothing about it reaches the
 * Minecraft server. Cheap to lose (rebinding is two clicks), so simpler than BodyStore: a corrupt
 * file is set aside, and a file that can't be read is left alone for the session, never overwritten.
 */
public final class LecternStore {
    /** The "All projects" binding. */
    public static final String ALL = "*";

    public record Binding(String projectId, String projectName) {
        public boolean all() {
            return ALL.equals(projectId);
        }
    }

    private static final Logger LOG = LoggerFactory.getLogger("agentoffice");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private final Path file;
    private final Map<String, Binding> bindings = new LinkedHashMap<>();
    private boolean readOnly;

    public LecternStore(Path file) {
        this.file = file;
        load();
    }

    public static String key(String world, String dimension, int x, int y, int z) {
        return world + "|" + dimension + "|" + x + "," + y + "," + z;
    }

    public synchronized Optional<Binding> get(String key) {
        return Optional.ofNullable(bindings.get(key));
    }

    public synchronized void bind(String key, Binding binding) {
        bindings.put(key, binding);
        save();
    }

    public synchronized void unbind(String key) {
        if (bindings.remove(key) != null) save();
    }

    private void load() {
        if (!Files.isRegularFile(file)) return;
        String text;
        try {
            text = Files.readString(file);
        } catch (IOException e) {
            readOnly = true;
            LOG.warn("could not read lectern bindings from {} ({}); not saving this session", file, e.toString());
            return;
        }
        try {
            JsonObject o = JsonParser.parseString(text).getAsJsonObject();
            for (Map.Entry<String, JsonElement> e : o.entrySet()) {
                JsonObject b = e.getValue().getAsJsonObject();
                if (b.has("projectId") && !b.get("projectId").isJsonNull()) {
                    String name = b.has("projectName") && !b.get("projectName").isJsonNull() ? b.get("projectName").getAsString() : null;
                    bindings.put(e.getKey(), new Binding(b.get("projectId").getAsString(), name));
                }
            }
        } catch (RuntimeException e) {
            Path corrupt = file.resolveSibling(file.getFileName() + ".corrupt-" + System.currentTimeMillis());
            LOG.warn("lectern bindings file {} is not valid ({}); moved to {}", file, e.toString(), corrupt);
            try {
                Files.move(file, corrupt);
            } catch (IOException moveFailed) {
                readOnly = true;
            }
        }
    }

    private void save() {
        if (readOnly) return;
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, GSON.toJson(bindings));
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailed) {
                // Windows refuses an atomic replace while a scanner/indexer briefly holds the target.
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            LOG.warn("could not save lectern bindings to {}: {}", file, e.toString());
        }
    }
}
