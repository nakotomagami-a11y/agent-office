package dev.agentoffice.mc;

import com.mojang.serialization.MapCodec;
import java.util.function.BiConsumer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.LecternBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The Review Lectern: a lectern-shaped block you use to review a project's pull requests
 * (docs/minecraft-review-lectern.md). No block entity: which project it shows is client-side
 * state, so using it only ever opens a screen. Sneak-use with empty hands picks the project again
 * (vanilla sends a sneaking use with anything in either hand to the item instead).
 */
public final class ReviewLecternBlock extends HorizontalDirectionalBlock {
    public static final MapCodec<ReviewLecternBlock> CODEC = simpleCodec(ReviewLecternBlock::new);

    /** Set by the client setup (position, sneaking); the block class must not reference client classes itself. */
    public static BiConsumer<BlockPos, Boolean> openOnClient = (pos, rebind) -> { };

    public ReviewLecternBlock(Properties properties) {
        super(properties);
        registerDefaultState(stateDefinition.any().setValue(FACING, net.minecraft.core.Direction.NORTH));
    }

    @Override
    protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
        return CODEC;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(FACING);
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext context) {
        return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return switch (state.getValue(FACING)) {
            case NORTH -> LecternBlock.SHAPE_NORTH;
            case SOUTH -> LecternBlock.SHAPE_SOUTH;
            case EAST -> LecternBlock.SHAPE_EAST;
            case WEST -> LecternBlock.SHAPE_WEST;
            default -> LecternBlock.SHAPE_COMMON;
        };
    }

    @Override
    protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return LecternBlock.SHAPE_COLLISION;
    }

    @Override
    protected VoxelShape getOcclusionShape(BlockState state, BlockGetter level, BlockPos pos) {
        return LecternBlock.SHAPE_COMMON;
    }

    @Override
    protected boolean useShapeForLightOcclusion(BlockState state) {
        return true;
    }

    /** As the vanilla lectern: mobs don't plan paths through it. */
    @Override
    protected boolean isPathfindable(BlockState state, net.minecraft.world.level.pathfinder.PathComputationType type) {
        return false;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (level.isClientSide) openOnClient.accept(pos, player.isShiftKeyDown());
        return InteractionResult.sidedSuccess(level.isClientSide);
    }
}
