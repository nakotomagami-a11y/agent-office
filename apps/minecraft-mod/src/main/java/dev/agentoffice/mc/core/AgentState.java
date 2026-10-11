package dev.agentoffice.mc.core;

/** How an agent is doing, as everything the mod shows reads it: its conversation's status, or why it isn't known. */
public enum AgentState {
    IDLE,
    WORKING,
    /** Its last turn failed or was stopped: it waits on its owner. */
    NEEDS_YOU,
    /** Agent Office didn't answer at all. */
    OFFLINE,
    /** Agent Office answered, but not about this agent. */
    UNKNOWN;

    /** A conversation's status; no conversation yet is idle. */
    public static AgentState of(String conversationStatus) {
        if (conversationStatus == null) return IDLE;
        return switch (conversationStatus) {
            case Protocol.Conversation.RUNNING -> WORKING;
            case Protocol.Conversation.NEEDS_ATTENTION -> NEEDS_YOU;
            default -> IDLE;
        };
    }

    /** At its desk: working, or waiting there for its owner. */
    public boolean atWork() {
        return this == WORKING || this == NEEDS_YOU;
    }
}
