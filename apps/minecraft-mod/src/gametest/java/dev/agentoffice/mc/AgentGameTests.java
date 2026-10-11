package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.common.util.FakePlayer;
import net.neoforged.neoforge.common.util.FakePlayerFactory;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.gametest.GameTestHolder;
import net.neoforged.neoforge.gametest.PrefixGameTestTemplate;

/** Agents in a real world: what earns and loses XP, whom they may hurt, where they may be put. */
@GameTestHolder(AgentOfficeMod.MOD_ID)
@PrefixGameTestTemplate(false)
public final class AgentGameTests {
    /** Where a stand-in land-claim mod refuses anything to be placed. */
    private static BlockPos claimed;

    static {
        NeoForge.EVENT_BUS.addListener((BlockEvent.EntityPlaceEvent e) -> {
            if (e.getPos().equals(claimed)) e.setCanceled(true);
        });
    }

    private AgentGameTests() {}

    /** A placed agent bound to its record, as a player's Place leaves it. Stands on the template's floor. */
    private static AgentEntity place(GameTestHelper helper, AgentRecords.Record[] record) {
        UUID owner = UUID.randomUUID();
        Api.Slot seat = new Api.Slot("p", "P", "developer", "developer-" + UUID.randomUUID(), null);
        AgentEntity agent = AgentEntity.spawn(helper.getLevel(), Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(1, 0, 1))), 0, owner, seat);
        record[0] = AgentRecords.get(helper.getLevel().getServer()).getOrCreate(owner, seat);
        record[0].entity = agent.getUUID();
        return agent;
    }

    @GameTest(template = "empty")
    public static void aKillPaysAndDeathTakesItAll(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        helper.runAfterDelay(2, () -> { // its first tick takes its record
            Zombie zombie = helper.spawn(EntityType.ZOMBIE, new BlockPos(3, 0, 1));
            zombie.hurt(agent.damageSources().mobAttack(agent), 1000);
            helper.assertTrue(zombie.isDeadOrDying(), "the agent's blow lands on a monster");
            helper.assertTrue(record[0].xp == 5, "a zombie pays 5 XP, got " + record[0].xp);
            agent.kill();
            helper.assertTrue(record[0].xp == 0, "death takes it all, left " + record[0].xp);
            helper.assertTrue(record[0].entity == null, "the record waits for the next Place");
            helper.succeed();
        });
    }

    @GameTest(template = "empty")
    public static void workPaysOnlyAtTheDesk(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        helper.startSequence()
                .thenIdle(2)
                .thenExecute(() -> { // a client says it works at a lectern 10 blocks off
                    record[0].workTicks = Tuning.WORK_XP_TICKS - 1;
                    agent.reportWork(true, agent.blockPosition().east(10));
                })
                .thenIdle(2)
                .thenExecute(() -> {
                    helper.assertTrue(record[0].xp == 0, "away from its desk it earns nothing, got " + record[0].xp);
                    agent.reportWork(true, agent.blockPosition().east(2));
                })
                .thenIdle(2)
                .thenExecute(() -> helper.assertTrue(record[0].xp == 1, "at its desk it earns, got " + record[0].xp))
                .thenSucceed();
    }

    @GameTest(template = "empty")
    public static void anAgentNeverHurtsAVillager(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        helper.runAfterDelay(2, () -> {
            Villager villager = helper.spawn(EntityType.VILLAGER, new BlockPos(3, 0, 1));
            float before = villager.getHealth();
            villager.hurt(agent.damageSources().mobAttack(agent), 5);
            helper.assertTrue(villager.getHealth() == before, "a villager is never the agent's foe");
            helper.assertTrue(record[0].xp == 0, "and pays nothing");
            helper.succeed();
        });
    }

    @GameTest(template = "empty")
    public static void aSpawnEggAsksLandClaimsFirst(GameTestHelper helper) {
        // Not a mock player: one in the player list is sent Curios packets it cannot take.
        FakePlayer player = FakePlayerFactory.getMinecraft(helper.getLevel());
        BlockPos refused = new BlockPos(1, 0, 1);
        BlockPos allowed = new BlockPos(3, 0, 3);
        claimed = helper.absolutePos(refused);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(AgentOfficeMod.AGENT_EGG.get(), 2)); // the use takes what is in hand
        helper.placeAt(player, player.getMainHandItem(), refused.below(), Direction.UP);
        helper.assertEntityNotPresent(AgentOfficeMod.AGENT.get(), refused);
        helper.assertTrue(player.getMainHandItem().getCount() == 2, "a refused egg is not used up");
        helper.placeAt(player, player.getMainHandItem(), allowed.below(), Direction.UP);
        helper.assertEntityPresent(AgentOfficeMod.AGENT.get(), allowed);
        helper.assertTrue(player.getMainHandItem().getCount() == 1, "an egg that worked is used up");
        claimed = null; // the claim and the shared fake player's hand outlive this test otherwise
        player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        helper.succeed();
    }
}
