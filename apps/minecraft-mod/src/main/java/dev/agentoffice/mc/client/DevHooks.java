package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentOfficeMod;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.LecternStore;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import net.neoforged.fml.loading.FMLEnvironment;

/**
 * Dev client only (inert in production): lets a script drive the mod, screenshot and quit, so it
 * can be checked without clicking through it.
 *
 *   gradlew runClient -PaoOpen=office -PaoQuit=true                  (the tablet's home screen)
 *   gradlew runClient -PaoOpen=chat:projectId:instanceId:agentId
 *   gradlew runClient -PaoOpen=place:projectId:instanceId:agentId   (flat dev world, body ahead)
 *   gradlew runClient -PaoOpen=world                                 (just load it: bodies come back?)
 *   gradlew runClient -PaoOpen=interact                              (load it and right-click ahead)
 *   gradlew runClient -PaoOpen=hold                                  (load it with an Agent Tablet in hand)
 *   gradlew runClient -PaoOpen=tablet                                (load it, then use the tablet)
 *   gradlew runClient -PaoOpen=egg                                   (use an Agent Spawn Egg on the ground ahead)
 *   gradlew runClient -PaoOpen=shell                                 (egg, then right-click the shell: setup screen)
 *   gradlew runClient -PaoOpen=lectern                               (a Review Lectern ahead, used: its project picker)
 *   gradlew runClient -PaoOpen=lecternview                           (a Review Lectern ahead, just looked at)
 *   gradlew runClient -PaoOpen=review:projectId                      (a review queue; review:* = All projects)
 */
final class DevHooks {
    private static final String OPEN = System.getProperty("agentoffice.dev.open", "");
    private static final boolean QUIT = Boolean.getBoolean("agentoffice.dev.quit");
    /** Mouse-wheel notches applied to the open screen shortly before the screenshot (positive = up). */
    private static final int SCROLL = Integer.getInteger("agentoffice.dev.scroll", 0);
    private static final int SCROLL_DOWN = Integer.getInteger("agentoffice.dev.scrollDown", 0);
    /** A button label; `U+25B6` names one by code point (a Windows command line mangles symbols like ▶). */
    private static final String PRESS = label(System.getProperty("agentoffice.dev.press", ""));

    private static String label(String raw) {
        if (!raw.matches("U\\+[0-9A-Fa-f]{4,6}")) return raw;
        int cp = Integer.parseInt(raw.substring(2), 16);
        return Character.isValidCodePoint(cp) ? new String(Character.toChars(cp)) : raw;
    }

    private static final int SHOT_AFTER_TICKS = Integer.getInteger("agentoffice.dev.shotAfterTicks", 100);
    private static final String WORLD = System.getProperty("agentoffice.dev.world", "AgentOfficeDev");

    private static boolean started;
    private static int inWorldTicks;
    private static int ticksSinceAction = -1;

    private DevHooks() {}

    /** A scripted check is running: its client is read-only (see AgentOfficeClient#readOnly). */
    static boolean active() {
        return !FMLEnvironment.production && !OPEN.isEmpty();
    }

    static void tick(Minecraft mc) {
        if (FMLEnvironment.production || OPEN.isEmpty()) return;
        if (!started && mc.screen instanceof TitleScreen) {
            started = true;
            start(mc);
            return;
        }
        boolean tablet = OPEN.equals("hold") || OPEN.equals("tablet");
        boolean egg = OPEN.equals("egg") || OPEN.equals("shell");
        boolean lectern = OPEN.equals("lectern") || OPEN.equals("lecternview");
        boolean worldMode = OPEN.startsWith("place:") || OPEN.equals("world") || OPEN.equals("interact") || tablet || egg || lectern;
        if (worldMode && started && ticksSinceAction < 0 && mc.player != null && mc.screen == null) {
            inWorldTicks++;
            if (inWorldTicks == 40) {
                mc.player.setXRot(0);
                if (OPEN.startsWith("place:")) Bodies.place(mc, slot(OPEN));
                if (OPEN.equals("interact")) KeyMapping.click(mc.options.keyUse.getKey());
                if (tablet) give(mc, new ItemStack(AgentOfficeMod.TABLET.get()));
                if (egg) give(mc, new ItemStack(AgentOfficeMod.AGENT_EGG.get()));
                if (lectern) {
                    // Away from agent bodies left in the dev world by earlier checks: the use must hit the lectern.
                    mc.level.getEntitiesOfClass(AgentBody.class, mc.player.getBoundingBox().inflate(16)).stream().findFirst()
                            .ifPresent(b -> mc.player.setYRot(Bodies.yawTowards(b.position(), mc.player.position())));
                    placeLectern(mc);
                }
                if (!OPEN.equals("tablet") && !egg && !lectern) ticksSinceAction = 0;
            } else if (lectern && inWorldTicks == 60) {
                mc.player.setXRot(55); // down at the lectern right ahead
                if (OPEN.equals("lectern")) KeyMapping.click(mc.options.keyUse.getKey());
                ticksSinceAction = 0;
            } else if (OPEN.equals("tablet") && inWorldTicks == 60) {
                mc.player.setXRot(-90); // straight up, at nothing: use the item itself, not an agent body
                KeyMapping.click(mc.options.keyUse.getKey());
                ticksSinceAction = 0;
            } else if (egg && inWorldTicks == 60) {
                // Away from any agent body nearby: the use must hit the ground, not open someone's chat.
                mc.level.getEntitiesOfClass(AgentBody.class, mc.player.getBoundingBox().inflate(16)).stream().findFirst()
                        .ifPresent(b -> mc.player.setYRot(Bodies.yawTowards(b.position(), mc.player.position())));
                mc.player.setXRot(35); // at the ground a few blocks ahead
                KeyMapping.click(mc.options.keyUse.getKey());
                if (OPEN.equals("egg")) ticksSinceAction = 0;
            } else if (OPEN.equals("shell") && inWorldTicks == 80) {
                mc.player.setXRot(15); // at the shell that just appeared there
                KeyMapping.click(mc.options.keyUse.getKey());
                ticksSinceAction = 0;
            }
            return;
        }
        if (ticksSinceAction == SHOT_AFTER_TICKS - 40 && !PRESS.isEmpty() && mc.screen != null) {
            mc.screen.children().stream()
                    .filter(c -> c instanceof net.minecraft.client.gui.components.Button b && b.getMessage().getString().equals(PRESS))
                    .findFirst().ifPresent(c -> ((net.minecraft.client.gui.components.Button) c).onPress());
        }
        if (ticksSinceAction >= 0 && ticksSinceAction == SHOT_AFTER_TICKS - 20 && SCROLL != 0 && mc.screen != null) {
            mc.screen.mouseScrolled(mc.screen.width / 2.0, mc.screen.height / 2.0, 0, SCROLL);
            if (SCROLL_DOWN != 0) mc.screen.mouseScrolled(mc.screen.width / 2.0, mc.screen.height / 2.0, 0, -SCROLL_DOWN);
        }
        if (ticksSinceAction < 0 || ++ticksSinceAction != SHOT_AFTER_TICKS) return;
        Screenshot.grab(mc.gameDirectory, mc.getMainRenderTarget(), msg -> System.out.println("[agentoffice-dev] " + msg.getString()));
        if (QUIT) mc.stop();
    }

