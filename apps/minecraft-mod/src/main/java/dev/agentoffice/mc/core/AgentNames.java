package dev.agentoffice.mc.core;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * What an agent is called on screen, as in the web app (apps/web/src/lib/agent-display-name.ts): its stored name
 * (the agent file's display-name, learnt whenever the agent list is read), else its id made readable.
 */
public final class AgentNames {
    private static final Set<String> ALL_CAPS = Set.of("qa", "ui", "ux", "ai", "api", "ml", "hr", "pm", "seo", "cto", "ceo",
            "cfo", "cpo", "cmo", "coo", "chro", "ciso", "gc", "cco", "cdo", "caio");
    private static final Map<String, String> stored = new ConcurrentHashMap<>();

    private AgentNames() {}

    public static void remember(String id, String displayName) {
        if (id == null) return;
        if (displayName == null || displayName.isBlank()) stored.remove(id);
        else stored.put(id, displayName.trim());
    }

    public static String of(String id) {
        String name = id == null ? null : stored.get(id);
        return name != null ? name : format(id);
    }

    /** "cs-ceo" → "CEO", "developer-lite" → "Developer (Lite)", "qa-code-review" → "QA Code Review". */
    public static String format(String id) {
        String slug = id == null ? "" : id.trim();
        if (slug.isEmpty()) return "";
        if (slug.toLowerCase(Locale.ROOT).matches("cs-[a-z]{2,4}")) return slug.substring(3).toUpperCase(Locale.ROOT);
        String[] parts = slug.split("-", -1); // keeps trailing empties, as JS does
        if (parts.length == 2 && ServerMirror.NAME_VARIANTS.contains(parts[1].toLowerCase(Locale.ROOT))) {
            return word(parts[0]) + " (" + word(parts[1]) + ")";
        }
        return Arrays.stream(parts).map(AgentNames::word).collect(Collectors.joining(" "));
    }

    private static String word(String token) {
        String lower = token.toLowerCase(Locale.ROOT);
        if (ALL_CAPS.contains(lower)) return lower.toUpperCase(Locale.ROOT);
        return lower.isEmpty() ? lower : Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
