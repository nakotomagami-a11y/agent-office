package dev.agentoffice.mc.client.ui;

import java.util.List;
import java.util.function.Consumer;
import java.util.function.Function;
import net.minecraft.network.chat.Component;

/** A flat button that steps through values on click (right-click steps back). */
public final class FlatCycle<T> extends FlatButton {
    private final List<T> values;
    private final Function<T, String> label;
    private int index;
    private Consumer<T> onChange = v -> { };

    public FlatCycle(int x, int y, int width, int height, List<T> values, T initial, Function<T, String> label) {
        super(x, y, width, height, Component.empty(), Kind.NORMAL, b -> { });
        // A current value outside the list (an alias like "manual", a full model id) stays selectable
        // as itself: mapping it to the first option would make saving silently change it.
        List<T> all = values;
        if (initial != null && !values.contains(initial)) {
            all = new java.util.ArrayList<>(values);
            all.add(initial);
        }
        this.values = all;
        this.label = label;
        this.index = Math.max(0, all.indexOf(initial));
        setMessage(Component.literal(label.apply(value())));
    }

    public FlatCycle<T> onChange(Consumer<T> onChange) {
        this.onChange = onChange;
        return this;
    }

    public T value() {
        return values.get(index);
    }

    @Override
    public void onPress() {
        step(1);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 1 && active && visible && isMouseOver(mouseX, mouseY)) {
            step(-1);
            playDownSound(net.minecraft.client.Minecraft.getInstance().getSoundManager());
            return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    private void step(int by) {
        index = Math.floorMod(index + by, values.size());
        setMessage(Component.literal(label.apply(value())));
        onChange.accept(value());
    }
}
