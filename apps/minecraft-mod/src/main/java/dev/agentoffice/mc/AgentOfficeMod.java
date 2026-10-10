package dev.agentoffice.mc;

import dev.agentoffice.mc.client.ClientSetup;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Client dist only. The tablet is a real item, so it exists where the server runs this jar too:
 * singleplayer / LAN (the integrated server shares this JVM's registries). A dedicated server never loads a
 * Dist.CLIENT mod, so the item needs a server dist first; until then it is singleplayer / LAN only.
 * Anywhere else the client's extra item is dropped from the id map without a disconnect
 * (NeoForge RegistryManager.applySnapshot); the K key still opens Agent Office there.
 */
@Mod(value = AgentOfficeMod.MOD_ID, dist = Dist.CLIENT)
public final class AgentOfficeMod {
    public static final String MOD_ID = "agentoffice";

    private static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MOD_ID);
    private static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MOD_ID);
    /** A lectern's wood, sound and strength; same singleplayer / LAN limit as the items. */
    public static final DeferredBlock<ReviewLecternBlock> REVIEW_LECTERN =
            BLOCKS.register("review_lectern", () -> new ReviewLecternBlock(BlockBehaviour.Properties.ofFullCopy(Blocks.LECTERN)));
    public static final DeferredItem<BlockItem> REVIEW_LECTERN_ITEM = ITEMS.registerSimpleBlockItem(REVIEW_LECTERN);
    public static final DeferredItem<TabletItem> TABLET =
            ITEMS.registerItem("tablet", TabletItem::new, new Item.Properties().stacksTo(1));
    public static final DeferredItem<AgentEggItem> AGENT_EGG =
            ITEMS.registerItem("agent_spawn_egg", AgentEggItem::new, new Item.Properties());

    public AgentOfficeMod(IEventBus modBus, ModContainer container) {
        BLOCKS.register(modBus);
        ITEMS.register(modBus);
        modBus.addListener(AgentOfficeMod::addToCreativeTab);
        ClientSetup.init(modBus, container);
    }

    private static void addToCreativeTab(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) event.accept(TABLET);
        if (event.getTabKey() == CreativeModeTabs.SPAWN_EGGS) event.accept(AGENT_EGG);
        if (event.getTabKey() == CreativeModeTabs.FUNCTIONAL_BLOCKS) event.accept(REVIEW_LECTERN_ITEM);
    }
}
