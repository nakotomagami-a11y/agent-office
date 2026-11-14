package dev.agentoffice.mc;

import dev.agentoffice.mc.AgentPayloads.AssignShell;
import dev.agentoffice.mc.AgentPayloads.Dismiss;
import dev.agentoffice.mc.AgentPayloads.Place;
import dev.agentoffice.mc.AgentPayloads.Placed;
import dev.agentoffice.mc.AgentPayloads.RemoveShell;
import dev.agentoffice.mc.AgentPayloads.Retarget;
import dev.agentoffice.mc.AgentPayloads.Status;
import dev.agentoffice.mc.ai.Combat;
import dev.agentoffice.mc.compat.CustomPacketPayload;
import dev.agentoffice.mc.compat.StreamCodec;
import dev.agentoffice.mc.core.Ids;
import io.netty.buffer.ByteBuf;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;
import java.util.function.Supplier;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.networking.v1.EntityTrackingEvents;
import net.fabricmc.fabric.api.networking.v1.S2CPlayChannelEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.fabricmc.fabric.api.screenhandler.v1.ExtendedScreenHandlerType;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Both sides, Fabric: the items, the lectern and the agent entity are registered wherever the world runs (singleplayer
 * and LAN: this jar's integrated server; a dedicated server needs the jar). Client code starts in
 * {@code client.AgentOfficeClientMod}. NeoForge's counterpart is src/neoforge's AgentOfficeMod.
 */
public final class AgentOfficeMod implements ModInitializer {
    public static final String MOD_ID = Ids.MOD_ID;

    private static ResourceLocation id(String path) {
        return new ResourceLocation(MOD_ID, path);
    }

    private static <T> T register(Registry<? super T> registry, String path, T value) {
        Registry.register(registry, id(path), value);
        return value;
    }

    /** A lectern's wood, sound and strength. */
    private static final ReviewLecternBlock LECTERN = register(BuiltInRegistries.BLOCK, "review_lectern",
            new ReviewLecternBlock(BlockBehaviour.Properties.copy(Blocks.LECTERN)));
    private static final BlockItem LECTERN_ITEM = register(BuiltInRegistries.ITEM, "review_lectern", new BlockItem(LECTERN, new Item.Properties()));
    private static final TabletItem TABLET_ITEM = register(BuiltInRegistries.ITEM, "tablet", new TabletItem(new Item.Properties().stacksTo(1)));
    private static final AgentEggItem EGG = register(BuiltInRegistries.ITEM, "agent_spawn_egg", new AgentEggItem(new Item.Properties()));
    /** A player's size; its eye height is AgentEntity's (1.20.1's builder has none). */
    private static final EntityType<AgentEntity> AGENT_TYPE = register(BuiltInRegistries.ENTITY_TYPE, "agent",
            EntityType.Builder.<AgentEntity>of(AgentEntity::new, MobCategory.MISC).sized(0.6f, 1.8f).clientTrackingRange(10).build("agent"));
    private static final MenuType<AgentMenu> MENU = register(BuiltInRegistries.MENU, "agent_inventory",
            new ExtendedScreenHandlerType<>(AgentMenu::fromNetwork));

    public static final Supplier<ReviewLecternBlock> REVIEW_LECTERN = () -> LECTERN;
    public static final Supplier<BlockItem> REVIEW_LECTERN_ITEM = () -> LECTERN_ITEM;
    public static final Supplier<TabletItem> TABLET = () -> TABLET_ITEM;
    public static final Supplier<AgentEggItem> AGENT_EGG = () -> EGG;
    public static final Supplier<EntityType<AgentEntity>> AGENT = () -> AGENT_TYPE;
    public static final Supplier<MenuType<AgentMenu>> AGENT_MENU = () -> MENU;

    /** Players whose client just registered the mod's channels (any thread), to be told their agents next tick. */
    private static final Set<UUID> LISTENING = ConcurrentHashMap.newKeySet();
    /** Farther than any client tracks an agent (its tracking range is 10 chunks). */
    private static final double TRACKED = 16 * 12;

    @Override
    public void onInitialize() {
        FabricDefaultAttributeRegistry.register(AGENT_TYPE, AgentEntity.attributes());
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(e -> e.accept(TABLET_ITEM));
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.SPAWN_EGGS).register(e -> e.accept(EGG));
        ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.FUNCTIONAL_BLOCKS).register(e -> e.accept(LECTERN_ITEM));

        // Payloads, on versioned channels (Platform.channel). No Migrate: no Fabric client predates 0.8.0.
        toServer(Place.TYPE, Place.CODEC, AgentNet::place);
        toServer(Retarget.TYPE, Retarget.CODEC, (p, m) -> AgentNet.retarget(p, m.seat()));
        toServer(Dismiss.TYPE, Dismiss.CODEC, (p, m) -> AgentNet.dismiss(p, m.seat()));
        toServer(AssignShell.TYPE, AssignShell.CODEC, AgentNet::assignShell);
        toServer(RemoveShell.TYPE, RemoveShell.CODEC, (p, m) -> AgentNet.removeShell(p, m.shell()));
        toServer(Status.TYPE, Status.CODEC, (p, m) -> AgentNet.status(p, m.bodies()));
        Platform.codec(Placed.TYPE, Placed.CODEC);
        Platform.codec(AgentPayloads.Stats.TYPE, AgentPayloads.Stats.CODEC);

        // Its list (and its agents' levels) go out once the client says it listens: at join its channels aren't known
        // yet, and the register itself can arrive mid-join (singleplayer), before anything can be sent. So: next tick.
        S2CPlayChannelEvents.REGISTER.register((handler, sender, server, channels) -> {
            if (channels.contains(Platform.channel(Placed.TYPE))) LISTENING.add(handler.player.getUUID());
        });
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            for (UUID id : List.copyOf(LISTENING)) {
                LISTENING.remove(id);
                ServerPlayer p = server.getPlayerList().getPlayer(id);
                if (p == null) continue;
                AgentNet.sendPlaced(p);
                for (AgentEntity agent : p.serverLevel().getEntitiesOfClass(AgentEntity.class, p.getBoundingBox().inflate(TRACKED))) {
                    if (agent.isOwnedBy(p)) agent.sendStats();
                }
            }
        });
        ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> AgentNet.loggedOut(handler.player));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> AgentNet.serverStopped());
        // Its owner coming into range (or logging in near it) learns its level.
        EntityTrackingEvents.START_TRACKING.register((entity, player) -> {
            if (entity instanceof AgentEntity agent && agent.isOwnedBy(player)) agent.sendStats();
        });
        // Before vanilla's own handling (name tags, leads), which a modified client could reach on anyone's agent;
        // the owner's sneak-use (its inventory) is the one use the server acts on. The client's side: ClientSetup.
        UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
            if (level.isClientSide || !(entity instanceof AgentEntity agent)) return InteractionResult.PASS;
            boolean ownerOpens = agent.isOwnedBy(player) && player.isSecondaryUseActive() && !agent.isShell();
            var held = player.getItemInHand(hand);
            return !ownerOpens || held.is(Items.NAME_TAG) || held.is(Items.LEAD) ? InteractionResult.FAIL : InteractionResult.PASS;
        });

        ServerLivingEntityEvents.ALLOW_DAMAGE.register((entity, source, amount) -> !Combat.blocksDamage(source, entity));
        ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> Combat.died(source, entity));
        // Projectiles and totems: mixin/ProjectileMixin, mixin/LivingEntityMixin.
    }

    /** Decoded on the network thread (a bad one disconnects the sender), handled on the server thread as its player now. */
    private static <T extends CustomPacketPayload> void toServer(CustomPacketPayload.Type<T> type, StreamCodec<ByteBuf, T> codec,
            BiConsumer<ServerPlayer, T> handler) {
        Platform.codec(type, codec);
        ServerPlayNetworking.registerGlobalReceiver(Platform.channel(type), (server, player, listener, buf, sender) -> {
            T payload = codec.decode(buf);
            server.execute(() -> handler.accept(listener.player, payload));
        });
    }
}
