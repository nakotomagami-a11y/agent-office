package dev.agentoffice.mc.ai;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.village.poi.PoiManager;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Blocks;

/**
 * One agent's village: the nearest bell to where it was put. Looked up only while every chunk in reach is loaded (a POI
 * search into unloaded chunks reads them from disk on the server thread), at most every 10 s, and kept while it stands.
 */
public final class VillageSense {
    private static final int RECHECK_TICKS = 200;
    private static final int SEARCH_RADIUS = 48;
    /** Chunks the search scans around home's: 48 / 16 + 1. */
    private static final int SEARCH_CHUNKS = 4;

    private BlockPos bell;
    private int nextLookup;

    /** Null while it knows no village. */
    public BlockPos bell(ServerLevel level, BlockPos home, int tick) {
        if (tick < nextLookup) return bell;
        nextLookup = tick + RECHECK_TICKS;
        if (bell != null && level.isLoaded(bell) && level.getBlockState(bell).is(Blocks.BELL)) return bell;
        ChunkPos center = new ChunkPos(home);
        if (ChunkPos.rangeClosed(center, SEARCH_CHUNKS).allMatch(c -> level.hasChunk(c.x, c.z))) {
            bell = level.getPoiManager().findClosest(p -> p.is(PoiTypes.MEETING), home, SEARCH_RADIUS, PoiManager.Occupancy.ANY).orElse(null);
        }
        return bell;
    }
}
