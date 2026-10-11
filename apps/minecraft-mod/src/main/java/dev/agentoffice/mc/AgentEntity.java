package dev.agentoffice.mc;

import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.Api;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.NonNullList;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.util.Mth;
import net.minecraft.util.StringUtil;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.OpenDoorGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.entity.ai.village.poi.PoiManager;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.entity.animal.IronGolem;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.npc.AbstractVillager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.Vec3;

/**
 * An agent's body in the world: a real entity the world saves, standing in for one agent of one project
 * (see {@link AgentRecords}). A shell, from an Agent Spawn Egg, has no seat yet and no items.
 *
 * Its equipment counts like a player's (armor and weapon attributes, enchantments): that is vanilla
 * equipment. Everything else it holds, the main inventory and the Curios slots, is storage and looks only.
 *
 * It lives like a villager ({@link AgentGoals}): at its project's lectern while its agent works in Agent Office,
 * at the village bell at meeting time, otherwise about the village or where it was put; and it fights monsters
 * nearby, working or not. Mobs can hurt it, players can't.
 */
public final class AgentEntity extends PathfinderMob implements RangedAttackMob {
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

    /** How long a "working" from its owner's client holds: the client says it every 5 s while it can. */
    private static final int WORK_REPORT_TICKS = 600;
    private static final double SPEED = 0.35;
    /** How far it looks for monsters to fight. */
    private static final double FOLLOW = 24;
    /** Server only. Where it was put: what it keeps near when there is no village. */
    private BlockPos home;
    /** Server only: its lectern while its owner's client says it works; until when that holds (game time). */
    private BlockPos workplace;
    private long workingUntil;
    private BlockPos bell;
    private int nextBellLookup;
    /** Game time of the last damage that went through: it mends once out of harm's way. */
    private long lastHurtAt;

    public AgentEntity(EntityType<? extends AgentEntity> type, Level level) {
        super(type, level);
        setPersistenceRequired();
        if (getNavigation() instanceof GroundPathNavigation ground) ground.setCanOpenDoors(true);
        setCustomNameVisible(true);
        // Its record drops everything on death; the vanilla chance-based equipment drop would duplicate it.
        for (EquipmentSlot s : EquipmentSlot.values()) setDropChance(s, 0f);
    }

