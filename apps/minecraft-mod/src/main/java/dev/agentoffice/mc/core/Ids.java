package dev.agentoffice.mc.core;

import java.util.concurrent.ThreadFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** The mod's name for itself, wherever one is needed: its id, its log, its threads. */
public final class Ids {
    /** Must match mod_id in gradle.properties (neoforge.mods.toml is generated from it). */
    public static final String MOD_ID = "agentoffice";
    public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

    private Ids() {}

    /** Daemon threads named "agentoffice-{name}": they never keep the game from quitting. */
    public static ThreadFactory daemon(String name) {
        return r -> {
            Thread t = new Thread(r, MOD_ID + "-" + name);
            t.setDaemon(true);
            return t;
        };
    }
}
