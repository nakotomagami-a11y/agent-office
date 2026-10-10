package dev.agentoffice.mc.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.agentoffice.mc.AgentEggItem;
import dev.agentoffice.mc.AgentOfficeMod;
import dev.agentoffice.mc.ReviewLecternBlock;
import dev.agentoffice.mc.TabletItem;
import dev.agentoffice.mc.client.ui.ImageCache;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.EntityHitResult;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RegisterColorHandlersEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.common.ModConfigSpec;
import net.neoforged.neoforge.common.NeoForge;
import org.lwjgl.glfw.GLFW;

public final class ClientSetup {
    public static final KeyMapping OPEN = new KeyMapping(
            "key.agentoffice.open", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, "key.categories.agentoffice");

    public static final ModConfigSpec.ConfigValue<String> BASE_URL;
    private static final ModConfigSpec SPEC;

    static {
        ModConfigSpec.Builder b = new ModConfigSpec.Builder();
        BASE_URL = b.comment(
                        "Agent Office address, e.g. http://127.0.0.1:3000. Leave empty to find it automatically",
                        "(servers advertised in ~/.claude/agent-office/servers/, then port 3000). Only this machine is allowed.")
                .define("baseUrl", "");
        SPEC = b.build();
    }

    private ClientSetup() {}

    public static void init(IEventBus modBus, ModContainer container) {
        TabletItem.openOnClient = ClientSetup::openOffice;
        AgentEggItem.placeShellOnClient = at -> Bodies.placeShell(Minecraft.getInstance(), at);
        ReviewLecternBlock.openOnClient = (pos, rebind) -> Lecterns.open(Minecraft.getInstance(), pos, rebind);
        container.registerConfig(ModConfig.Type.CLIENT, SPEC);
        modBus.addListener(ClientSetup::registerKeys);
        modBus.addListener(ClientSetup::itemColors);
        modBus.addListener(ClientSetup::blockColors);
        NeoForge.EVENT_BUS.addListener(ClientSetup::onClientTick);
        NeoForge.EVENT_BUS.addListener(ClientSetup::onInteract);
    }

    /**
     * Bodies have no server twin: any click on one is handled here and cancelled, so no packet
     * about an entity id the server never issued is sent.
     */
    private static void onInteract(InputEvent.InteractionKeyMappingTriggered event) {
        Minecraft mc = Minecraft.getInstance();
        if (!(mc.hitResult instanceof EntityHitResult hit) || !(hit.getEntity() instanceof AgentBody body)) return;
        event.setCanceled(true);
        event.setSwingHand(false);
        if (!event.isUseItem() || opening) return;
        opening = true;
        Connection.client().whenComplete((client, err) -> mc.execute(() -> {
            opening = false;
            if (err != null) {
                mc.gui.setOverlayMessage(Component.literal("Agent Office isn't running"), false);
            } else if (mc.screen == null && mc.level != null) {
                // The player may have opened something else or left the world while we connected.
                // A shell has no seat yet: it can only be set up, never chatted with.
                mc.setScreen(body.slot == null ? new AgentSetupScreen(client, body.shell) : new ChatScreen(null, client, body.slot));
            }
        }));
    }

    /** The tablet's home screen; from the K key or using an Agent Tablet. */
    static void openOffice() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen == null) mc.setScreen(new OfficeScreen());
    }

    /** Main thread only: one pending open at a time, however fast the player clicks. */
    private static boolean opening;

    /** The Agent Spawn Egg: the villager egg's brown with lavender spots instead of tan. */
    private static void itemColors(RegisterColorHandlersEvent.Item event) {
        event.register((stack, tint) -> tint == 0 ? 0xFF563C33 : 0xFFB49BE0, AgentOfficeMod.AGENT_EGG.get());
        event.register((stack, tint) -> LECTERN_TINT, AgentOfficeMod.REVIEW_LECTERN_ITEM.get());
    }

    /** The Review Lectern: a vanilla lectern's textures, shaded lavender so it reads as Agent Office's. */
    private static final int LECTERN_TINT = 0xFFB4A2EC;

    private static void blockColors(RegisterColorHandlersEvent.Block event) {
        event.register((state, level, pos, tint) -> LECTERN_TINT, AgentOfficeMod.REVIEW_LECTERN.get());
    }

    private static void registerKeys(RegisterKeyMappingsEvent event) {
        event.register(OPEN);
    }

    private static void onClientTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        DevHooks.tick(mc);
        ImageCache.clearUnlessShowing(mc.screen);
        Bodies.tick(mc);
        while (OPEN.consumeClick()) {
            if (mc.screen == null) openOffice();
        }
    }
}
