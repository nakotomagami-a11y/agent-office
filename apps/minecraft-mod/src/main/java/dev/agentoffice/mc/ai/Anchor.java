package dev.agentoffice.mc.ai;

import net.minecraft.core.BlockPos;

/**
 * Somewhere to keep near: within {@code radius}, strolling about once every 2 × {@code idleTicks} on average (goals
 * are offered a start every other tick). Deliberately not vanilla's restriction (restrictTo), which would also stop it
 * targeting anything outside the radius: a working agent must still go and help.
 */
public record Anchor(BlockPos pos, int radius, int idleTicks) {}
