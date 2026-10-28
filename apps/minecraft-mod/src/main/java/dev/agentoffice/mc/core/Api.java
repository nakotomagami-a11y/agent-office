package dev.agentoffice.mc.core;

import java.util.List;

/** Shapes of the Agent Office HTTP API this mod reads. Mirrors packages/domain/src/types. */
public final class Api {
    private Api() {}

    public record Project(String id, String name, int instanceCount) {}

    /** One agent seat in a project roster: the unit a conversation belongs to. */
    public record Slot(String projectId, String projectName, String agentId, String instanceId, String label) {
        public String displayName() {
            return label != null && !label.isBlank() ? label : AgentNames.of(agentId);
        }
    }

    /** A seat with its own overrides; null = falls back to the agent definition. */
    public record Instance(Slot slot, String model, String effort, String permissionMode) {}

    /** {@code id} is the agent's file, {@code ~/.claude/agents/<id>.md}: what seats, spawns and routes name it by. */
    public record Agent(String id, String description, String defaultModel, String defaultEffort) {}

    /** {@code input} is the raw tool input (a JSON string as persisted). */
    public record ToolCall(String id, String name, String input) {}

    public record Turn(
            String runId,
            String prompt,
            String output,
            String status,
            String origin,
            List<ToolCall> toolCalls,
            long tokensIn,
            long tokensOut,
            double cost,
            long durMs,
            Integer exitCode,
            String model,
            String effort) {
        public boolean fromSystem() {
            return "system".equals(origin);
        }
    }

    public record Conversation(
            String id,
            String agentId,
            String instanceId,
            String projectId,
            String status,
            String activeRunId,
            List<Turn> turns,
            int queued) {
        public boolean running() {
            return Protocol.Conversation.RUNNING.equals(status) && activeRunId != null;
        }

        public boolean needsAttention() {
            return Protocol.Conversation.NEEDS_ATTENTION.equals(status);
        }
    }

    /** A tool call parked until the user allows or denies it (GET /api/runs/:id/permission). */
    public record Permission(String id, String runId, String tool, String input) {}

    /** One server-sent event from /api/runs/:id/stream; data is raw JSON. */
    public record Event(String name, String data) {}

    /** A session a removal was refused for (SessionAtRisk in packages/domain/src/services/projects/projects.ts). */
    public record SessionAtRisk(long uncommitted, long unmerged, boolean unknown) {}

    public static final class ApiException extends java.io.IOException {
        public final int status;
        public final String code;
        /** INSTANCE_CAP_EXCEEDED only: true = the soft cap (`force` overrides it), false = the hard cap. */
        public final boolean softCap;
        /** What fixes it, when the server says (review errors carry one); null otherwise. */
        public final String hint;
        /** Short raw context (gh's own message for gh_failed); null otherwise. */
        public final String detail;
        /** A refused session removal (Protocol.SessionRemoval): the sessions concerned; empty otherwise. */
        public final List<SessionAtRisk> sessions;

        public ApiException(int status, String code) {
            this(status, code, false, null, null, List.of());
        }

        public ApiException(int status, String code, boolean softCap, String hint, String detail, List<SessionAtRisk> sessions) {
            super("agent_office_" + status + (code == null ? "" : ": " + code));
            this.status = status;
            this.code = code;
            this.softCap = softCap;
            this.hint = hint;
            this.detail = detail;
            this.sessions = sessions;
        }
    }
}
