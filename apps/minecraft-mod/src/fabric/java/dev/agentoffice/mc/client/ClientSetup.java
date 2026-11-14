package dev.agentoffice.mc.client;

import com.mojang.blaze3d.platform.InputConstants;
import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.AgentNet;
import dev.agentoffice.mc.AgentOfficeMod;
import dev.agentoffice.mc.AgentPayloads;
import dev.agentoffice.mc.Platform;
import dev.agentoffice.mc.ReviewLecternBlock;
import dev.agentoffice.mc.TabletItem;
import dev.agentoffice.mc.client.render.AgentRenderer;
import dev.agentoffice.mc.client.screen.AgentInventoryScreen;
import dev.agentoffice.mc.client.screen.AgentSetupScreen;
import dev.agentoffice.mc.client.screen.ChatScreen;
import dev.agentoffice.mc.client.screen.WorkspaceScreen;
import dev.agentoffice.mc.client.service.AgentOffice;
import dev.agentoffice.mc.client.service.AgentStatus;
import dev.agentoffice.mc.client.service.Bodies;
import dev.agentoffice.mc.client.service.Lecterns;
import dev.agentoffice.mc.client.ui.ImageCache;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Ids;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionResult;
import org.lwjgl.glfw.GLFW;

/** Fabric's client setup; NeoForge's is in src/neoforge, same class name. */
public final class ClientSetup {
    public static final KeyMapping OPEN = new KeyMapping(
            "key.agentoffice.open", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, "key.categories.agentoffice");

    /** config/agentoffice-client.properties: NeoForge's agentoffice-client.toml, without a config library. */
    private static final Path CONFIG = Platform.configDir().resolve(Ids.MOD_ID + "-client.properties");
    public static final Supplier<String> BASE_URL = ClientSetup::baseUrl;

    /** The Review Lectern: a vanilla lectern's textures, shaded lavender so it reads as Agent Office's. */
    private static final int LECTERN_TINT = 0xFFB4A2EC;

    private ClientSetup() {}

    /** Read on every ask, so an edit takes effect without a restart (asked only when looking for Agent Office). */
    private static String baseUrl() {
        Properties p = new Properties();
        try {
            if (Files.notExists(CONFIG)) {
                try (Writer w = Files.newBufferedWriter(CONFIG)) {
                    w.write("# Agent Office address, e.g. http://127.0.0.1:3000. Leave empty to find it automatically\n"
                            + "# (servers advertised in ~/.claude/agent-office/servers/, then port 3000). Only this machine is allowed.\n"
                            + "baseUrl=\n");
                }
            }
            try (Reader r = Files.newBufferedReader(CONFIG)) {
                p.load(r);
            }
        } catch (IOException e) {
            Ids.LOG.warn("Agent Office: can't read {}: {}", CONFIG, e.toString());
        }
        return p.getProperty("baseUrl", "").trim();
    }

    static void init() {
        TabletItem.openOnClient = ClientSetup::openOffice;
        ReviewLecternBlock.openOnClient = (pos, rebind) -> Lecterns.open(Minecraft.getInstance(), pos, rebind);
        AgentNet.onPlaced = Bodies::onPlaced;
        AgentNet.onStats = Bodies::onStats;
        AgentStatus.onUpdate(Bodies::report);
        KeyBindingHelper.registerKeyBinding(OPEN);
        // The Agent Spawn Egg: the villager egg's brown with lavender spots instead of tan.
        ColorProviderRegistry.ITEM.register((stack, tint) -> tint == 0 ? 0xFF563C33 : 0xFFB49BE0, AgentOfficeMod.AGENT_EGG.get());
        ColorProviderRegistry.ITEM.register((stack, tint) -> LECTERN_TINT, AgentOfficeMod.REVIEW_LECTERN_ITEM.get());
        ColorProviderRegistry.BLOCK.register((state, level, pos, tint) -> LECTERN_TINT, AgentOfficeMod.REVIEW_LECTERN.get());
        EntityRendererRegistry.register(AgentOfficeMod.AGENT.get(), AgentRenderer::new);
        MenuScreens.register(AgentOfficeMod.AGENT_MENU.get(), AgentInventoryScreen::new);
        ClientPlayNetworking.registerGlobalReceiver(Platform.channel(AgentPayloads.Placed.TYPE), (client, handler, buf, sender) -> {
            AgentPayloads.Placed m = AgentPayloads.Placed.CODEC.decode(buf);
            client.execute(() -> AgentNet.onPlaced.accept(m.bodies()));
        });
        ClientPlayNetworking.registerGlobalReceiver(Platform.channel(AgentPayloads.Stats.TYPE), (client, handler, buf, sender) -> {
            AgentPayloads.Stats m = AgentPayloads.Stats.CODEC.decode(buf);
            client.execute(() -> AgentNet.onStats.accept(m));
        });
        ClientTickEvents.END_CLIENT_TICK.register(ClientSetup::onClientTick);
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> Bodies.left());
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) ->
                level.isClientSide && entity instanceof AgentEntity body ? onInteract(body) : InteractionResult.PASS);
    }

    /**
     * Using an agent opens its chat here, without telling the server; sneak-using it goes to the server,
     * which opens its inventory ({@link AgentEntity#mobInteract}). Only its owner can do either. FAIL: Fabric
     * cancels the click, so no packet, no swing, and the held item isn't used either (CONSUME would send the packet).
     */
    private static InteractionResult onInteract(AgentEntity body) {
        Minecraft mc = Minecraft.getInstance();
        if (!body.isOwnedBy(mc.player)) {
            mc.gui.setOverlayMessage(Component.literal("That's another player's agent"), false);
            return InteractionResult.FAIL;
        }
        if (mc.player.isSecondaryUseActive() && !body.isShell()) return InteractionResult.PASS;
        AgentOffice.openWhenConnected(client -> {
            // A shell has no seat yet: it can only be set up, never chatted with.
            if (body.isShell()) return new AgentSetupScreen(client, body.getUUID());
            Api.Slot seat = Bodies.seatOf(body);
            if (seat != null) return new ChatScreen(null, client, seat);
            mc.gui.setOverlayMessage(Component.literal("This world hasn't told us which seat it is yet: try again"), false);
            return null;
        });
        return InteractionResult.FAIL;
    }

    /** The tablet's home screen; from the K key or using an Agent Tablet. */
    static void openOffice() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen == null) WorkspaceScreen.openHome(mc);
    }

    private static void onClientTick(Minecraft mc) {
        DevHooks.tick(mc);
        ImageCache.clearUnlessShowing(mc.screen);
        Bodies.tick(mc);
        AgentStatus.tick();
        while (OPEN.consumeClick()) {
            if (mc.screen == null) openOffice();
        }
    }
}
