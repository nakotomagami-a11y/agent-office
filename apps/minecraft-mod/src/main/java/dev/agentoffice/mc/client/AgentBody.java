package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.Api;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.npc.VillagerProfession;
import net.minecraft.world.level.Level;

/**
 * An agent's body: a villager that exists only in this client's level. It reuses the vanilla
 * entity type, so nothing is registered and servers never need the mod. It has no server twin,
 * so it must never move by physics or be pushed; it only turns its head (see Bodies).
 *
 * A shell (from an Agent Spawn Egg, not set up yet) has no slot and wears the nitwit's green robe.
 */
final class AgentBody extends Villager {
    /** Null for a shell. */
    final Api.Slot slot;
    /** The shell's id; null once it is a seat's body. */
    final String shell;

    AgentBody(Level level, Api.Slot slot, String shell) {
        super(EntityType.VILLAGER, level);
        this.slot = slot;
        this.shell = shell;
        setInvulnerable(true);
        setNoGravity(true);
        setSilent(true);
        setCustomNameVisible(true);
        if (slot == null) setVillagerData(getVillagerData().setProfession(VillagerProfession.NITWIT));
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public void push(Entity entity) {}

    @Override
    protected void doPush(Entity entity) {}
}
