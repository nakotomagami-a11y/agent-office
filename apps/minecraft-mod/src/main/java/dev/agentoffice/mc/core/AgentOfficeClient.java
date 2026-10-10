package dev.agentoffice.mc.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/**
 * Blocking client for the Agent Office HTTP API. Call it off the render thread. java.net.http
 * sends no Origin header, which is what Agent Office's loopback guard (apps/server/src/guard.ts) expects
 * from a non-browser client. Every failure, including a malformed response, surfaces as IOException.
 */
public final class AgentOfficeClient {
    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    /** Adding a seat can make a git worktree (a full checkout) before answering. */
    private static final Duration SEAT_TIMEOUT = Duration.ofSeconds(90);
    /** Review reads run gh, each call allowed 60 s by the server: the list is one call, a PR's detail two. */
    private static final Duration QUEUE_TIMEOUT = Duration.ofSeconds(75);
    private static final Duration PULL_TIMEOUT = Duration.ofSeconds(135);

    private final HttpClient http;
    private final URI base;
    /** Set for scripted dev checks: their window opens on the user's desktop, where stray input must not act. */
    private volatile boolean readOnly;

    public AgentOfficeClient(URI base) {
        this.base = base;
        // HTTP/1.1: the default h2c upgrade request makes Agent Office's Node server drop the
        // connection with no response at all.
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
    }

    /**
     * From now on, sending, stopping, retrying, approving and changing seats fail. Reads still work, and
     * so do {@link #open} (get-or-create a conversation, needed to show a chat) and {@link #current}
     * (the server's reconcile may start an already-queued message).
     */
    public AgentOfficeClient readOnly() {
        readOnly = true;
        return this;
    }

    private void writable() throws IOException {
        if (readOnly) throw new IOException("read_only: a scripted dev check never changes Agent Office");
    }

    public URI base() {
        return base;
    }

    /** First candidate that answers /api/health like Agent Office does. */
    public static Optional<AgentOfficeClient> connect(List<URI> candidates) {
        for (URI uri : candidates) {
            AgentOfficeClient client = new AgentOfficeClient(uri);
            if (client.healthy()) return Optional.of(client);
        }
        return Optional.empty();
    }

    /**
     * Port 3000 is every dev server's default, so a bare 200 proves nothing: chat text must only
     * go to something that answers with Agent Office's health shape ({available, version}).
     */
    public boolean healthy() {
        try {
            JsonElement el = call(get("/api/health"));
            return el.isJsonObject() && el.getAsJsonObject().has("available") && el.getAsJsonObject().has("version");
        } catch (IOException e) {
            return false;
        }
    }

    /** Every project that isn't shelved, including ones with no seats yet. */
    public List<Api.Project> projects() throws IOException {
        return parse(() -> {
            List<Api.Project> out = new ArrayList<>();
            for (JsonElement el : call(get("/api/projects")).getAsJsonArray()) {
                JsonObject p = el.getAsJsonObject();
                if (bool(p, "shelved")) continue;
                int count = p.has("instanceCount") && !p.get("instanceCount").isJsonNull() ? p.get("instanceCount").getAsInt() : 0;
                out.add(new Api.Project(str(p, "id"), str(p, "name"), count));
            }
            return out;
        });
    }

    public List<Api.Instance> instances(Api.Project project) throws IOException {
        return parse(() -> {
            JsonObject meta = call(get("/api/projects/" + enc(project.id()))).getAsJsonObject().getAsJsonObject("meta");
            List<Api.Instance> out = new ArrayList<>();
            if (meta == null || !meta.has("roster")) return out;
            for (JsonElement el : meta.getAsJsonArray("roster")) {
                JsonObject s = el.getAsJsonObject();
                Api.Slot slot = new Api.Slot(project.id(), project.name(), str(s, "agentId"), str(s, "instanceId"), str(s, "label"));
                out.add(new Api.Instance(slot, str(s, "model"), str(s, "effort"), str(s, "permissionMode")));
            }
            return out;
        });
    }

