package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.agentoffice.mc.core.Transcript.AgentText;
import dev.agentoffice.mc.core.Transcript.Done;
import dev.agentoffice.mc.core.Transcript.Failure;
import dev.agentoffice.mc.core.Transcript.Tool;
import dev.agentoffice.mc.core.Transcript.You;
import java.util.List;
import org.junit.jupiter.api.Test;

class TranscriptTest {
    private static Api.Turn turn(String id, String status, String output, List<Api.ToolCall> calls) {
        return new Api.Turn(id, "do it", output, status, "user", calls, 1500, 20, 0.12, 65_000, 0, "opus", "high");
    }

    @Test
    void finishedTurnsRenderLikeTheWebHistory() {
        Api.Conversation c = new Api.Conversation("c", "a", "i", "p", "idle", null, List.of(
                turn("r1", "done", "All good", List.of(
                        new Api.ToolCall("t1", "Bash", "{\"command\":\"pnpm test\",\"description\":\"run\"}"),
                        new Api.ToolCall("t2", "Agent", "{\"prompt\":\"x\"}"))),
                turn("r2", "error", "", List.of())), 0);
        assertEquals(List.of(
                new You("do it", false),
                new Tool("t1", "Bash", "pnpm test", false),
                new AgentText("All good", false),
                new Done(0, 65_000, 1500, 20, 0.12),
                new You("do it", false),
                new Failure("unknown", null)), Transcript.history(c));
    }

    @Test
    void theActiveTurnShowsOnlyItsPromptTheStreamDoesTheRest() {
        Api.Conversation c = new Api.Conversation("c", "a", "i", "p", "running", "r1",
                List.of(turn("r1", "running", "", List.of())), 0);
        assertEquals(List.of(new You("do it", false)), Transcript.history(c));
    }

    @Test
    void attachmentFootersAreNotShown() {
        assertEquals("look", Transcript.stripAttachmentFooter("look\n\nAttachments (read these with your tools):\n- C:/a.png"));
    }

    private static Api.Event ev(String name, String data) {
        return new Api.Event(name, data);
    }

    @Test
    void liveTextSplitsAroundToolsAndToolsDedupeByUseId() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("attached", "{\"tokensIn\":0}"));
        live.apply(ev("chunk", "{\"text\":\"Let me \"}"));
        live.apply(ev("chunk", "{\"text\":\"look.\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{\"file_path\":\"a.ts\"},\"toolUseId\":\"u1\"}"));
        assertEquals("Read", live.runningTool());
        live.apply(ev("tool-done", "{\"toolUseId\":\"u1\"}"));
        live.apply(ev("chunk", "{\"text\":\"Done.\"}"));
        live.apply(ev("done", "{\"exitCode\":0,\"durationMs\":3000,\"tokensIn\":10,\"tokensOut\":5,\"cost\":0.01}"));
        assertEquals(List.of(
                new AgentText("Let me look.", false),
                new Tool("u1", "Read", "a.ts", false),
                new AgentText("Done.", false),
                new Done(0, 3000, 10, 5, 0.01)), live.items());
        assertTrue(live.ended());
    }

    @Test
    void aSpawnRevealedByTheFullInputDropsItsRow() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("tool", "{\"name\":\"Bash\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{\"file_path\":\"b\"},\"toolUseId\":\"u2\"}"));
        live.apply(ev("tool", "{\"name\":\"Bash\",\"input\":{\"command\":\"claude -p --agent qa x\"},\"toolUseId\":\"u1\"}"));
        live.apply(ev("tool-done", "{\"toolUseId\":\"u2\"}"));
        assertEquals(List.of(new Tool("u2", "Read", "b", false)), live.items());
    }

    @Test
    void attachedResetsBecauseTheServerReplaysEverything() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("chunk", "{\"text\":\"a\"}"));
        live.apply(ev("attached", "{\"output\":\"\"}"));
        live.apply(ev("chunk", "{\"text\":\"a\"}"));
        assertEquals(List.of(new AgentText("a", true)), live.items());
        assertFalse(live.ended());
    }

    @Test
    void errorsEndTheRunAndKeepTheirCode() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("error", "{\"code\":\"auth_required\",\"detail\":\"log in\"}"));
        assertEquals(List.of(new Tool("u1", "Read", null, false), new Failure("auth_required", "log in")), live.items());
        assertFalse(live.apply(ev("chunk", "not json")));
    }

    @Test
    void updatingAToolDoesNotSplitTheTextThatFollowsIt() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("chunk", "{\"text\":\"a\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("chunk", "{\"text\":\"b\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{\"file_path\":\"x\"},\"toolUseId\":\"u1\"}"));
        live.apply(ev("chunk", "{\"text\":\"c\"}"));
        assertEquals(List.of(new AgentText("a", false), new Tool("u1", "Read", "x", true), new AgentText("bc", true)), live.items());
    }

    @Test
    void anEmptyInputNeverBlanksAnArg() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("tool", "{\"name\":\"Bash\",\"input\":{\"command\":\"ls\"},\"toolUseId\":\"u1\"}"));
        live.apply(ev("tool", "{\"name\":\"Bash\",\"input\":{},\"toolUseId\":\"u1\"}"));
        assertEquals(List.of(new Tool("u1", "Bash", "ls", true)), live.items());
    }

    @Test
    void aRateLimitIsOneCardUpdatedInPlaceAndReplacesItsTextEcho() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("chunk", "{\"text\":\"You've hit your session limit…\"}"));
        live.apply(ev("rate-limit", "{\"message\":\"You've hit your session limit\"}"));
        live.apply(ev("tool", "{\"name\":\"Read\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("rate-limit", "{\"message\":\"resets at 5pm\",\"severity\":\"warning\"}"));
        assertEquals(List.of(new Transcript.RateLimit("resets at 5pm", false), new Tool("u1", "Read", null, true)), live.items());
    }

    @Test
    void subAgentsGetACardThatFollowsTheirUpdates() {
        Transcript.Live live = new Transcript.Live();
        live.apply(ev("tool", "{\"name\":\"Agent\",\"input\":{},\"toolUseId\":\"u1\"}"));
        live.apply(ev("subagent", "{\"subRunId\":\"s1\",\"agentId\":\"qa-code-review\",\"status\":\"running\",\"prompt\":\"x\"}"));
        live.apply(ev("subagent-update", "{\"subRunId\":\"s1\",\"status\":\"running\",\"currentTool\":\"Read\"}"));
        assertEquals("qa-code-review", live.runningTool());
        assertEquals(List.of(new Transcript.SubAgent("s1", "qa-code-review", "running", "Read", null)), live.items());
        live.apply(ev("done", "{\"exitCode\":0}"));
        assertEquals(new Transcript.SubAgent("s1", "qa-code-review", "done", null, null), live.items().get(0));
    }

    @Test
    void formatsMatchTheWeb() {
        assertEquals("5.3k", Transcript.fmtTok(5312));
        assertEquals("420", Transcript.fmtTok(420));
        assertEquals("1m 5s", Transcript.fmtDuration(65_000));
        assertEquals("2h 1m", Transcript.fmtDuration(7_260_000));
    }
}
