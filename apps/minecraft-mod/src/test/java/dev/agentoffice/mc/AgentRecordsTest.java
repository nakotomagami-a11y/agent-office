package dev.agentoffice.mc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.agentoffice.mc.core.Api;
import java.util.UUID;
import net.minecraft.core.NonNullList;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantments;
import net.neoforged.testframework.junit.EphemeralTestServerProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/** A world's agents survive its save: owner, seat, body, every item (enchantments too) and the Curios slots. */
@ExtendWith(EphemeralTestServerProvider.class)
class AgentRecordsTest {
    @Test
    void recordsSurviveSaveAndLoad(MinecraftServer server) {
        UUID owner = UUID.randomUUID();
        UUID body = UUID.randomUUID();
        Api.Slot seat = new Api.Slot("agent-office", "Agent Office", "developer", "developer-a1", "Reviewer");
        AgentRecords records = new AgentRecords();
        AgentRecords.Record r = records.getOrCreate(owner, seat);
        r.entity = body;
        ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
        sword.enchant(server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SHARPNESS), 3);
        sword.setDamageValue(17);
        r.items.set(AgentEntity.index(net.minecraft.world.entity.EquipmentSlot.MAINHAND), sword);
        r.items.set(39, new ItemStack(Items.IRON_HELMET));
        r.items.set(20, new ItemStack(Items.ARROW, 37));
        NonNullList<ItemStack> ring = NonNullList.withSize(2, ItemStack.EMPTY);
        ring.set(1, new ItemStack(Items.GOLD_INGOT));
        r.curios.put("ring", ring);
        r.xp = 123;
        r.workTicks = 4500;
        r.health = 7.5f;
        r.fed = 3;
        AgentRecords.Record shellless = records.getOrCreate(UUID.randomUUID(), new Api.Slot("p", null, "cs-ceo", "cs-ceo-1", null));

        CompoundTag saved = records.save(new CompoundTag(), server.registryAccess());
        AgentRecords back = AgentRecords.load(saved, server.registryAccess());

        AgentRecords.Record b = back.find(owner, seat);
        assertEquals(seat, b.seat);
        assertEquals(body, b.entity);
        assertTrue(ItemStack.matches(sword, b.items.get(0)), "the sword, its enchantment and its wear");
        assertTrue(ItemStack.matches(new ItemStack(Items.IRON_HELMET), b.items.get(39)));
        assertTrue(ItemStack.matches(new ItemStack(Items.ARROW, 37), b.items.get(20)));
        assertEquals(2, b.curios.get("ring").size());
        assertTrue(ItemStack.matches(new ItemStack(Items.GOLD_INGOT), b.curios.get("ring").get(1)));
        assertEquals(123, b.xp);
        assertEquals(4500, b.workTicks);
        assertEquals(7.5f, b.health);
        assertEquals(3, b.fed);
        assertNull(back.find(shellless.owner, shellless.seat).entity);
        assertEquals(2, back.bodiesOf(owner).size() + back.bodiesOf(shellless.owner).size());
    }

    @Test
    void aDismissedAgentKeepsItsLevelWhenPlacedAgain(MinecraftServer server) {
        UUID owner = UUID.randomUUID();
        Api.Slot seat = new Api.Slot("p", null, "developer", "developer-1", null);
        AgentRecords records = new AgentRecords();
        records.getOrCreate(owner, seat).xp = 250;
        records.remove(records.find(owner, seat));
        AgentRecords back = AgentRecords.load(records.save(new CompoundTag(), server.registryAccess()), server.registryAccess());
        assertNull(back.find(owner, seat), "dismissed");
        assertEquals(250, back.getOrCreate(owner, new Api.Slot("p", null, "developer", "developer-2", null)).xp, "placed again, any seat of it");
    }
}
