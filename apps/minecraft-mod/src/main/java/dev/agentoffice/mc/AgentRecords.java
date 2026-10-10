package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.NonNullList;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.saveddata.SavedData;

/**
 * Every placed agent in this world, saved with it: whose it is, which seat it talks to, which entity is its
 * body, and its items. The items live here, not in the entity, so a body can be moved, replaced or left in an
 * unloaded chunk without losing or duplicating anything: an entity whose id is no longer its record's
 * discards itself when it loads ({@link AgentEntity}).
 */
public final class AgentRecords extends SavedData {
    /** Vanilla's player Inventory indexing: 0-8 hotbar (0 = the hand), 9-35 main, 36-39 feet..head, 40 offhand. */
    public static final int SIZE = 41;

    public static final class Record {
        public final UUID owner;
        public Api.Slot seat;
        /** The entity that is its body now; null while it has none (never set after a failed spawn). */
        public UUID entity;
        public final NonNullList<ItemStack> items = NonNullList.withSize(SIZE, ItemStack.EMPTY);
        /** Curios slot id → stacks; shaped like the player who last opened it (see AgentMenu). */
        public final Map<String, NonNullList<ItemStack>> curios = new LinkedHashMap<>();

        Record(UUID owner, Api.Slot seat) {
            this.owner = owner;
            this.seat = seat;
        }

        public String key() {
            return AgentRecords.key(owner, seat);
        }

        /** Everything it holds, emptied out of the record. */
        public List<ItemStack> takeAll() {
            List<ItemStack> out = new ArrayList<>();
            for (int i = 0; i < SIZE; i++) {
                if (!items.get(i).isEmpty()) out.add(items.set(i, ItemStack.EMPTY));
            }
            // Emptied, not just dropped: an open menu's view may still hold these lists.
            for (NonNullList<ItemStack> list : curios.values()) {
                for (int i = 0; i < list.size(); i++) {
                    if (!list.get(i).isEmpty()) out.add(list.set(i, ItemStack.EMPTY));
                }
            }
            curios.clear();
            return out;
        }
    }

    private static final SavedData.Factory<AgentRecords> FACTORY = new SavedData.Factory<>(AgentRecords::new, AgentRecords::load);

    private final Map<String, Record> byKey = new LinkedHashMap<>();

    public static AgentRecords get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(FACTORY, "agentoffice_agents");
    }

    /** One body per agent per project per player: every seat of "developer" in a project shares it. */
    static String key(UUID owner, Api.Slot seat) {
        return owner + "/" + seat.projectId() + "/agent:" + seat.agentId();
    }

    public Record find(UUID owner, Api.Slot anySeat) {
        return byKey.get(key(owner, anySeat));
    }

    /** The agent's record, now talking to {@code seat}. */
    public Record getOrCreate(UUID owner, Api.Slot seat) {
        Record r = byKey.computeIfAbsent(key(owner, seat), k -> new Record(owner, seat));
        r.seat = seat;
        return r;
    }

    public void remove(Record r) {
        byKey.remove(r.key(), r);
        setDirty();
    }

    public List<AgentNet.Body> bodiesOf(UUID owner) {
        return byKey.values().stream().filter(r -> r.owner.equals(owner))
                .map(r -> new AgentNet.Body(Optional.ofNullable(r.entity), r.seat)).toList();
    }

    int countOf(UUID owner) {
        return (int) byKey.values().stream().filter(r -> r.owner.equals(owner)).count();
    }

    /** Items change in place (durability, a stack split in a slot) without telling us: always written. */
    @Override
    public boolean isDirty() {
        return true;
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        ListTag list = new ListTag();
        for (Record r : byKey.values()) {
            CompoundTag t = new CompoundTag();
            t.putUUID("Owner", r.owner);
            t.put("Seat", seatTag(r.seat));
            if (r.entity != null) t.putUUID("Entity", r.entity);
            t.put("Items", ContainerHelper.saveAllItems(new CompoundTag(), r.items, registries));
            CompoundTag curios = new CompoundTag();
            r.curios.forEach((id, stacks) -> {
                CompoundTag c = ContainerHelper.saveAllItems(new CompoundTag(), stacks, registries);
                c.putInt("Size", stacks.size());
                curios.put(id, c);
            });
            t.put("Curios", curios);
            list.add(t);
        }
        tag.put("Agents", list);
        return tag;
    }

    private static AgentRecords load(CompoundTag tag, HolderLookup.Provider registries) {
        AgentRecords out = new AgentRecords();
        for (Tag el : tag.getList("Agents", Tag.TAG_COMPOUND)) {
            CompoundTag t = (CompoundTag) el;
            Api.Slot seat = seat(t.getCompound("Seat"));
            if (seat == null || !t.hasUUID("Owner")) continue;
            Record r = new Record(t.getUUID("Owner"), seat);
            if (t.hasUUID("Entity")) r.entity = t.getUUID("Entity");
            ContainerHelper.loadAllItems(t.getCompound("Items"), r.items, registries);
            CompoundTag curios = t.getCompound("Curios");
            for (String id : curios.getAllKeys()) {
                CompoundTag c = curios.getCompound(id);
                NonNullList<ItemStack> stacks = NonNullList.withSize(Math.max(0, c.getInt("Size")), ItemStack.EMPTY);
                ContainerHelper.loadAllItems(c, stacks, registries);
                r.curios.put(id, stacks);
            }
            out.byKey.put(r.key(), r);
        }
        return out;
    }

    static CompoundTag seatTag(Api.Slot seat) {
        CompoundTag t = new CompoundTag();
        if (seat == null) return t;
        t.putString("projectId", seat.projectId());
        t.putString("agentId", seat.agentId());
        t.putString("instanceId", seat.instanceId());
        if (seat.projectName() != null) t.putString("projectName", seat.projectName());
        if (seat.label() != null) t.putString("label", seat.label());
        return t;
    }

    /** Null for an empty tag (a shell's). */
    static Api.Slot seat(CompoundTag t) {
        if (!t.contains("projectId") || !t.contains("agentId") || !t.contains("instanceId")) return null;
        return new Api.Slot(t.getString("projectId"), t.contains("projectName") ? t.getString("projectName") : null,
                t.getString("agentId"), t.getString("instanceId"), t.contains("label") ? t.getString("label") : null);
    }
}