    /** Project ids of the desktop app's open tabs, in order; empty if it has none. */
    public List<String> openTabs() throws IOException {
        return parse(() -> {
            JsonObject settings = call(get("/api/ui-settings")).getAsJsonObject();
            List<String> out = new ArrayList<>();
            String raw = str(settings, "tabs-state");
            if (raw == null) return out;
            JsonElement state = JsonParser.parseString(raw);
            if (!state.isJsonObject() || !state.getAsJsonObject().has("tabs")) return out;
            for (JsonElement t : state.getAsJsonObject().getAsJsonArray("tabs")) {
                String id = t.isJsonObject() ? str(t.getAsJsonObject(), "projectId") : null;
                if (id != null && !out.contains(id)) out.add(id);
            }
            return out;
        });
    }

    public List<Api.Slot> roster(Api.Project project) throws IOException {
        return instances(project).stream().map(Api.Instance::slot).toList();
    }

    /** A project's open pull requests (gh runs behind this, hence the long timeout). */
    public Review.Queue pulls(String projectId, String projectName) throws IOException {
        return parse(() -> Review.queue(call(slow(get("/api/projects/" + enc(projectId) + "/reviews"), QUEUE_TIMEOUT)).getAsJsonObject(), projectId, projectName));
    }

    /** One pull request with its parsed diff, checks, notes and the seat its feedback goes to. */
    public Review.Detail pull(String projectId, String projectName, int number) throws IOException {
        return parse(() -> Review.detail(
                call(slow(get("/api/projects/" + enc(projectId) + "/reviews/" + number), PULL_TIMEOUT)).getAsJsonObject(), projectId, projectName));
    }

    private static HttpRequest slow(HttpRequest req, Duration timeout) {
        return HttpRequest.newBuilder(req, (name, value) -> true).timeout(timeout).build();
    }

    /** Agent definitions (~/.claude/agents), for adding a seat to a project. */
    public List<Api.Agent> agents() throws IOException {
        return parse(() -> {
            List<Api.Agent> out = new ArrayList<>();
            for (JsonElement el : call(get("/api/agents")).getAsJsonArray()) {
                JsonObject a = el.getAsJsonObject();
                out.add(new Api.Agent(str(a, "name"), str(a, "description"), str(a, "defaultModel"), str(a, "defaultEffort")));
            }
            return out;
        });
    }

    /**
     * Adds a seat and returns its instance id (the route answers {project, instance}). A full project
     * answers 409 INSTANCE_CAP_EXCEEDED (an {@link Api.ApiException} with {@code softCap});
     * {@code force} gets past the soft cap only.
     */
    public String addInstance(String projectId, String agentId, boolean force) throws IOException {
        writable();
        JsonObject body = new JsonObject();
        body.addProperty("agentId", agentId);
        if (force) body.addProperty("force", true);
        HttpRequest req = HttpRequest.newBuilder(post("/api/projects/" + enc(projectId) + "/roster", body), (n, v) -> true)
                .timeout(SEAT_TIMEOUT).build();
        JsonElement el = call(req);
        return parse(() -> {
            JsonObject instance = el.getAsJsonObject().getAsJsonObject("instance");
            String id = instance == null ? null : str(instance, "instanceId");
            if (id == null) throw new IOException("bad_response: no instance id");
            return id;
        });
    }

    /** {@code patch} fields: label, model, effort, permissionMode; "" clears the override. */
    public void patchInstance(Api.Slot slot, JsonObject patch) throws IOException {
        writable();
        call(send("PATCH", rosterPath(slot), patch));
    }

    /** Removes the seat and its git worktree (uncommitted work in it is lost). Transcripts are archived. */
    public void removeInstance(Api.Slot slot) throws IOException {
        writable();
        call(HttpRequest.newBuilder(base.resolve(rosterPath(slot))).timeout(TIMEOUT).DELETE().build());
    }

    private static String rosterPath(Api.Slot slot) {
        return "/api/projects/" + enc(slot.projectId()) + "/roster/" + enc(slot.instanceId());
    }

