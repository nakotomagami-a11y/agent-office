package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
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

    /** Never hurt, so out of harm's way once the world is 10 s old (each run is a new world): then each 40-tick beat it mends 1, if it has eaten. */
    @GameTest(template = "empty", timeoutTicks = 500)
    public static void itHealsOnlyOnFood(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        helper.startSequence()
                .thenWaitUntil(() -> helper.assertTrue(helper.getLevel().getGameTime() > 210, "out of harm's way"))
                .thenExecute(() -> {
                    agent.setHealth(10);
                    record[0].items.set(5, new ItemStack(Items.ROTTEN_FLESH, 4));
                    record[0].items.set(7, new ItemStack(Items.SUSPICIOUS_STEW));
                })
                .thenIdle(81) // two beats or more
                .thenExecute(() -> {
                    helper.assertTrue(agent.getHealth() == 10, "no plain food, no healing, got " + agent.getHealth());
                    agent.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.MUSHROOM_STEW));
                    record[0].items.set(6, new ItemStack(Items.MUSHROOM_STEW));
                })
                .thenIdle(81)
                .thenExecute(() -> {
                    helper.assertTrue(agent.getHealth() >= 12, "a meal mends it, got " + agent.getHealth());
                    helper.assertTrue(agent.getMainHandItem().is(Items.BOWL), "the bowl is left in its hand, got " + agent.getMainHandItem());
                    helper.assertTrue(agent.getMainHandItem() == record[0].items.get(0), "its hand is its record's slot");
                    helper.assertTrue(record[0].items.get(6).is(Items.MUSHROOM_STEW), "one meal lasts more than a beat");
                    helper.assertTrue(record[0].items.get(5).getCount() == 4, "rotten flesh is never eaten");
                    helper.assertTrue(record[0].items.get(7).is(Items.SUSPICIOUS_STEW), "nor a suspicious stew");
                    helper.assertTrue(record[0].health == agent.getHealth(), "its record knows its health");
                })
                .thenSucceed();
    }

    @GameTest(template = "empty")
    public static void aNewBodyKeepsItsWoundsUntilDeath(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        AgentEntity[] moved = new AgentEntity[1];
        helper.startSequence()
                .thenIdle(2)
                .thenExecute(() -> { // a Place, as AgentNet does it: a new body, the old one discarded
                    agent.setHealth(5);
                    moved[0] = AgentEntity.spawn(helper.getLevel(), agent.position(), 0, record[0].owner, record[0].seat);
                    record[0].entity = moved[0].getUUID();
                    agent.discard();
                })
                .thenIdle(2)
                .thenExecute(() -> {
                    helper.assertTrue(moved[0].getHealth() == 5, "moving it heals nothing, got " + moved[0].getHealth());
                    record[0].fed = 3;
                    moved[0].kill();
                    helper.assertTrue(record[0].health == 0 && record[0].fed == 0, "placed again after its death, it comes back whole and unfed");
                })
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

    /** A villager stands in for every village ally (guards aren't in the dev run): the tag decides, not the class. */
    @GameTest(template = "empty")
    public static void aVillageAllyNeverHurtsAnAgent(GameTestHelper helper) {
        AgentRecords.Record[] record = new AgentRecords.Record[1];
        AgentEntity agent = place(helper, record);
        helper.runAfterDelay(2, () -> {
            helper.assertFalse(agent.isShell(), "a placed agent, not a shell (a shell takes no damage at all)");
            Villager ally = helper.spawn(EntityType.VILLAGER, new BlockPos(3, 0, 1));
            float before = agent.getHealth();
            agent.hurt(agent.damageSources().mobAttack(ally), 5);
            helper.assertTrue(agent.getHealth() == before, "an ally's stray blow does nothing");
            helper.assertTrue(agent.getLastHurtByMob() == null, "so the agent has nobody to turn on");
            Zombie monster = helper.spawn(EntityType.ZOMBIE, new BlockPos(3, 0, 3));
            agent.hurt(agent.damageSources().mobAttack(monster), 5);
            helper.assertTrue(agent.getHealth() < before, "while a monster's blow lands");
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
