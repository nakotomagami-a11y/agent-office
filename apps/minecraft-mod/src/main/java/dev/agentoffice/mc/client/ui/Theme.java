package dev.agentoffice.mc.client.ui;

import dev.agentoffice.mc.core.Ids;
import dev.agentoffice.mc.core.Protocol;
import net.minecraft.resources.ResourceLocation;

/**
 * The tablet's dark palette: Agent Office's hues on neutral greys after VS Code's Dark Modern, softer
 * than the web app's (apps/web/src/app/styles/palette.css). Text never goes to pure white, accents are
 * muted, and the code colours are Dark+'s, so long reading stays easy on the eye.
 */
public final class Theme {
    private Theme() {}

    public static final int CANVAS = 0xFF181818;
    public static final int CARD = 0xFF1F1F1F;
    public static final int CARD_2 = 0xFF252526;
    public static final int CARD_3 = 0xFF2A2D2E;
    public static final int BG_4 = 0xFF37373D;
    public static final int EDGE = 0x0DFFFFFF;
    public static final int EDGE_2 = 0x14FFFFFF;
    public static final int LINE = 0x24FFFFFF;

    public static final int TXT = 0xFFD4D4D4;
    public static final int TXT_2 = 0xFFB4B4B4;
    public static final int TXT_3 = 0xFF9D9D9D;
    public static final int TXT_4 = 0xFF8C8C8C;

    public static final int ACCENT = 0xFF9D8FF0;
    public static final int ACCENT_SOFT = 0xFFB8AEEE;
    public static final int OK = 0xFF5FAE78;
    public static final int GREEN = 0xFF81B88B;
    public static final int RED = 0xFFE06C75;
    public static final int AMBER = 0xFFE2C08D;

    /** Diff line tints: low enough that the code on them keeps its own colours. */
    public static final int DIFF_ADD = 0x2481B88B;
    public static final int DIFF_DEL = 0x24E06C75;

    /** VS Code Dark+ token colours, for {@link dev.agentoffice.mc.core.Syntax}. */
    public static final int CODE_KEYWORD = 0xFF569CD6;
    public static final int CODE_CONTROL = 0xFFC586C0;
    public static final int CODE_STRING = 0xFFCE9178;
    public static final int CODE_COMMENT = 0xFF6A9955;
    public static final int CODE_NUMBER = 0xFFB5CEA8;
    public static final int CODE_TYPE = 0xFF4EC9B0;
    public static final int CODE_FUNCTION = 0xFFDCDCAA;
    public static final int CODE_VARIABLE = 0xFF9CDCFE;
    public static final int CODE_CONSTANT = 0xFF4FC1FF;

    /** Translucent black under transcript content, like vanilla's chat background. */
    public static final int SHADE = 0x40000000;
    public static final int SHADE_2 = 0x66000000;
    /** Hovered text, the one place the tablet goes to pure white. */
    public static final int HOVER = 0xFFFFFFFF;

    /** Vanilla's container greys, for what is drawn like a chest's window ({@link VanillaGui}). */
    public static final class Vanilla {
        public static final int PANEL = 0xFFC6C6C6;
        /** Titles on the panel: dark, drawn without a shadow. */
        public static final int LABEL = 0xFF404040;
        public static final int OUTLINE = 0xFF000000;
        public static final int LIGHT = 0xFFFFFFFF;
        public static final int SHADOW = 0xFF555555;
        public static final int SLOT_SHADOW = 0xFF373737;
        public static final int SLOT = 0xFF8B8B8B;
        /** Behind an entity preview, as vanilla's inventory draws the player. */
        public static final int PREVIEW = 0xFF000000;

        private Vanilla() {}
    }

    /** One of the tablet's own sprites (tools/gui-sprites.mjs); every widget is vanilla's. */
    public static ResourceLocation sprite(String name) {
        return ResourceLocation.fromNamespaceAndPath(Ids.MOD_ID, "tablet/" + name);
    }

    private static final ResourceLocation DOT_IDLE = sprite("dot_idle");
    private static final ResourceLocation DOT_RUNNING = sprite("dot_running");
    private static final ResourceLocation DOT_RUNNING_DIM = sprite("dot_running_dim");
    private static final ResourceLocation DOT_ATTENTION = sprite("dot_attention");

    /** A session or tool status as a 6×6 dot sprite; running blinks between two frames. */
    public static ResourceLocation dot(String status) {
        return switch (status == null ? "" : status) {
            case Protocol.Conversation.RUNNING -> System.currentTimeMillis() / 400 % 2 == 0 ? DOT_RUNNING : DOT_RUNNING_DIM;
            case Protocol.Conversation.NEEDS_ATTENTION -> DOT_ATTENTION;
            default -> DOT_IDLE;
        };
    }

    public static int withAlpha(int argb, int alpha) {
        return (alpha << 24) | (argb & 0xFFFFFF);
    }
}
