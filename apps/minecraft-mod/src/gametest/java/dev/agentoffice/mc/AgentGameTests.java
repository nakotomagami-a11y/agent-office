package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Zombie;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.gametest.GameTestHolder;
import net.neoforged.neoforge.gametest.PrefixGameTestTemplate;

/** Agents in a real world: what earns and loses XP, and whom they may hurt. */
@GameTestHolder(AgentOfficeMod.MOD_ID)
@PrefixGameTestTemplate(false)
public final class AgentGameTests {
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
}
