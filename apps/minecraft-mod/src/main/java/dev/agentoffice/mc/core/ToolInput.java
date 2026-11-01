package dev.agentoffice.mc.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import java.util.List;

/** A tool call's input, as the server stores it (a JSON string), made readable: a tool row's and an approval's. */
public final class ToolInput {
    /** The field that says what a call does, in the order looked for. */
    private static final List<String> MAIN_KEYS =
            List.of("command", "file_path", "path", "pattern", "url", "query", "description", "prompt", "skill");
    private static final Gson PRETTY = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();

    private ToolInput() {}

    /** Anything unparseable stays the raw string. */
    static JsonElement parse(String stored) {
        if (stored == null || stored.isBlank()) return null;
        try {
            return JsonParser.parseString(stored);
        } catch (RuntimeException e) {
            return new JsonPrimitive(stored);
        }
    }

    /** One line worth showing next to the tool name: its main field, else the JSON; null for nothing. */
    static String summary(JsonElement input) {
        if (input == null || input.isJsonNull()) return null;
        if (input.isJsonPrimitive()) {
            String s = input.getAsString().trim();
            return s.isEmpty() ? null : s;
        }
        if (input.isJsonObject()) {
            JsonObject o = input.getAsJsonObject();
            if (o.size() == 0) return null;
            String main = main(o);
            if (main != null) return main.replace('\n', ' ');
        }
        if (input.isJsonArray() && input.getAsJsonArray().isEmpty()) return null;
        return input.toString();
    }

    /** An approval's lines: its main field as written (a Bash script keeps its lines), else the raw input; "" for none. */
    public static String detail(String raw) {
        if (raw == null) return "";
        try {
            JsonElement el = JsonParser.parseString(raw);
            if (el.isJsonObject()) {
                String main = main(el.getAsJsonObject());
                if (main != null) return main;
            }
        } catch (RuntimeException ignored) {
            // Not JSON: show it raw.
        }
        return raw;
    }

    /** Everything the tool would get (a Write's content, an Edit's old/new text), indented, for a hover. */
    public static String pretty(String raw) {
        if (raw == null) return "(no input)";
        try {
            String pretty = PRETTY.toJson(JsonParser.parseString(raw));
            // Escaped newlines inside strings become real ones, so scripts and file content read as such.
            return pretty.replace("\\n", "\n").replace("\\t", "    ");
        } catch (RuntimeException e) {
            return raw;
        }
    }

    private static String main(JsonObject o) {
        for (String key : MAIN_KEYS) {
            if (Json.isString(o, key)) return o.get(key).getAsString();
        }
        return null;
    }
}
