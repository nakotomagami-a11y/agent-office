package dev.agentoffice.mc;

import com.mojang.datafixers.util.Pair;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;
import java.util.function.ObjIntConsumer;
import java.util.function.Predicate;
import net.minecraft.core.NonNullList;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

/**
 * An agent's inventory, shaped like the player's own: 27 main slots and a 9-slot hotbar whose first slot is
 * the hand (a chest-like window over the player's inventory), armor and offhand in a panel to its right, and
 * one Curios slot for each the opening player has in a panel to its left. Short enough for a 240-high GUI.
 */
public final class AgentMenu extends AbstractContainerMenu {
    public static final int ARMOR = 0;
    public static final int OFFHAND = 4;
    public static final int MAIN = 5;
    public static final int HOTBAR = 32;
    public static final int CURIOS = 41;
    /** The equipment panel, right of the 176-wide window. */
    public static final int EQUIPMENT_X = 185;
    public static final int AGENT_HOTBAR_Y = 76;
    public static final int PLAYER_ROWS_Y = 107;

    private static final EquipmentSlot[] ARMOR_SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
    private static final ResourceLocation[] ARMOR_ICONS = {InventoryMenu.EMPTY_ARMOR_SLOT_HELMET, InventoryMenu.EMPTY_ARMOR_SLOT_CHESTPLATE,
            InventoryMenu.EMPTY_ARMOR_SLOT_LEGGINGS, InventoryMenu.EMPTY_ARMOR_SLOT_BOOTS};

    /** Null on a client that does not see the agent (it can still use the slots). */
    public final AgentEntity agent;
    public final List<CuriosCompat.Slots> curios;
    private final Container agentItems;
    private final int playerStart;

