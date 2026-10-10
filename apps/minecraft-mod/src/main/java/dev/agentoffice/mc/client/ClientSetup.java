package dev.agentoffice.mc.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.AgentNet;
import dev.agentoffice.mc.AgentOfficeMod;
import dev.agentoffice.mc.ReviewLecternBlock;
import dev.agentoffice.mc.TabletItem;
import dev.agentoffice.mc.client.ui.ImageCache;
import dev.agentoffice.mc.core.Api;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.EntityHitResult;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RegisterColorHandlersEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.client.event.RegisterMenuScreensEvent;
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
        ReviewLecternBlock.openOnClient = (pos, rebind) -> Lecterns.open(Minecraft.getInstance(), pos, rebind);
        AgentNet.onPlaced = Bodies::onPlaced;
        container.registerConfig(ModConfig.Type.CLIENT, SPEC);
        modBus.addListener(ClientSetup::registerKeys);
        modBus.addListener(ClientSetup::itemColors);
        modBus.addListener(ClientSetup::blockColors);
        modBus.addListener((EntityRenderersEvent.RegisterRenderers e) -> e.registerEntityRenderer(AgentOfficeMod.AGENT.get(), AgentRenderer::new));
        modBus.addListener((RegisterMenuScreensEvent e) -> e.register(AgentOfficeMod.AGENT_MENU.get(), AgentInventoryScreen::new));
        NeoForge.EVENT_BUS.addListener(ClientSetup::onClientTick);
        NeoForge.EVENT_BUS.addListener(ClientSetup::onInteract);
        NeoForge.EVENT_BUS.addListener((ClientPlayerNetworkEvent.LoggingIn e) -> Bodies.joined());
        NeoForge.EVENT_BUS.addListener((ClientPlayerNetworkEvent.LoggingOut e) -> Bodies.left());
    }

    /**
     * Using an agent opens its chat here, without telling the server; sneak-using it goes to the server,
     * which opens its inventory ({@link AgentEntity#mobInteract}). Only its owner can do either.
     */
    private static void onInteract(InputEvent.InteractionKeyMappingTriggered event) {
        Minecraft mc = Minecraft.getInstance();
        if (!event.isUseItem() || !(mc.hitResult instanceof EntityHitResult hit) || !(hit.getEntity() instanceof AgentEntity body)) return;
        if (!body.isOwnedBy(mc.player)) {
            event.setCanceled(true);
            event.setSwingHand(false);
            mc.gui.setOverlayMessage(Component.literal("That's another player's agent"), false);
            return;
        }
        if (mc.player.isSecondaryUseActive() && !body.isShell()) return;
        event.setCanceled(true);
        event.setSwingHand(false);
        if (opening) return;
        opening = true;
        Connection.client().whenComplete((client, err) -> mc.execute(() -> {
            opening = false;
            if (err != null) {
                mc.gui.setOverlayMessage(Component.literal("Agent Office isn't running"), false);
            } else if (mc.screen == null && mc.level != null) {
                // The player may have opened something else or left the world while we connected.
                // A shell has no seat yet: it can only be set up, never chatted with.
                Api.Slot seat = Bodies.seatOf(body);
                if (body.isShell()) mc.setScreen(new AgentSetupScreen(client, body.getUUID()));
                else if (seat != null) mc.setScreen(new ChatScreen(null, client, seat));
                else mc.gui.setOverlayMessage(Component.literal("This world hasn't told us which seat it is yet: try again"), false);
            }
        }));
    }

    /** The tablet's home screen; from the K key or using an Agent Tablet. */
    static void openOffice() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen == null) WorkspaceScreen.openHome(mc);
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