    /** Get-or-create the slot's current conversation. */
    public Api.Conversation open(Api.Slot slot) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("agentId", slot.agentId());
        body.addProperty("instanceId", slot.instanceId());
        body.addProperty("projectId", slot.projectId());
        JsonElement el = call(post("/api/conversations", body));
        return parse(() -> conversation(el));
    }

    /**
     * The slot's current conversation, or empty if it never had one. Creates nothing, but the
     * server reconciles before answering, which may start the next queued message.
     */
    public Optional<Api.Conversation> current(Api.Slot slot) throws IOException {
        JsonElement el = call(get("/api/conversations?agentId=" + enc(slot.agentId()) + "&instanceId=" + enc(slot.instanceId())));
        return parse(() -> el.isJsonNull() ? Optional.empty() : Optional.of(conversation(el)));
    }

    /** Starts a turn, or queues it if the agent is busy (server decides). */
    public Api.Conversation send(String conversationId, String text) throws IOException {
        writable();
        JsonObject body = new JsonObject();
        body.addProperty("text", text);
        JsonElement el = call(post("/api/conversations/" + enc(conversationId) + "/messages", body));
        return parse(() -> conversation(el));
    }

    /** {@code action}: retry, resume or skip (after needs_attention), or new (a fresh thread). */
    public Api.Conversation act(String conversationId, String action) throws IOException {
        writable();
        JsonElement el = call(post("/api/conversations/" + enc(conversationId) + "/" + enc(action), new JsonObject()));
        return parse(() -> conversation(el));
    }

    /** Stops a run; the conversation then needs attention (retry or skip). */
    public boolean abort(String runId) throws IOException {
        writable();
        JsonElement el = call(post("/api/runs/" + enc(runId) + "/abort", new JsonObject()));
        return parse(() -> bool(el.getAsJsonObject(), "aborted"));
    }

    /** Tool calls of a run waiting for an answer. Not replayed by the stream: re-read after attaching. */
    public List<Api.Permission> permissions(String runId) throws IOException {
        JsonElement el = call(get("/api/runs/" + enc(runId) + "/permission"));
        return parse(() -> {
            List<Api.Permission> out = new ArrayList<>();
            for (JsonElement p : el.getAsJsonObject().getAsJsonArray("pending")) {
                JsonObject o = p.getAsJsonObject();
                JsonElement input = o.get("input");
                out.add(new Api.Permission(str(o, "id"), str(o, "runId"), str(o, "tool"),
                        input == null || input.isJsonNull() ? null : input.toString()));
            }
            return out;
        });
    }

    public void answerPermission(String runId, String id, boolean allow) throws IOException {
        writable();
        JsonObject body = new JsonObject();
        body.addProperty("id", id);
        body.addProperty("decision", allow ? "allow" : "deny");
        call(send("PATCH", "/api/runs/" + enc(runId) + "/permission", body));
    }

    /** Raw bytes of an Agent Office path (images); refuses anything over {@code maxBytes}. */
    public byte[] bytes(String path, int maxBytes) throws IOException {
        HttpResponse<InputStream> res;
        try {
            res = http.send(get(path), HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        }
        try (InputStream in = res.body()) {
            if (res.statusCode() != 200) throw new Api.ApiException(res.statusCode(), null);
            byte[] data = in.readNBytes(maxBytes + 1);
            if (data.length > maxBytes) throw new IOException("too_large");
            return data;
        }
    }

    /**
     * Streams a run's events on {@code executor} until the run ends or the handle is closed.
     * {@code onEnd} always runs exactly once, with the failure or null.
     */
    public Closeable stream(String runId, Executor executor, Consumer<Api.Event> onEvent, Consumer<Throwable> onEnd) {
        HttpRequest req = HttpRequest.newBuilder(base.resolve("/api/runs/" + enc(runId) + "/stream"))
                .timeout(TIMEOUT) // bounds the wait for headers only; the body may stream for as long as the run
                .header("accept", "text/event-stream")
                .GET()
                .build();
        StreamHandle handle = new StreamHandle();
        executor.execute(() -> {
            Throwable failure = null;
            try {
                HttpResponse<InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
                handle.attach(res.body());
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
                    if (res.statusCode() != 200) throw new Api.ApiException(res.statusCode(), null);
                    SseParser parser = new SseParser(onEvent);
                    String line;
                    while ((line = reader.readLine()) != null) parser.line(line);
                }
            } catch (IOException | RuntimeException e) {
                if (!handle.closed) failure = e;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                failure = e;
            } finally {
                onEnd.accept(failure);
            }
        });
        return handle;
    }

    /** Closing the body from another thread is what unblocks the reader. */
    private static final class StreamHandle implements Closeable {
        private InputStream body;
        private volatile boolean closed;

        synchronized void attach(InputStream in) throws IOException {
            body = in;
            if (closed) in.close();
        }

        @Override
        public synchronized void close() throws IOException {
            closed = true;
            if (body != null) body.close();
        }
    }

    static Api.Conversation conversation(JsonElement el) {
        JsonObject c = el.getAsJsonObject();
        List<Api.Turn> turns = new ArrayList<>();
        JsonArray arr = c.has("turns") && c.get("turns").isJsonArray() ? c.getAsJsonArray("turns") : new JsonArray();
        for (JsonElement t : arr) {
            JsonObject o = t.getAsJsonObject();
            turns.add(turn(o));
        }
        int queued = c.has("queue") && c.get("queue").isJsonArray() ? c.getAsJsonArray("queue").size() : 0;
        return new Api.Conversation(
                str(c, "id"), str(c, "agentId"), str(c, "instanceId"), str(c, "projectId"),
                str(c, "status"), str(c, "activeRunId"), turns, queued);
    }

    static Api.Turn turn(JsonObject o) {
        List<Api.ToolCall> calls = new ArrayList<>();
        if (o.has("toolCalls") && o.get("toolCalls").isJsonArray()) {
            for (JsonElement t : o.getAsJsonArray("toolCalls")) {
                JsonObject c = t.getAsJsonObject();
                JsonElement input = c.get("input");
                String raw = input == null || input.isJsonNull() ? null : input.isJsonPrimitive() ? input.getAsString() : input.toString();
                calls.add(new Api.ToolCall(str(c, "id"), str(c, "name"), raw));
            }
        }
        JsonElement exit = o.get("exitCode");
        return new Api.Turn(
                str(o, "id"), str(o, "prompt"), str(o, "output"), str(o, "status"), str(o, "origin"), calls,
                num(o, "tokensIn"), num(o, "tokensOut"), o.has("cost") && !o.get("cost").isJsonNull() ? o.get("cost").getAsDouble() : 0,
                num(o, "durMs"), exit == null || exit.isJsonNull() ? null : exit.getAsInt(), str(o, "model"), str(o, "effort"));
    }

    private interface Parse<T> {
        T run() throws IOException;
    }

    /** Gson signals a wrong shape with RuntimeExceptions; callers only handle IOException. */
    private static <T> T parse(Parse<T> body) throws IOException {
        try {
            return body.run();
        } catch (RuntimeException e) {
            throw new IOException("bad_response: " + e.getMessage(), e);
        }
    }

    private JsonElement call(HttpRequest req) throws IOException {
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        }
        if (res.statusCode() / 100 != 2) throw apiError(res.statusCode(), res.body());
        return parse(() -> JsonParser.parseString(res.body()));
    }

    private static Api.ApiException apiError(int status, String body) {
        try {
            JsonElement el = JsonParser.parseString(body);
            if (!el.isJsonObject()) return new Api.ApiException(status, null);
            JsonObject o = el.getAsJsonObject();
            return new Api.ApiException(status, str(o, "error"), bool(o, "softCap"), str(o, "hint"), str(o, "detail"));
        } catch (RuntimeException e) {
            return new Api.ApiException(status, null);
        }
    }

    private HttpRequest get(String path) {
        return HttpRequest.newBuilder(base.resolve(path)).timeout(TIMEOUT).GET().build();
    }

    private HttpRequest post(String path, JsonObject body) {
        return send("POST", path, body);
    }

    private HttpRequest send(String method, String path, JsonObject body) {
        return HttpRequest.newBuilder(base.resolve(path))
                .timeout(TIMEOUT)
                .header("content-type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8))
                .build();
    }

    private static String enc(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String str(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsString();
    }

    private static long num(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? 0 : el.getAsLong();
    }

    private static boolean bool(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonPrimitive() && el.getAsBoolean();
    }
}
