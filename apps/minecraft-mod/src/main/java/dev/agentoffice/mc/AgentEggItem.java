package dev.agentoffice.mc;

import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Agent Spawn Egg: used on a block, an unassigned agent shell stands there (placed like a vanilla
 * spawn egg places its mob). The shell is client-side, reached through a hook; the server half only
 * uses up the egg outside creative.
 */
public final class AgentEggItem extends Item {
    /** Set by the client setup; the item class must not reference client classes itself. */
    public static Consumer<Vec3> placeShellOnClient = at -> { };

    public AgentEggItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Level level = context.getLevel();
        BlockPos clicked = context.getClickedPos();
        VoxelShape shape = level.getBlockState(clicked).getCollisionShape(level, clicked);
        Vec3 at;
        if (shape.isEmpty()) {
            // Same rule as SpawnEggItem: into a block without collision (grass) ...
            at = Vec3.atBottomCenterOf(clicked);
        } else if (context.getClickedFace() == Direction.UP) {
            // ... on top of what was clicked, standing on its real top (a slab's half, a fence's 1.5) ...
            at = new Vec3(clicked.getX() + 0.5, clicked.getY() + shape.max(Direction.Axis.Y), clicked.getZ() + 0.5);
        } else {
            // ... else next to the clicked face.
            at = Vec3.atBottomCenterOf(clicked.relative(context.getClickedFace()));
        }
        if (level.isClientSide) {
            placeShellOnClient.accept(at);
        } else {
            // Vanilla shrinks unconditionally too; creative puts the count back itself.
            context.getItemInHand().shrink(1);
        }
        return InteractionResult.sidedSuccess(level.isClientSide);
    }
}
