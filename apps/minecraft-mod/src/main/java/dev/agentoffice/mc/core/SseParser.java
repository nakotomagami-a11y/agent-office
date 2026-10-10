package dev.agentoffice.mc.core;

import java.util.function.Consumer;

/** Line-at-a-time server-sent-events parser (event/data fields, blank line dispatches), per the WHATWG spec. */
public final class SseParser {
    private final Consumer<Api.Event> sink;
    private String event = "";
    private final StringBuilder data = new StringBuilder();

    public SseParser(Consumer<Api.Event> sink) {
        this.sink = sink;
    }

    public void line(String line) {
        if (line.isEmpty()) {
            if (data.length() > 0) {
                data.setLength(data.length() - 1);
                sink.accept(new Api.Event(event.isEmpty() ? "message" : event, data.toString()));
            }
            event = "";
            data.setLength(0);
            return;
        }
        if (line.startsWith(":")) return;
        int colon = line.indexOf(':');
        String field = colon < 0 ? line : line.substring(0, colon);
        String value = colon < 0 ? "" : line.substring(colon + 1);
        if (value.startsWith(" ")) value = value.substring(1);
        if (field.equals("event")) {
            event = value;
        } else if (field.equals("data")) {
            data.append(value).append('\n');
        }
    }
}
