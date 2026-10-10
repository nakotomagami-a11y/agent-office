package dev.agentoffice.mc.core;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Which built-in character an agent looks like. The cast is AgentCraft's six skins
 * (assets/agentoffice/textures/entity/agent/, MIT, see LICENSE-agentcraft.txt there), matched to
 * Agent Office agents by name. Agents that match none get one of Minecraft's default skins.
 */
public final class AgentLooks {
    /** Agent name prefix to character, first match wins: the narrower prefixes come first. */
    private static final Map<String, String> CAST = new LinkedHashMap<>();
    private static final Set<String> SLIM = Set.of("juniper", "wren", "tove");
    /** A file name the skins folder may hold for this agent: no paths, nothing hidden. */
    private static final Pattern FILE_SAFE = Pattern.compile("[A-Za-z0-9_-][A-Za-z0-9._-]*");

    static {
        // Kit, builder & tester
        for (String p : new String[] {"developer", "devops", "mcp-builder", "release-engineer", "claude-api"}) CAST.put(p, "kit");
        // Tove, archivist & QA
        for (String p : new String[] {"qa-visual", "web-qa", "webapp-testing", "tech-writer"}) CAST.put(p, "tove");
        // Rowan, refactorer & reviewer
        for (String p : new String[] {"qa-", "security", "sre"}) CAST.put(p, "rowan");
        // Wren, interface designer
        for (String p : new String[] {"designer", "frontend", "web-artifacts", "level-designer", "tech-animator"}) CAST.put(p, "wren");
        // Marlow, foreman & architect
        for (String p : new String[] {"orchestrator", "planner", "agent-architect", "product-manager", "cs-"}) CAST.put(p, "marlow");
        // Juniper, researcher
        for (String p : new String[] {"explore", "web-researcher", "data-analyst", "user-analyst"}) CAST.put(p, "juniper");
    }

    private AgentLooks() {}

    /** The character for this agent ("kit", "rowan", …), or null for a default Minecraft skin. */
    public static String castFor(String agentId) {
        String a = agentId.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> e : CAST.entrySet()) {
            if (a.startsWith(e.getKey())) return e.getValue();
        }
        return null;
    }

    public static boolean slim(String cast) {
        return SLIM.contains(cast);
    }

    /** Whether {@code agentId} can name a file in the skins folder ({@code <agentId>.png}). */
    public static boolean fileSafe(String agentId) {
        return FILE_SAFE.matcher(agentId).matches();
    }
}