    private AgentMenu(int id, Inventory playerInv, AgentEntity agent, Container agentItems, Container curiosItems, List<CuriosCompat.Slots> curios) {
        super(AgentOfficeMod.AGENT_MENU.get(), id);
        this.agent = agent;
        this.curios = curios;
        this.agentItems = agentItems;
        LivingEntity wearer = agent != null ? agent : playerInv.player;

        for (int k = 0; k < 4; k++) {
            EquipmentSlot eq = ARMOR_SLOTS[k];
            ResourceLocation icon = ARMOR_ICONS[k];
            addSlot(new Slot(agentItems, 39 - k, EQUIPMENT_X, 8 + k * 18) {
                @Override
                public int getMaxStackSize() {
                    return 1;
                }

                @Override
                public boolean mayPlace(ItemStack stack) {
                    return stack.canEquip(eq, wearer);
                }

                @Override
                public Pair<ResourceLocation, ResourceLocation> getNoItemIcon() {
                    return Pair.of(InventoryMenu.BLOCK_ATLAS, icon);
                }
            });
        }
        addSlot(new Slot(agentItems, 40, EQUIPMENT_X, 84) {
            @Override
            public Pair<ResourceLocation, ResourceLocation> getNoItemIcon() {
                return Pair.of(InventoryMenu.BLOCK_ATLAS, InventoryMenu.EMPTY_ARMOR_SLOT_SHIELD);
            }
        });
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) addSlot(new Slot(agentItems, 9 + row * 9 + col, 8 + col * 18, 18 + row * 18));
        }
        for (int col = 0; col < 9; col++) addSlot(new Slot(agentItems, col, 8 + col * 18, AGENT_HOTBAR_Y));

        int total = curios.stream().mapToInt(CuriosCompat.Slots::count).sum();
        int columns = (total + 8) / 9;
        int n = 0;
        for (CuriosCompat.Slots s : curios) {
            ResourceLocation icon = CuriosCompat.icon(s.id(), playerInv.player.level());
            for (int i = 0; i < s.count(); i++, n++) {
                // Columns of 9 to the left of the panel, filled top to bottom like Curios' own.
                addSlot(new CurioSlot(curiosItems, n, -columns * 18 - 9 + (n / 9) * 18, 8 + (n % 9) * 18, s.id(), icon, playerInv.player));
            }
        }

        playerStart = slots.size();
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) addSlot(new Slot(playerInv, 9 + row * 9 + col, 8 + col * 18, PLAYER_ROWS_Y + row * 18));
        }
        for (int col = 0; col < 9; col++) addSlot(new Slot(playerInv, col, 8 + col * 18, PLAYER_ROWS_Y + 58));
    }

    public static final class CurioSlot extends Slot {
        public final String id;
        private final ResourceLocation icon;
        private final Player player;

        CurioSlot(Container container, int index, int x, int y, String id, ResourceLocation icon, Player player) {
            super(container, index, x, y);
            this.id = id;
            this.icon = icon;
            this.player = player;
        }

        @Override
        public boolean mayPlace(ItemStack stack) {
            return CuriosCompat.accepts(id, stack, player.level());
        }

        @Override
        public Pair<ResourceLocation, ResourceLocation> getNoItemIcon() {
            return icon == null ? null : Pair.of(InventoryMenu.BLOCK_ATLAS, icon);
        }
    }

    /** Server: the owner sneak-used the agent. */
    static void open(ServerPlayer player, AgentEntity agent) {
        AgentRecords.Record r = agent.record();
        List<CuriosCompat.Slots> shape = CuriosCompat.shape(player);
        fitCurios(r, shape, player);
        agent.curiosChanged();

        Container items = new View(AgentRecords.SIZE, r.items::get, (stack, i) -> {
            EquipmentSlot eq = equipment(i);
            if (eq != null) agent.setItemSlot(eq, stack);
            else r.items.set(i, stack);
        }, () -> { }, p -> agent.isAlive() && agent.record() == r && agent.isOwnedBy(p) && p.canInteractWithEntity(agent, 4.0));

        List<NonNullList<ItemStack>> lists = new ArrayList<>();
        List<Integer> offsets = new ArrayList<>();
        for (CuriosCompat.Slots s : shape) {
            for (int i = 0; i < s.count(); i++) {
                lists.add(r.curios.get(s.id()));
                offsets.add(i);
            }
        }
        Container curiosItems = new View(lists.size(), i -> lists.get(i).get(offsets.get(i)),
                (stack, i) -> lists.get(i).set(offsets.get(i), stack), agent::curiosChanged, items::stillValid);

        player.openMenu(new SimpleMenuProvider((id, inv, p) -> new AgentMenu(id, inv, agent, items, curiosItems, shape), agent.getDisplayName()),
                buf -> {
                    buf.writeVarInt(agent.getId());
                    CuriosCompat.Slots.LIST.encode(buf, shape);
                });
    }

    /** Client: the server opened it. */
    public static AgentMenu fromNetwork(int id, Inventory inv, RegistryFriendlyByteBuf buf) {
        int entityId = buf.readVarInt();
        List<CuriosCompat.Slots> shape = CuriosCompat.bounded(CuriosCompat.Slots.LIST.decode(buf));
        AgentEntity agent = inv.player.level().getEntity(entityId) instanceof AgentEntity a ? a : null;
        int total = shape.stream().mapToInt(CuriosCompat.Slots::count).sum();
        return new AgentMenu(id, inv, agent, new SimpleContainer(AgentRecords.SIZE), new SimpleContainer(total), shape);
    }

    /**
     * The agent's Curios slots take the shape of the opener's. Items in slots that shape lacks go back to the
     * player (inventory, else dropped at their feet), never silently kept where no screen shows them.
     */
    private static void fitCurios(AgentRecords.Record r, List<CuriosCompat.Slots> shape, ServerPlayer player) {
        Map<String, Integer> want = new HashMap<>();
        shape.forEach(s -> want.put(s.id(), s.count()));
        for (String id : List.copyOf(r.curios.keySet())) {
            NonNullList<ItemStack> have = r.curios.get(id);
            int keep = want.getOrDefault(id, 0);
            for (int i = keep; i < have.size(); i++) {
                if (!have.get(i).isEmpty()) player.getInventory().placeItemBackInInventory(have.get(i));
            }
            if (keep == 0) {
                r.curios.remove(id);
            } else if (have.size() != keep) {
                NonNullList<ItemStack> resized = NonNullList.withSize(keep, ItemStack.EMPTY);
                for (int i = 0; i < Math.min(keep, have.size()); i++) resized.set(i, have.get(i));
                r.curios.put(id, resized);
            }
        }
        shape.forEach(s -> r.curios.computeIfAbsent(s.id(), k -> NonNullList.withSize(s.count(), ItemStack.EMPTY)));
    }

    private static EquipmentSlot equipment(int index) {
        for (EquipmentSlot s : EquipmentSlot.values()) {
            if (AgentEntity.index(s) == index) return s;
        }
        return null;
    }

    @Override
    public boolean stillValid(Player player) {
        return agentItems.stillValid(player);
    }

    /** Shift-click: agent → player; player → an armor slot, a Curios slot, else its main slots and hotbar. */
    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        Slot slot = slots.get(index);
        if (!slot.hasItem()) return ItemStack.EMPTY;
        ItemStack stack = slot.getItem();
        ItemStack before = stack.copy();
        boolean moved;
        if (index < playerStart) {
            moved = moveItemStackTo(stack, playerStart, slots.size(), true);
        } else {
            moved = moveItemStackTo(stack, ARMOR, OFFHAND, false)
                    || moveItemStackTo(stack, CURIOS, playerStart, false)
                    || moveItemStackTo(stack, MAIN, CURIOS, false);
        }
        if (!moved) return ItemStack.EMPTY;
        if (stack.isEmpty()) slot.setByPlayer(ItemStack.EMPTY);
        else slot.setChanged();
        if (stack.getCount() == before.getCount()) return ItemStack.EMPTY;
        slot.onTake(player, stack);
        return before;
    }

    /** A Container over storage that lives elsewhere (the agent's record). */
    private record View(int size, IntFunction<ItemStack> get, ObjIntConsumer<ItemStack> set, Runnable changed, Predicate<Player> valid)
            implements Container {
        @Override
        public int getContainerSize() {
            return size;
        }

        @Override
        public boolean isEmpty() {
            for (int i = 0; i < size; i++) {
                if (!get.apply(i).isEmpty()) return false;
            }
            return true;
        }

        @Override
        public ItemStack getItem(int slot) {
            return get.apply(slot);
        }

        @Override
        public ItemStack removeItem(int slot, int amount) {
            ItemStack stack = get.apply(slot);
            if (stack.isEmpty() || amount <= 0) return ItemStack.EMPTY;
            ItemStack out = stack.split(amount);
            if (stack.isEmpty()) set.accept(ItemStack.EMPTY, slot);
            changed.run();
            return out;
        }

        @Override
        public ItemStack removeItemNoUpdate(int slot) {
            ItemStack stack = get.apply(slot);
            set.accept(ItemStack.EMPTY, slot);
            return stack;
        }

        @Override
        public void setItem(int slot, ItemStack stack) {
            set.accept(stack, slot);
            changed.run();
        }

        @Override
        public void setChanged() {
            changed.run();
        }

        @Override
        public boolean stillValid(Player player) {
            return valid.test(player);
        }

        @Override
        public void clearContent() {
            for (int i = 0; i < size; i++) set.accept(ItemStack.EMPTY, i);
            changed.run();
        }
    }
}
