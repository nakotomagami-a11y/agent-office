package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SseParserTest {
    private final List<Api.Event> events = new ArrayList<>();
    private final SseParser parser = new SseParser(events::add);

    private void feed(String... lines) {
        for (String l : lines) parser.line(l);
    }

    @Test
    void dispatchesOnBlankLineWithItsEventName() {
        feed("event: chunk", "data: {\"text\":\"hi\"}", "");
        assertEquals(List.of(new Api.Event("chunk", "{\"text\":\"hi\"}")), events);
    }

    @Test
    void keepalivesAndCommentsProduceNothing() {
        feed(": keepalive", "", "");
        assertEquals(List.of(), events);
    }

    @Test
    void eventNameResetsAfterEachDispatch() {
        feed("event: done", "data: 1", "", "data: 2", "");
        assertEquals(List.of(new Api.Event("done", "1"), new Api.Event("message", "2")), events);
    }

    @Test
    void multipleDataLinesJoinWithNewline() {
        feed("data: a", "data: b", "");
        assertEquals("a\nb", events.get(0).data());
    }

    @Test
    void anEmptyDataLineStillContributesItsNewline() {
        feed("data:", "data: x", "");
        assertEquals("\nx", events.get(0).data());
    }

    @Test
    void anEventWithOnlyAnEmptyDataLineIsDispatched() {
        feed("event: ping", "data:", "");
        assertEquals(List.of(new Api.Event("ping", "")), events);
    }

    @Test
    void valueWithoutLeadingSpaceIsKept() {
        feed("event:tool", "data:{}", "");
        assertEquals(new Api.Event("tool", "{}"), events.get(0));
    }
}