    public static AttributeSupplier.Builder attributes() {
        // Player values, so armor and weapons give an agent the same numbers they give a player. Its walking pace
        // is a mob's (a player's 0.1 is a different scale): a stroll like a villager's, a run that catches a zombie.
        return PathfinderMob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 20)
                .add(Attributes.MOVEMENT_SPEED, SPEED)
                .add(Attributes.FOLLOW_RANGE, FOLLOW)
                .add(Attributes.ATTACK_DAMAGE, 1)
                .add(Attributes.ATTACK_SPEED, 4);
    }

    static AgentEntity spawn(ServerLevel level, Vec3 at, float yaw, UUID owner, Api.Slot seat) {
        AgentEntity body = new AgentEntity(AgentOfficeMod.AGENT.get(), level);
        body.moveTo(at.x, at.y, at.z, yaw, 0);
        body.setYHeadRot(yaw);
        body.setYBodyRot(yaw);
        body.entityData.set(OWNER, Optional.of(owner));
        body.home = BlockPos.containing(at);
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
        goalSelector.addGoal(0, new FloatGoal(this));
        goalSelector.addGoal(1, new AgentGoals.Bow(this));
        goalSelector.addGoal(1, new AgentGoals.Melee(this));
        goalSelector.addGoal(2, new OpenDoorGoal(this, true));
        goalSelector.addGoal(3, new AgentGoals.Wander(this));
        goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8f));
        goalSelector.addGoal(8, new RandomLookAroundGoal(this));
        // Hit back (never at a village's own), and the agents around it come too; any monster it can reach is a target.
        targetSelector.addGoal(1, new HurtByTargetGoal(this, Player.class, AbstractVillager.class, IronGolem.class).setAlertOthers());
        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Mob.class, 5, true, true, e -> AgentGoals.threat(this, e)));
    }

    /** A shell stands still and keeps out of fights until it is set up. */
    @Override
    public void setTarget(LivingEntity target) {
        super.setTarget(isShell() ? null : target);
    }

    /** Server: its owner's client reports whether its agent works, and at which lectern (already checked). */
    void reportWork(boolean working, BlockPos lectern) {
        workplace = working ? lectern : null;
        workingUntil = working ? level().getGameTime() + WORK_REPORT_TICKS : 0;
    }

    boolean isWorking() {
        return workplace != null && level().getGameTime() < workingUntil;
    }

    /** Server: one line for the dev watch log (DevHooks -PaoWatch). */
    public String debugState() {
        AgentGoals.Anchor a = anchor();
        return String.format("%s at %d,%d,%d hp=%.0f hand=%s target=%s working=%s anchor=%s", agentId().isEmpty() ? "shell" : agentId(),
                getBlockX(), getBlockY(), getBlockZ(), getHealth(), getMainHandItem().getItem(), getTarget() == null ? "-" : getTarget().getType().toShortString(),
                isWorking(), a == null ? "-" : a.pos().toShortString() + " r" + a.radius());
    }

    /** What it keeps near now (see AgentGoals); a shell keeps to its spot. */
    AgentGoals.Anchor anchor() {
        if (home == null) return null;
        if (isShell()) return new AgentGoals.Anchor(home, 1, Integer.MAX_VALUE);
        if (isWorking()) return new AgentGoals.Anchor(workplace, 3, 200);
        BlockPos villageBell = bell();
        if (villageBell == null) return new AgentGoals.Anchor(home, 12, 60);
        // Villagers meet at the bell in the afternoon (their schedule's MEET, 9000-11000).
        long time = level().getDayTime() % 24000;
        return time >= 9000 && time < 11000 ? new AgentGoals.Anchor(villageBell, 5, 80) : new AgentGoals.Anchor(villageBell, 32, 60);
    }

    /**
     * The village it belongs to: the nearest bell to where it was put. Looked up only while every chunk in reach is
     * loaded (a POI search into unloaded chunks reads them from disk on the server thread), and kept while it stands.
     */
    private BlockPos bell() {
        if (tickCount < nextBellLookup || !(level() instanceof ServerLevel server)) return bell;
        nextBellLookup = tickCount + 200;
        if (bell != null && server.isLoaded(bell) && server.getBlockState(bell).is(Blocks.BELL)) return bell;
        // The search scans 48 / 16 + 1 chunks around home's.
        ChunkPos center = new ChunkPos(home);
        if (ChunkPos.rangeClosed(center, 4).allMatch(c -> server.hasChunk(c.x, c.z))) {
            bell = server.getPoiManager().findClosest(p -> p.is(PoiTypes.MEETING), home, 48, PoiManager.Occupancy.ANY).orElse(null);
        }
        return bell;
    }

    @Override
    protected void customServerAiStep() {
        super.customServerAiStep();
        if (home == null) home = blockPosition(); // placed before agents could walk
        // Mends out of harm's way, like a player with a full food bar, only slower.
        if (tickCount % 40 == 0 && getHealth() < getMaxHealth() && level().getGameTime() - lastHurtAt > 200) heal(1);
        dropFarOrFairTarget();
        if (isWorking() && getTarget() == null && getNavigation().isDone() && distanceToSqr(Vec3.atCenterOf(workplace)) < 16) {
            getLookControl().setLookAt(Vec3.atCenterOf(workplace));
        }
    }

    /**
     * Target goals only check a target when they pick it: one that retreats (a sniping skeleton), or one it can't
     * hurt (a goat that rammed it), would draw it on forever. It defends its place.
     */
    private void dropFarOrFairTarget() {
        LivingEntity target = getTarget();
        if (target == null) return;
        AgentGoals.Anchor a = anchor();
        boolean far = a != null && !target.blockPosition().closerThan(a.pos(), a.radius() + AgentGoals.CHASE_BEYOND + 8);
        if (far || !AgentGoals.foe(this, target)) setTarget(null);
    }

    @Override
    protected void actuallyHurt(DamageSource source, float amount) {
        super.actuallyHurt(source, amount);
        lastHurtAt = level().getGameTime();
    }

    /**
     * Only what fights it can hurt it: a hostile mob (its blows, arrows, fireballs, a creeper's blast), and a fall.
     * Nothing a player does (their hits and arrows, pets, TNT, lava, anvils), other agents, or the world itself.
     */
    @Override
    public boolean isInvulnerableTo(DamageSource source) {
        if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) return super.isInvulnerableTo(source);
        if (isShell()) return true;
        // A fall only right after a mob's hit: a player could pull the floor away or launch it with a mace.
        boolean mobFall = source.is(DamageTypeTags.IS_FALL) && AgentGoals.hostile(getLastHurtByMob()) && tickCount - getLastHurtByMobTimestamp() < 20;
        return !(mobFall || AgentGoals.hostile(source.getEntity()));
    }

    @Override
    public boolean ignoreExplosion(Explosion explosion) {
        return !AgentGoals.hostile(explosion.getIndirectSourceEntity());
    }

    @Override
    public void performRangedAttack(LivingEntity target, float power) {
        AgentGoals.shoot(this, target, power);
    }

    /** It fights where it stands: no fall a careful villager wouldn't take, even mid-chase. */
    @Override
    public int getMaxFallDistance() {
        return 3;
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
        // The server can't ask Agent Office for the agent's name: its label, else its id made readable, until the
        // owner's client says the name (showName). The same whoever hosts the world.
        boolean labelled = seat != null && seat.label() != null && !seat.label().isBlank();
        setCustomName(seat == null ? SHELL_NAME : plate(labelled ? seat.label() : AgentNames.format(seat.agentId())));
    }

    /** Server: the name its owner's client knows it by (already length-checked by the codec). */
    void showName(String name) {
        if (seat != null && !name.isBlank()) setCustomName(plate(name));
    }

    /** Every player near it sees the name: a label is the owner's text, so no formatting or control codes. */
    private static Component plate(String name) {
        return Component.literal(StringUtil.filterText(name)).withStyle(ChatFormatting.WHITE);
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
        // Not while dying: its record let go of it already, and the fall-over must still play.
        if (!level().isClientSide && seat != null && record == null && !isDeadOrDying() && !bind()) return;
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
     * Downed (by mobs, a fall, the void, /kill): its items stay in its record, and its owner's next Place brings the body
     * back with them. Its owner is told.
     */
    @Override
    protected void dropEquipment() {
        // Vanilla's spot for a death that went through (no mod cancelled it), whatever doMobLoot says.
        if (record == null) return;
        for (EquipmentSlot s : EquipmentSlot.values()) super.setItemSlot(s, ItemStack.EMPTY);
        record.entity = null;
        record = null;
        owner().map(getServer().getPlayerList()::getPlayer).ifPresent(p -> {
            p.sendSystemMessage(Component.literal(getName().getString() + " is down. Place it again from the tablet:"
                    + " it keeps everything it had.").withStyle(ChatFormatting.GOLD));
            AgentNet.sendPlaced(p);
        });
    }

    // It walks itself, nobody shoves or tows it: no knockback (a player's sweep lands it before any damage check), no
    // push (a mace smash nearby launches it), leads, pistons, currents or bubble columns. Fishing rods: AgentOfficeMod.
    @Override
    public void knockback(double strength, double x, double z) {}

    @Override
    public void push(double x, double y, double z) {}

    @Override
    public void onAboveBubbleCol(boolean downwards) {}

    @Override
    public void onInsideBubbleColumn(boolean downwards) {}

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
        if (home != null) tag.putLong("Home", home.asLong());
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        // Bodies saved before 0.7.0 bring back their invulnerability and old pace with them: today's rules apply.
        setInvulnerable(false);
        getAttribute(Attributes.MOVEMENT_SPEED).setBaseValue(SPEED);
        getAttribute(Attributes.FOLLOW_RANGE).setBaseValue(FOLLOW);
        if (tag.hasUUID("Owner")) entityData.set(OWNER, Optional.of(tag.getUUID("Owner")));
        if (tag.contains("Home")) home = BlockPos.of(tag.getLong("Home"));
        setSeat(AgentRecords.seat(tag.getCompound("Seat")));
    }

    @Override
    public boolean removeWhenFarAway(double distanceToClosestPlayer) {
        return false;
    }

    // Players and mobs walk around it rather than shove it about.
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
