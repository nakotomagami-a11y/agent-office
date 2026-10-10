package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.core.NonNullList;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.StringUtil;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;

import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.Vec3;

/**
 * An agent's body in the world: a real entity the world saves, standing in for one agent of one project
 * (see {@link AgentRecords}). A shell, from an Agent Spawn Egg, has no seat yet and no items.
 *
 * Its equipment counts like a player's (armor and weapon attributes, enchantments): that is vanilla
 * equipment. Everything else it holds, the main inventory and the Curios slots, is storage and looks only.
 */
public final class AgentEntity extends PathfinderMob {
    private static final EntityDataAccessor<String> AGENT = SynchedEntityData.defineId(AgentEntity.class, EntityDataSerializers.STRING);
    private static final EntityDataAccessor<Optional<UUID>> OWNER = SynchedEntityData.defineId(AgentEntity.class, EntityDataSerializers.OPTIONAL_UUID);
    /** What its Curios slots hold, for drawing only. */
    private static final EntityDataAccessor<CompoundTag> CURIOS = SynchedEntityData.defineId(AgentEntity.class, EntityDataSerializers.COMPOUND_TAG);

    private static final Component SHELL_NAME = Component.literal("Unassigned agent").withStyle(ChatFormatting.GRAY)
            .append(Component.literal("  right-click to set up").withStyle(ChatFormatting.YELLOW));

    /** Server only: where its items live; null until bound on its first tick. */
    private AgentRecords.Record record;
    private Api.Slot seat;
    private Map<String, List<ItemStack>> curiosShown = Map.of();

    public AgentEntity(EntityType<? extends AgentEntity> type, Level level) {
        super(type, level);
        setInvulnerable(true);
        setPersistenceRequired();
        setCustomNameVisible(true);
        // Its record drops everything on death; the vanilla chance-based equipment drop would duplicate it.
        for (EquipmentSlot s : EquipmentSlot.values()) setDropChance(s, 0f);
    }

