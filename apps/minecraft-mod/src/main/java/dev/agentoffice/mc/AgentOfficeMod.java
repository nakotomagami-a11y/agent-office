package dev.agentoffice.mc;

import net.minecraft.core.registries.Registries;
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
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.common.extensions.IMenuTypeExtension;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.entity.living.LivingUseTotemEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.entity.player.PlayerInteractEvent;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Both sides: the items, the lectern and the agent entity are registered wherever the world runs (singleplayer
 * and LAN: this jar's integrated server; a dedicated server needs the jar). Client code starts in
 * {@code client.AgentOfficeClientMod}.
 */
@Mod(AgentOfficeMod.MOD_ID)
public final class AgentOfficeMod {
    public static final String MOD_ID = "agentoffice";

    private static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MOD_ID);
    private static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MOD_ID);
    private static final DeferredRegister<EntityType<?>> ENTITIES = DeferredRegister.create(Registries.ENTITY_TYPE, MOD_ID);
    private static final DeferredRegister<MenuType<?>> MENUS = DeferredRegister.create(Registries.MENU, MOD_ID);

    /** A lectern's wood, sound and strength. */
    public static final DeferredBlock<ReviewLecternBlock> REVIEW_LECTERN =
            BLOCKS.register("review_lectern", () -> new ReviewLecternBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.LECTERN)));
    public static final DeferredItem<BlockItem> REVIEW_LECTERN_ITEM = ITEMS.registerSimpleBlockItem(REVIEW_LECTERN);
    public static final DeferredItem<TabletItem> TABLET =
            ITEMS.registerItem("tablet", TabletItem::new, new Item.Properties().stacksTo(1));
    public static final DeferredItem<AgentEggItem> AGENT_EGG =
            ITEMS.registerItem("agent_spawn_egg", AgentEggItem::new, new Item.Properties());
    /** A player's size and eye height, so worn armor and held items sit where they do on a player. */
    public static final DeferredHolder<EntityType<?>, EntityType<AgentEntity>> AGENT = ENTITIES.register("agent",
            () -> EntityType.Builder.<AgentEntity>of(AgentEntity::new, MobCategory.MISC).sized(0.6f, 1.8f).eyeHeight(1.62f)
                    .clientTrackingRange(10).build("agent"));
    public static final DeferredHolder<MenuType<?>, MenuType<AgentMenu>> AGENT_MENU =
            MENUS.register("agent_inventory", () -> IMenuTypeExtension.create(AgentMenu::fromNetwork));

    public AgentOfficeMod(IEventBus modBus) {
        BLOCKS.register(modBus);
        ITEMS.register(modBus);
        ENTITIES.register(modBus);
        MENUS.register(modBus);
        modBus.addListener(AgentOfficeMod::addToCreativeTab);
        modBus.addListener(AgentNet::register);
        modBus.addListener((EntityAttributeCreationEvent e) -> e.put(AGENT.get(), AgentEntity.attributes().build()));
        NeoForge.EVENT_BUS.addListener((PlayerEvent.PlayerLoggedInEvent e) -> {
            if (e.getEntity() instanceof ServerPlayer p) AgentNet.sendPlaced(p);
        });
        NeoForge.EVENT_BUS.addListener((PlayerEvent.PlayerLoggedOutEvent e) -> {
            if (e.getEntity() instanceof ServerPlayer p) AgentNet.loggedOut(p);
        });
        NeoForge.EVENT_BUS.addListener((ServerStoppedEvent e) -> AgentNet.serverStopped());
        // Before vanilla's own handling (name tags, leads), which a modified client could reach on anyone's agent;
        // the owner's sneak-use (its inventory) is the one use the server acts on.
        NeoForge.EVENT_BUS.addListener((PlayerInteractEvent.EntityInteract e) -> {
            if (e.getTarget() instanceof AgentEntity agent
                    && (!(agent.isOwnedBy(e.getEntity()) && e.getEntity().isSecondaryUseActive() && !agent.isShell())
                    || e.getItemStack().is(Items.NAME_TAG) || e.getItemStack().is(Items.LEAD))) {
                e.setCanceled(true);
                e.setCancellationResult(InteractionResult.FAIL);
            }
        });
        // Only armor and weapons count for an agent: a totem in its hand is just something it holds.
        NeoForge.EVENT_BUS.addListener((LivingUseTotemEvent e) -> {
            if (e.getEntity() instanceof AgentEntity) e.setCanceled(true);
        });
    }

    private static void addToCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) event.accept(TABLET);
        if (event.getTabKey() == CreativeModeTabs.SPAWN_EGGS) event.accept(AGENT_EGG);
        if (event.getTabKey() == CreativeModeTabs.FUNCTIONAL_BLOCKS) event.accept(REVIEW_LECTERN_ITEM);
    }
}