    private static void start(Minecraft mc) {
        OfficeScreen office = new OfficeScreen();
        if (OPEN.equals("office")) {
            mc.setScreen(office);
            ticksSinceAction = 0;
        } else if (OPEN.startsWith("review:")) {
            String project = OPEN.substring("review:".length());
            LecternStore.Binding binding = new LecternStore.Binding(project, project.equals(LecternStore.ALL) ? "All projects" : project);
            Connection.client()
                    .thenAccept(c -> mc.execute(() -> mc.setScreen(new ReviewScreen(c, binding, null))))
                    .exceptionally(err -> {
                        System.out.println("[agentoffice-dev] could not open review: " + err);
                        return null;
                    });
            ticksSinceAction = 0;
        } else if (OPEN.startsWith("chat:")) {
            Connection.client()
                    .thenAccept(c -> mc.execute(() -> mc.setScreen(new ChatScreen(office, c, slot(OPEN)))))
                    .exceptionally(err -> {
                        System.out.println("[agentoffice-dev] could not open chat: " + err);
                        return null;
                    });
            ticksSinceAction = 0;
        } else if (mc.getLevelSource().levelExists(WORLD)) {
            // onFail runs when the player backs out of a recover/backup prompt: it must leave that screen.
            Screen back = mc.screen;
            mc.createWorldOpenFlows().openWorld(WORLD, () -> {
                System.out.println("[agentoffice-dev] could not open " + WORLD);
                mc.setScreen(back);
            });
        } else {
            GameRules rules = new GameRules();
            rules.getRule(GameRules.RULE_DAYLIGHT).set(false, null);
            rules.getRule(GameRules.RULE_WEATHER_CYCLE).set(false, null);
            rules.getRule(GameRules.RULE_DOMOBSPAWNING).set(false, null);
            mc.createWorldOpenFlows().createFreshLevel(
                    WORLD,
                    new LevelSettings(WORLD, GameType.CREATIVE, false, Difficulty.PEACEFUL, true, rules, WorldDataConfiguration.DEFAULT),
                    new WorldOptions(0L, false, false),
                    reg -> reg.registryOrThrow(Registries.WORLD_PRESET).getHolderOrThrow(WorldPresets.FLAT).value().createWorldDimensions(),
                    mc.screen);
        }
    }

    /** A Review Lectern right ahead, facing the player, with no project picked yet: nearer than any agent body, so the use hits it. */
    private static void placeLectern(Minecraft mc) {
        IntegratedServer server = mc.getSingleplayerServer();
        if (server == null || mc.player == null || mc.level == null) return;
        net.minecraft.core.Direction facing = mc.player.getDirection();
        net.minecraft.core.BlockPos pos = mc.player.blockPosition().relative(facing, 1);
        String key = Lecterns.key(mc, pos);
        if (key != null) Lecterns.store().unbind(key);
        net.minecraft.resources.ResourceKey<net.minecraft.world.level.Level> dim = mc.level.dimension();
        server.execute(() -> {
            net.minecraft.server.level.ServerLevel level = server.getLevel(dim);
            if (level != null) {
                level.setBlockAndUpdate(pos, AgentOfficeMod.REVIEW_LECTERN.get().defaultBlockState()
                        .setValue(net.minecraft.world.level.block.HorizontalDirectionalBlock.FACING, facing.getOpposite()));
            }
        });
    }

    /** Puts {@code stack} in hotbar slot 1 through the integrated server (inventories are server-side). */
    private static void give(Minecraft mc, ItemStack stack) {
        IntegratedServer server = mc.getSingleplayerServer();
        if (server == null || mc.player == null) return;
        java.util.UUID id = mc.player.getUUID();
        server.execute(() -> {
            ServerPlayer player = server.getPlayerList().getPlayer(id);
            if (player != null) player.getInventory().setItem(0, stack);
        });
        mc.player.getInventory().selected = 0;
    }

    private static Api.Slot slot(String spec) {
        String[] p = spec.split(":", 4);
        return new Api.Slot(p[1], p[1], p[3], p[2], null);
    }
}
