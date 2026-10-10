package dev.agentoffice.mc.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Where the player placed which agent. Bodies exist only on this client, so their positions live
 * here (one JSON file in the game's config dir), keyed by world and dimension. Removing a body
 * never touches Agent Office: the agent, its seat and its conversation stay.
 *
 * This is cosmetic state inside someone's game: nothing here may throw into Minecraft, and the
 * player's placements must not be lost. A file with bad content is set aside as *.corrupt-<ms>.
 * A file that can't be read right now (a scanner or sync client holding it) is retried before the
 * next save and merged, never overwritten blind.
 */
public final class BodyStore {
    /**
     * A placed agent. {@code slot} is the seat it is. A body placed from an Agent Spawn Egg is a shell
     * until it is set up: no slot yet, identified by {@code shell} instead.
     */
    public record Body(String world, String dimension, double x, double y, double z, float yaw, Api.Slot slot, String shell) {
        public Body {
            if ((slot == null) == (shell == null)) throw new IllegalArgumentException("a body is a seat or a shell, exactly one");
        }

        public Body(String world, String dimension, double x, double y, double z, float yaw, Api.Slot slot) {
            this(world, dimension, x, y, z, yaw, slot, null);
        }

        public static Body shell(String world, String dimension, double x, double y, double z, float yaw) {
            return new Body(world, dimension, x, y, z, yaw, null, UUID.randomUUID().toString());
        }

        public boolean isShell() {
            return slot == null;
        }

        /** Unique per world: the seat, or the shell's id. */
        public String key() {
            return slot != null ? slotKey(slot) : "shell:" + shell;
        }
    }

    interface Reader {
        String read(Path file) throws IOException;
    }

    private static final class Corrupt extends Exception {
        Corrupt(Throwable cause) {
            super(cause);
        }
    }

    private static final Logger LOG = LoggerFactory.getLogger("agentoffice");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private final Path file;
    private final Reader reader;
    private final List<Body> bodies = new ArrayList<>();
    /** The file exists but has not been read yet; its contents must be merged before any write. */
    private boolean unread;
    /** Removals made while unread ("world|key"), so the merge doesn't bring them back. */
    private final Set<String> removedWhileUnread = new HashSet<>();
    /** A corrupt file that could not be moved aside: never write over it. */
    private boolean readOnly;

    public BodyStore(Path file) {
        this(file, Files::readString);
    }

    BodyStore(Path file, Reader reader) {
        this.file = file;
        this.reader = reader;
        load();
    }

    public synchronized List<Body> in(String world, String dimension) {
        return bodies.stream().filter(b -> b.world().equals(world) && b.dimension().equals(dimension)).toList();
    }

    /** One body per agent seat per world: placing again moves it. */
    public synchronized Body place(Body body) {
        bodies.removeIf(b -> b.world().equals(body.world()) && b.key().equals(body.key()));
        bodies.add(body);
        removedWhileUnread.remove(body.world() + "|" + body.key());
        save();
        return body;
    }

    public synchronized boolean remove(String world, Api.Slot slot) {
        return removeKey(world, slotKey(slot));
    }

    public synchronized boolean removeShell(String world, String shell) {
        return removeKey(world, "shell:" + shell);
    }

    /**
     * Setting up a shell: it becomes that seat's body where it stands, and a body the seat already
     * had in this world goes (one body per seat). Null if the shell is gone.
     */
    public synchronized Body assign(String world, String shell, Api.Slot slot) {
        Body found = bodies.stream().filter(b -> b.world().equals(world) && shell.equals(b.shell())).findFirst().orElse(null);
        if (found == null) return null;
        bodies.remove(found);
        if (unread) removedWhileUnread.add(world + "|" + found.key());
        return place(new Body(world, found.dimension(), found.x(), found.y(), found.z(), found.yaw(), slot));
    }

    public synchronized boolean has(String world, Api.Slot slot) {
        String key = slotKey(slot);
        return bodies.stream().anyMatch(b -> b.world().equals(world) && b.key().equals(key));
    }

    private boolean removeKey(String world, String key) {
        boolean removed = bodies.removeIf(b -> b.world().equals(world) && b.key().equals(key));
        if (unread) removedWhileUnread.add(world + "|" + key);
        if (removed || unread) save();
        return removed;
    }

    static String slotKey(Api.Slot slot) {
        return slot.projectId() + "/" + slot.instanceId();
    }

    private void load() {
        try {
            bodies.addAll(readDisk());
        } catch (Corrupt e) {
            setAside(e.getCause());
        } catch (IOException e) {
            unread = true;
            LOG.warn("could not read agent bodies from {} ({}); will retry before the next save", file, e.toString());
        }
    }

    private List<Body> readDisk() throws IOException, Corrupt {
        if (!Files.isRegularFile(file)) return List.of();
        JsonArray arr;
        try {
            arr = JsonParser.parseString(reader.read(file)).getAsJsonArray();
        } catch (CharacterCodingException | RuntimeException e) {
            throw new Corrupt(e);
        }
        List<Body> out = new ArrayList<>();
        for (JsonElement el : arr) {
            try {
                Body body = body(el.getAsJsonObject());
                if (body != null) out.add(body);
            } catch (RuntimeException e) {
                LOG.warn("skipping unreadable agent body in {}: {}", file, e.toString());
            }
        }
        return out;
    }

    private static Body body(JsonObject o) {
        String world = str(o, "world");
        String dimension = str(o, "dimension");
        if (world == null || dimension == null) return null;
        double x = o.get("x").getAsDouble();
        double y = o.get("y").getAsDouble();
        double z = o.get("z").getAsDouble();
        float yaw = o.get("yaw").getAsFloat();
        if (!o.has("slot") || o.get("slot").isJsonNull()) {
            String shell = str(o, "shell");
            return shell == null ? null : new Body(world, dimension, x, y, z, yaw, null, shell);
        }
        JsonObject s = o.getAsJsonObject("slot");
        Api.Slot slot = new Api.Slot(str(s, "projectId"), str(s, "projectName"), str(s, "agentId"), str(s, "instanceId"), str(s, "label"));
        if (slot.projectId() == null || slot.instanceId() == null || slot.agentId() == null) return null;
        return new Body(world, dimension, x, y, z, yaw, slot);
    }

    private void setAside(Throwable cause) {
        Path corrupt = file.resolveSibling(file.getFileName() + ".corrupt-" + System.currentTimeMillis());
        LOG.warn("agent bodies file {} is not valid ({}); moved to {}", file, cause.toString(), corrupt);
        try {
            Files.move(file, corrupt);
        } catch (IOException e) {
            readOnly = true;
            LOG.warn("could not set aside {}: {}; placements this session won't be saved", file, e.toString());
        }
    }

    /** Disk entries this session hasn't touched are kept; this session's placements and removals win. */
    private void mergeUnread(List<Body> disk) {
        for (Body d : disk) {
            boolean touched = removedWhileUnread.contains(d.world() + "|" + d.key())
                    || bodies.stream().anyMatch(b -> b.world().equals(d.world()) && b.key().equals(d.key()));
            if (!touched) bodies.add(d);
        }
        removedWhileUnread.clear();
    }

    private void save() {
        if (readOnly) return;
        if (unread) {
            try {
                mergeUnread(readDisk());
                unread = false;
            } catch (Corrupt e) {
                unread = false;
                setAside(e.getCause());
                if (readOnly) return;
            } catch (IOException e) {
                LOG.warn("still can't read {} ({}); not saving yet so its bodies aren't lost", file, e.toString());
                return;
            }
        }
        JsonArray arr = new JsonArray();
        for (Body b : bodies) arr.add(GSON.toJsonTree(b));
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, GSON.toJson(arr));
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException atomicFailed) {
                // Windows refuses an atomic replace while a scanner/indexer briefly holds the target.
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            LOG.warn("could not save agent bodies to {} (kept in memory until next save): {}", file, e.toString());
        }
    }

    private static String str(JsonObject o, String key) {
        JsonElement el = o == null ? null : o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsString();
    }
}
