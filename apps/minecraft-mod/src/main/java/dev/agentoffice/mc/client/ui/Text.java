package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.Font;

/** Short strings as the tablet shows them. */
public final class Text {
    private Text() {}

    /** Cut to {@code width}, ending in "…" when anything was cut; "" when there is no room at all. */
    public static String cut(Font font, String s, int width) {
        if (width <= 0) return "";
        if (font.width(s) <= width) return s;
        return font.plainSubstrByWidth(s, Math.max(0, width - font.width("…"))) + "…";
    }

    public static String nz(String s) {
        return s == null ? "" : s;
    }

    /**
     * A seat's model, effort or permission mode: its own, else what it gets from the agent ("default (opus)", or
     * "default" when the agent sets none either), so an inherited value never reads like one picked for the seat.
     */
    public static String setting(String own, String agentDefault) {
        if (own != null && !own.isEmpty()) return own;
        return agentDefault == null || agentDefault.isEmpty() ? "default" : "default (" + agentDefault + ")";
    }
}
