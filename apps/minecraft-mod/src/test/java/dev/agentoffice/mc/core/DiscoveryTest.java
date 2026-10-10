package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DiscoveryTest {
    @TempDir
    Path home;

    private void server(int pid, String baseUrl, long startedAt) throws IOException {
        Path dir = Discovery.serversDir(home);
        Files.createDirectories(dir);
        Files.writeString(dir.resolve(pid + ".json"),
                "{\"baseUrl\":\"" + baseUrl + "\",\"pid\":" + pid + ",\"startedAt\":" + startedAt + "}");
    }

    @Test
    void everyAdvertisedServerNewestFirstThenTheDevDefault() throws IOException {
        server(100, "http://127.0.0.1:57456", 1);
        server(200, "http://127.0.0.1:61000", 2);
        assertEquals(List.of(URI.create("http://127.0.0.1:61000"), URI.create("http://127.0.0.1:57456"), Discovery.DEFAULT_URL),
                Discovery.candidates("", home));
    }

    @Test
    void aDevServerOn3000IsNotListedTwice() throws IOException {
        server(300, "http://127.0.0.1:3000", 5);
        assertEquals(List.of(Discovery.DEFAULT_URL), Discovery.candidates("", home));
    }

    @Test
    void noServersMeansOnlyTheDevDefault() {
        assertEquals(List.of(Discovery.DEFAULT_URL), Discovery.candidates(null, home));
    }

    @Test
    void anOverrideIsTheOnlyCandidate() throws IOException {
        server(100, "http://127.0.0.1:57456", 1);
        assertEquals(List.of(URI.create("http://localhost:4000")), Discovery.candidates(" http://localhost:4000/ ", home));
    }

    @Test
    void remoteUrlsAreRefusedFromConfigAndFiles() throws IOException {
        assertEquals(List.of(), Discovery.candidates("http://192.168.1.5:3000", home));
        server(100, "http://evil.example:3000", 1);
        assertEquals(List.of(Discovery.DEFAULT_URL), Discovery.candidates("", home));
    }

    @Test
    void corruptEntriesAreSkipped() throws IOException {
        Path dir = Discovery.serversDir(home);
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("1.json"), "{not json");
        server(2, "http://127.0.0.1:57456", 2);
        assertEquals(List.of(URI.create("http://127.0.0.1:57456"), Discovery.DEFAULT_URL), Discovery.candidates("", home));
    }
}