    public static AttributeSupplier.Builder attributes() {
        // Player values, so armor and weapons give an agent the same numbers they give a player.
        return PathfinderMob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 20)
                .add(Attributes.MOVEMENT_SPEED, 0.1)
                .add(Attributes.ATTACK_DAMAGE, 1)
                .add(Attributes.ATTACK_SPEED, 4);
    }

    static AgentEntity spawn(ServerLevel level, Vec3 at, float yaw, UUID owner, Api.Slot seat) {
        AgentEntity body = new AgentEntity(AgentOfficeMod.AGENT.get(), level);
        body.moveTo(at.x, at.y, at.z, yaw, 0);
        body.setYHeadRot(yaw);
        body.setYBodyRot(yaw);
        body.entityData.set(OWNER, Optional.of(owner));
        body.setSeat(seat);
        return level.addFreshEntity(body) ? body : null;
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(AGENT, "");
        builder.define(OWNER, Optional.empty());
        builder.define(CURIOS, new CompoundTag());
    }

    @Override
    protected void registerGoals() {
        goalSelector.addGoal(1, new LookAtPlayerGoal(this, Player.class, 10f, 1f));
    }

    /** Server only (clients get the agent's name, and its owner the seat, from AgentNet.Placed). Null for a shell. */
    public Api.Slot seat() {
        return seat;
    }

    /** Which agent it is, on both sides: its skin. Empty for a shell. */
    public String agentId() {
        return entityData.get(AGENT);
    }

    public boolean isShell() {
        return agentId().isEmpty();
    }

    public boolean isOwnedBy(Player player) {
        return entityData.get(OWNER).map(player.getUUID()::equals).orElse(false);
    }

    public Optional<UUID> owner() {
        return entityData.get(OWNER);
    }

    void setSeat(Api.Slot seat) {
        this.seat = seat;
        entityData.set(AGENT, seat == null ? "" : seat.agentId());
        // Every player near it sees the name: a label is the owner's text, so no formatting or control codes.
        setCustomName(seat == null ? SHELL_NAME : Component.literal(StringUtil.filterText(seat.displayName())).withStyle(ChatFormatting.WHITE));
    }

    /** Client: what each Curios slot shows. */
    public Map<String, List<ItemStack>> curiosShown() {
        return curiosShown;
    }

    @Override
    public void onSyncedDataUpdated(EntityDataAccessor<?> key) {
        super.onSyncedDataUpdated(key);
        if (CURIOS.equals(key) && level().isClientSide) {
            CompoundTag all = entityData.get(CURIOS);
            Map<String, List<ItemStack>> shown = new LinkedHashMap<>();
            for (String id : all.getAllKeys()) {
                CompoundTag t = all.getCompound(id);
                var stacks = NonNullList.withSize(Mth.clamp(t.getInt("Size"), 0, 64), ItemStack.EMPTY);
                ContainerHelper.loadAllItems(t, stacks, registryAccess());
                shown.put(id, new ArrayList<>(stacks));
            }
            curiosShown = shown;
        }
    }

    AgentRecords.Record record() {
        return record;
    }

    @Override
    public void tick() {
        if (!level().isClientSide && seat != null && record == null && !bind()) return;
        super.tick();
    }

    /** Takes its items from its record, or discards itself if it is no longer its agent's body. */
    private boolean bind() {
        AgentRecords.Record r = owner().map(o -> AgentRecords.get(getServer()).find(o, seat)).orElse(null);
        if (r == null || !getUUID().equals(r.entity)) {
            // Moved, dismissed or replaced while this chunk was unloaded: its items are in the record already.
            discard();
            return false;
        }
        record = r;
        for (EquipmentSlot s : EquipmentSlot.values()) {
            int i = index(s);
            if (i >= 0) super.setItemSlot(s, r.items.get(i));
        }
        if (!r.seat.equals(seat)) setSeat(r.seat);
        curiosChanged();
        return true;
    }

    /** Its Inventory index for an equipment slot, or -1. */
    static int index(EquipmentSlot slot) {
        return switch (slot) {
            case MAINHAND -> 0;
            case OFFHAND -> 40;
            case FEET, LEGS, CHEST, HEAD -> 36 + slot.getIndex();
            default -> -1;
        };
    }

    /** Equipment is the record's stacks themselves, so a hit's durability loss lands in the record too. */
    @Override
    public void setItemSlot(EquipmentSlot slot, ItemStack stack) {
        super.setItemSlot(slot, stack);
        int i = index(slot);
        if (record != null && i >= 0) record.items.set(i, stack);
    }

    void curiosChanged() {
        if (record == null) return;
        CompoundTag all = new CompoundTag();
        record.curios.forEach((id, stacks) -> {
            CompoundTag t = ContainerHelper.saveAllItems(new CompoundTag(), stacks, registryAccess());
            t.putInt("Size", stacks.size());
            all.put(id, t);
        });
        entityData.set(CURIOS, all);
    }

    /** Sneak + use: its inventory, for its owner. A plain use opens its chat on the owner's client (ClientSetup). */
    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (hand != InteractionHand.MAIN_HAND || !player.isSecondaryUseActive() || isShell() || !isOwnedBy(player)) return InteractionResult.PASS;
        if (player instanceof ServerPlayer sp && record != null) AgentMenu.open(sp, this);
        return InteractionResult.sidedSuccess(level().isClientSide);
    }

    /**
     * It can only die past its invulnerability (/kill, the void, often someone else's doing): its items stay in
     * its record, and its owner's next Place brings the body back with them.
     */
    @Override
    protected void dropEquipment() {
        // Vanilla's spot for a death that went through (no mod cancelled it), whatever doMobLoot says.
        if (record == null) return;
        for (EquipmentSlot s : EquipmentSlot.values()) super.setItemSlot(s, ItemStack.EMPTY);
        record.entity = null;
        record = null;
        owner().map(getServer().getPlayerList()::getPlayer).ifPresent(AgentNet::sendPlaced);
    }

    // Only its owner moves it (Place), until agents walk: no leads, pistons, currents, blasts, knockback or rods.
    @Override
    public boolean ignoreExplosion(Explosion explosion) {
        return true;
    }

    @Override
    public void knockback(double strength, double x, double z) {}

    @Override
    public void setDeltaMovement(Vec3 motion) {
        super.setDeltaMovement(new Vec3(0, Math.min(motion.y, 0), 0)); // it can still fall, never be lifted
    }

    @Override
    public boolean canBeLeashed() {
        return false;
    }

    @Override
    public PushReaction getPistonPushReaction() {
        return PushReaction.IGNORE;
    }

    @Override
    public boolean isPushedByFluid() {
        return false;
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.put("Seat", AgentRecords.seatTag(seat));
        owner().ifPresent(o -> tag.putUUID("Owner", o));
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        if (tag.hasUUID("Owner")) entityData.set(OWNER, Optional.of(tag.getUUID("Owner")));
        setSeat(AgentRecords.seat(tag.getCompound("Seat")));
    }

    @Override
    public boolean removeWhenFarAway(double distanceToClosestPlayer) {
        return false;
    }

    // Stands where it was put until agents can walk.
    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    public void push(Entity entity) {}

    @Override
    protected void doPush(Entity entity) {}

    public static float yawTowards(Vec3 from, Vec3 to) {
        return (float) (Mth.atan2(to.z - from.z, to.x - from.x) * Mth.RAD_TO_DEG) - 90f;
    }
}
