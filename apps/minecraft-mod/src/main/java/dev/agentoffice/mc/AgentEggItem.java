package dev.agentoffice.mc;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Agent Spawn Egg: used on a block, an unassigned agent shell, owned by whoever used it, stands there
 * (placed like a vanilla spawn egg places its mob), facing them.
 */
public final class AgentEggItem extends Item {
    public AgentEggItem(Properties properties) {
        super(properties);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        Player player = context.getPlayer();
        if (player == null) return InteractionResult.PASS;
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
        if (level instanceof ServerLevel server) {
            // Used up only by a shell that stands (another mod may refuse the spawn); creative puts the count back itself.
            if (AgentEntity.spawn(server, at, AgentEntity.yawTowards(at, player.position()), player.getUUID(), null) != null) {
                context.getItemInHand().shrink(1);
            }
        }
        return InteractionResult.sidedSuccess(level.isClientSide);
    }
}
