package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Discovery;
import dev.agentoffice.mc.core.Ids;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import net.neoforged.fml.loading.FMLPaths;

/**
 * Everything the mod keeps on disk, in one list. The client config (agentoffice-client.toml) is named by NeoForge.
 */
public final class ModPaths {
    /** The world's agents (AgentRecords): {@code <world>/data/agentoffice_agents.dat}, saved with the world. */
    public static final String AGENTS_DATA = Ids.MOD_ID + "_agents";

    private ModPaths() {}

    /** Client: which project each Review Lectern shows. */
    public static Path lecterns() {
        return config("lecterns.json");
    }

    /** Client: the player's own agent skins, with a README made on first use. */
    public static Path skins() {
        return config("skins");
    }

    /** Client: the player's home, under which running Agent Office servers advertise ({@link Discovery#serversDir}). */
    public static Path home() {
        return Path.of(System.getProperty("user.home"));
    }

    /** Client: a new temp file for a pasted clipboard image, deleted once read. */
    public static Path pasteTemp() throws IOException {
        return Files.createTempFile(Ids.MOD_ID + "-paste", ".img");
    }

    private static Path config(String name) {
        return FMLPaths.CONFIGDIR.get().resolve(Ids.MOD_ID + "-" + name);
    }
}
