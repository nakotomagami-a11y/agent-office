package dev.agentoffice.mc.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Lenient reads of the server's JSON: a missing field and a JSON null read alike; a wrong type still throws. */
public final class Json {
    private Json() {}

    /** Null when absent. */
    public static String str(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsString();
    }

    /** "" when absent. */
    public static String text(JsonObject o, String key) {
        String s = str(o, key);
        return s == null ? "" : s;
    }

    /** 0 when absent. */
    public static long num(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? 0 : el.getAsLong();
    }

    /** 0 when absent. */
    public static int intNum(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? 0 : el.getAsInt();
    }

    /** Null when absent. */
    public static Integer intOrNull(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsInt();
    }

    /** True only for a JSON true (or "true"); anything else, an object included, is false. */
    public static boolean bool(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonPrimitive() && el.getAsBoolean();
    }

    public static boolean isString(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonPrimitive() && el.getAsJsonPrimitive().isString();
    }
}
