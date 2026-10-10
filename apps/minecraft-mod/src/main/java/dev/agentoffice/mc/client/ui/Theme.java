package dev.agentoffice.mc.client.ui;

/** Agent Office's dark palette (apps/web/src/app/styles/palette.css), as ARGB. */
public final class Theme {
    private Theme() {}

    public static final int CANVAS = 0xFF090A0F;
    public static final int CARD = 0xFF14161F;
    public static final int CARD_2 = 0xFF1A1D28;
    public static final int CARD_3 = 0xFF212533;
    public static final int BG_4 = 0xFF2C3040;
    public static final int EDGE = 0x0DFFFFFF;
    public static final int EDGE_2 = 0x14FFFFFF;
    public static final int LINE = 0x24FFFFFF;

    public static final int TXT = 0xFFF5F6F9;
    public static final int TXT_2 = 0xFFB5BBCB;
    public static final int TXT_3 = 0xFF9BA1B3;
    public static final int TXT_4 = 0xFF8B91A4;

    public static final int ACCENT = 0xFF8B7BFF;
    public static final int ACCENT_SOFT = 0xFFC4BBFF;
    public static final int OK = 0xFF4EB96F;
    public static final int GREEN = 0xFF34D399;
    public static final int RED = 0xFFF87171;
    public static final int AMBER = 0xFFFBBF24;

    /** The tablet's casing around the screen. */
    public static final int BEZEL = 0xFF1C1E26;
    public static final int BEZEL_EDGE = 0xFF33363F;

    public static int withAlpha(int argb, int alpha) {
        return (alpha << 24) | (argb & 0xFFFFFF);
    }
}
