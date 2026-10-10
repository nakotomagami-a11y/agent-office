package dev.agentoffice.mc.core;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Where Agent Office listens. Every running server (the packaged app on a random port, a dev
 * server on 3000) writes ~/.claude/agent-office/servers/&lt;pid&gt;.json; entries can outlive a
 * killed server, so callers try each candidate, newest first, against /api/health.
 */
public final class Discovery {
    public static final URI DEFAULT_URL = URI.create("http://127.0.0.1:3000");
    private static final Set<String> LOOPBACK = Set.of("127.0.0.1", "localhost", "[::1]");

    private Discovery() {}

    public static Path serversDir(Path home) {
        return home.resolve(".claude").resolve("agent-office").resolve("servers");
    }

    /** A configured override wins outright; otherwise every advertised server, then the dev default. */
    public static List<URI> candidates(String override, Path home) {
        List<URI> out = new ArrayList<>();
        if (override != null && !override.isBlank()) {
            URI uri = parseLoopback(override.trim());
            if (uri != null) out.add(uri);
            return out;
        }
        for (URI uri : advertised(serversDir(home))) {
            if (!out.contains(uri)) out.add(uri);
        }
        if (!out.contains(DEFAULT_URL)) out.add(DEFAULT_URL);
        return out;
    }

    private record Entry(URI uri, long startedAt) {}

    static List<URI> advertised(Path dir) {
        if (!Files.isDirectory(dir)) return List.of();
        List<Entry> entries = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            for (Path file : (Iterable<Path>) files::iterator) {
                if (!file.getFileName().toString().endsWith(".json")) continue;
                Entry e = read(file);
                if (e != null) entries.add(e);
            }
        } catch (IOException e) {
            return List.of();
        }
        entries.sort(Comparator.comparingLong(Entry::startedAt).reversed());
        return entries.stream().map(Entry::uri).toList();
    }

    private static Entry read(Path file) {
        try {
            JsonObject json = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            URI uri = json.has("baseUrl") ? parseLoopback(json.get("baseUrl").getAsString()) : null;
            long startedAt = json.has("startedAt") ? json.get("startedAt").getAsLong() : 0;
            return uri == null ? null : new Entry(uri, startedAt);
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Agent Office has no auth; it is only safe on this machine, so never follow a remote URL. */
    static URI parseLoopback(String raw) {
        try {
            URI uri = URI.create(raw.endsWith("/") ? raw.substring(0, raw.length() - 1) : raw);
            boolean ok = "http".equals(uri.getScheme()) && uri.getHost() != null && LOOPBACK.contains(uri.getHost());
            return ok ? uri : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
