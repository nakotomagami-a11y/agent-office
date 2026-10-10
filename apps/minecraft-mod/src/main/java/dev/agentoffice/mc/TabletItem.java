package dev.agentoffice.mc;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** The Agent Tablet: use it to open Agent Office. The screen itself is client code, reached through a hook. */
public final class TabletItem extends Item {
    /** Set by the client setup; the item class must not reference client classes itself. */
    public static Runnable openOnClient = () -> { };

    public TabletItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        if (level.isClientSide) openOnClient.run();
        return InteractionResultHolder.sidedSuccess(player.getItemInHand(hand), level.isClientSide);
    }
}
