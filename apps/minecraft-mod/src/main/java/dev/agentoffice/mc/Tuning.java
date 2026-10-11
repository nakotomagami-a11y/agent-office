package dev.agentoffice.mc;

/** Timings the client and the world must agree on, so each is set once for both. */
public final class Tuning {
    /** The owner's client tells the world how each visible agent is doing this often (5 s). */
    public static final int STATUS_REPORT_TICKS = 100;
    /** The world drops one player's reports that come faster than this (only a modified client sends them). */
    public static final int STATUS_MIN_TICKS = 20;
    /** A "working" report holds this long (30 s), so a few lost reports don't send an agent off its desk. */
    public static final int WORKING_HOLDS_TICKS = 6 * STATUS_REPORT_TICKS;

    private Tuning() {}
}
