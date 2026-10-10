# Minecraft tablet: design spec

> **As built (2026-10-10), superseding §1 and §2.1–2.2:** the tablet looks like any other in-game window
> (user feedback after two rounds). The world is dimmed (`renderTransparentBackground`), not blurred, behind
> vanilla's grey window panel (`textures/gui/demo_background.png`, drawn as a nine-slice, `BEZEL = 7`) with no
> casing. Project tabs are vanilla's advancement tabs (`advancements/tab_above_left|middle[_selected]`, 28×32,
> widened by repeating their middle) on the panel's top edge. Content sits in dark sunken wells bevelled like a
> slot (`TabletScreen.well`, `WELL`): the roster (`ObjectSelectionList`, no list background) and the chat
> (transcript, needs-attention bar and approvals); other tablet screens get one well over their content. Text on
> the panel uses `PANEL_TEXT` 0x404040 without shadow, as container titles do. Widgets are vanilla's (buttons,
> cycle pickers, `MultiLineEditBox` composer, scrollers). `tools/gui-sprites.mjs` makes only the 4 status dots.
> Kept from this spec: the one-line header and its overflow order, the growing composer with Stop + Queue side
> by side, table widths ≥ the longest word (no stacked fallback), inline code in the body font with a box, and
> the empty states.

Scope: the tablet workspace screens (`TabletScreen` frame, `WorkspaceScreen` tabs and roster, `ChatScreen`,
`ProjectScreen`, `TranscriptView`, `FlatButton`/`FlatCycle`; the composer is now a plain `MultiLineEditBox`). Out of scope: `OfficeScreen`,
`DiffView`, `ImageScreen`, the lectern.

Direction: Minecraft's own GUI language (bevelled pixel panels, raised buttons, sunken slots) drawn in
Agent Office's dark slate, with the violet accent. Hierarchy comes from colour, bold and spacing. The font
has one size.

Givens: the tablet has its own integer GUI scale (≥ 640×360 units, `TabletScreen.applyScale`). The frame
is at most 760 + sidebar (≤ 920) wide. Only the vanilla bitmap font is used; `Minecraft.UNIFORM_FONT` is gone everywhere.
All coordinates and sizes are whole GUI units.

## 0. Three rules that drive everything

1. **Raised means clickable, sunken holds content.** Buttons, chips and tabs are raised. The transcript
   well, the composer and the scrollbar track are sunken. Cards are flat plates: a 1 px outline and a top
   highlight, with no bottom shadow, so they never look clickable.
2. **Each region gets one surface.** Glass `CANVAS` sits behind the tab strip. One `CARD` body holds the
   sidebar, the chat header, the approval area and the composer bar. The transcript well inside it is
   `CANVAS` again. There are no more three-way flat colour splits.
3. **Spacing grid.** Steps are 2 / 4 / 6 / 8 / 12. Outer padding is 6. The gap between controls is 4.
   Controls are 16 high (composer row 18), list rows are 16, tool rows are 14, and the transcript line is 11.

## 1. Sprites

### 1.1 Pipeline

- Files go in `assets/agentoffice/textures/gui/sprites/tablet/<name>.png`. Draw them with
  `g.blitSprite(ResourceLocation.fromNamespaceAndPath("agentoffice", "tablet/<name>"), x, y, w, h)`.
- Nine-slice sprites get `<name>.png.mcmeta`:
  `{"gui":{"scaling":{"type":"nine_slice","width":W,"height":H,"border":B}}}`. `B` may be an object
  `{"left":2,"top":2,"right":2,"bottom":0}` (tabs). The dots have no mcmeta and are drawn at native size.
- **Every pixel is fully opaque or alpha 0.** `position_tex` discards alpha 0, so no blend state is
  needed and nothing depends on what is underneath. Translucent web tokens (`EDGE`, `LINE`) are baked into
  opaque hexes below.
- 1.21 nine-slice **tiles** edges and centre rather than stretching them. Every recipe has flat bands, so
  any size is exact. The minimum draw size is `2·border + 1` in each axis.
- Vanilla has no pressed state, and neither do we. As in vanilla, hover and keyboard focus share the
  `_hover` sprite (`isHoveredOrFocused()`).

### 1.2 Ring rule (one generator for every sprite)

Pixel `(x,y)` in a W×H sprite has `dL=x, dT=y, dR=W-1-x, dB=H-1-y`. Its **ring** is
`r = min(dL,dT,dR,dB)` (open-bottom sprites leave `dB` out). Within ring `r` the pixel is on side T if `dT==r`,
L if `dL==r`, B if `dB==r`, R if `dR==r`.

- Only T and/or L: the ring's **tl** colour. Only B and/or R: **br**. T+R or B+L (the two off-corners):
  **corner**, which defaults to `fill`, as in a vanilla slot. A ring given as one colour uses it on all sides.
- Pixels deeper than the last listed ring: **fill**.
- **Chamfer c**: transparent where `min(dL,dR) + min(dT,dB) < c`. With c=2, the four pixels where
  `min(dL,dR)==1 && min(dT,dB)==1` take ring 0's colour, which closes the outline like a vanilla
  inventory corner.

So the generator is `sprite(W, H, chamfer, rings[], fill, openBottom)`.

### 1.3 Sprite table

Ring notation: `all` or `tl / br (corner)`. Colours are hex RGB, opaque.

| Sprite | W×H | border | chamfer | ring 0 | ring 1 | more rings | fill |
|---|---|---|---|---|---|---|---|
| `frame` | 32×32 | 8 | 2 | `#000000` | `#3D414F / #0E0F14` (corner `#1C1E26`) | r2–5 `#1C1E26`; r6 `#0B0C10 / #33363F` (corner `#1C1E26`); r7 `#000000` | `#090A0F` |
| `tab` | 16×16 | L2 T2 R2 B0 | 2 (top) | `#000000` | `#1C1F29 / #0B0C11` | (open bottom) | `#101219` |
| `tab_selected` | 16×16 | L2 T2 R2 B0 | 2 (top) | `#000000` | `#262A38 / #0E0F14` | (open bottom) | `#14161F` |
| `button` | 8×8 | 2 | 1 | `#000000` | `#353A4C / #161821` | | `#212533` |
| `button_hover` | 8×8 | 2 | 1 | `#000000` | `#444A60 / #1B1E28` | | `#2C3040` |
| `button_disabled` | 8×8 | 2 | 1 | `#000000` | `#1F2230 / #15171E` | | `#191B24` |
| `button_primary` | 8×8 | 2 | 1 | `#000000` | `#8B7BFF / #4A3DB0` | | `#6A5AE0` |
| `button_primary_hover` | 8×8 | 2 | 1 | `#000000` | `#A99DFF / #5245C2` | | `#7060E8` |
| `button_danger` | 8×8 | 2 | 1 | `#000000` | `#6B2C35 / #2A1116` | | `#4A1F26` |
| `button_danger_hover` | 8×8 | 2 | 1 | `#000000` | `#7A333E / #31141A` | | `#54222A` |
| `field` | 8×8 | 2 | 1 | `#000000` | `#050609 / #2A2E3D` | | `#0E1016` |
| `field_focused` | 8×8 | 2 | 1 | `#8B7BFF` | `#050609 / #2A2E3D` | | `#0E1016` |
| `well` | 8×8 | 1 | 0 | `#000000 / #2A2E3D` (corner `#14161F`) | | | `#090A0F` |
| `code` | 8×8 | 2 | 1 | `#000000 / #22263A` (corner `#0F1117`) | `#07080B / #171A23` | | `#0F1117` |
| `scroll_track` | 6×8 | 1 | 0 | `#000000 / #1A1D28` (corner `#06070A`) | | | `#06070A` |
| `scroll_thumb` | 6×8 | 2 | 1 | `#000000` | `#4A4F63 / #1F2230` | | `#33384A` |
| `scroll_thumb_hover` | 6×8 | 2 | 1 | `#000000` | `#5C6278 / #2A2E3D` | | `#41475C` |
| `card` | 8×8 | 2 | 1 | `#000000` | `#262A38 / #1A1D28` | | `#1A1D28` |
| `card_warn` | 8×8 | 2 | 1 | `#000000` | `#352C17 / #211C12` | | `#211C12` |
| `card_error` | 8×8 | 2 | 1 | `#000000` | `#3A2027 / #22141A` | | `#22141A` |
| `row_selected` | 8×8 | 2 | 1 | `#000000` | `#353A50 / #1C1F2C` | | `#262A3C` |

Cards use br = fill on ring 1, so they read as flat plates: a top-left highlight and no shadow.

**Dots** (6×6, drawn 1:1, no mcmeta). Chamfer 1, ring 0 `#000000`, inner 4×4 = fill. Glint pixels
(1,1),(2,1),(1,2) = hi. Shade pixels (4,3),(3,4),(4,4) = sh.

| Sprite | fill | hi | sh | Use |
|---|---|---|---|---|
| `dot_idle` | `#3A3F52` | `#50566C` | `#2A2E3D` | idle / unknown session, finished tool |
| `dot_running` | `#4EB96F` | `#8EE0A6` | `#2F7D47` | running (frame A) |
| `dot_running_dim` | `#2F7D47` | `#4EB96F` | `#1F5530` | running (frame B): swap every 400 ms, replacing today's alpha pulse |
| `dot_attention` | `#FBBF24` | `#FDE68A` | `#B7860F` | needs_attention |
| `dot_error` | `#F87171` | `#FCA5A5` | `#B04545` | failed tool (if `Transcript.Tool` carries an error) |

27 PNGs in total. A tab's hover state is a text colour change, and a ghost row's hover is a `g.fill`. Neither
needs a sprite.

### 1.4 How these differ from vanilla

- `widget/button` is grey stone with a 2-row bottom shadow and a **white outline on hover**. Ours is slate
  with a 1 px shadow, which keeps 16-high labels centred. Hover lifts the fill one step instead of
  whitening the outline (a white ring on a dark UI is too loud), and the outline stays black.
- `widget/text_field` is a black box with a grey 1 px border that turns white on focus. Ours keeps the
  1 px outline (black, violet `#8B7BFF` when focused) and adds a 1 px slot bevel inside, so it reads as
  sunken.
- The `container` panel has a 2-step chamfer, 2 px white highlight and 2 px grey shadow. `frame` keeps the
  2-step chamfer, uses 1 px bevels, and adds an inner recess plus black glass rim, so it reads as a device.
- Slots and `well` use the same bevel: dark top-left, light bottom-right, and the off-corner pixels in
  the surrounding colour.

### 1.5 New `Theme` constants (keep every existing one)

`OUTLINE #000000`, `BODY_HI #262A38` (body top highlight and the light half of grooves), `ROW_HOVER #1B1E29`,
`CHAIN_HOVER #11131A`, `CODE_BG_WELL #212533` (= `CARD_3`), `CODE_BG_CARD #2C3040` (= `BG_4`),
`TABLE_LINE #1A1D28`, `TABLE_EDGE #22263A`, `PRIMARY_TXT #FFFFFF`. Sprite colours live in the generator
only.

## 2. Layout

Notation: `G` = the glass rect (inside `frame`). All sizes are GUI units.

### 2.1 Frame

- `OUTER = 6` (margin to the window). `BEZEL = 8` is the frame sprite's border, up from 6.
  `frameW = min(width - 12, 872)`, centred. Height is full: `height - 12`.
- `frame` is drawn at `(G.x-8, G.y-8, G.w+16, G.h+16)`. Camera dot: `g.fill` 2×2 `#000000` at the frame's top
  centre, `y = frame.y + 3`.
- **Remove the old fills.** The frame sprite's centre is the glass (`CANVAS`).

### 2.2 Vertical stack inside the glass

| Band | Height | Notes |
|---|---|---|
| Tab strip | 20 | on glass `CANVAS` |
| Body top edge | 2 | row `y0 = G.y+20`: `#000000`; row `y0+1`: `BODY_HI`, full width |
| Body | rest | `CARD` fill; sidebar and chat column |

**Tabs.** They start at `G.x + 6`, with a 2 gap between tabs.

- Unselected: `tab`, `y = G.y+5`, height 15 (it sits on the black body edge). Text `TXT_3` at `y+4`;
  hover `TXT_2`.
- Selected: `tab_selected`, `y = G.y+3`, height 18, so its bottom row covers the body's black edge row.
  After drawing the body's `BODY_HI` row, re-fill `x+2 .. x+w-2` on that row with `CARD` so the tab flows
  into the body (vanilla creative-tab join). Text `TXT` at `y+5`, which puts it 1 unit higher than the
  unselected tabs.
- Width: `font.width(name) + 16`, clamped to 48..140. If the tabs don't fit, every tab shrinks to the same
  width (min 48, `…` truncation) before any is dropped. Dropped tabs become a final `+N` label (`TXT_4`,
  hover `TXT_2`). Its tooltip lists the hidden names, and a click opens the next hidden project. The shown
  project is never dropped.
- When the sidebar is collapsed, `Manage` is a `button` (16 high, `y = G.y+2`) right-aligned at `G.right-6`.

**Body split.**

- Sidebar width: `sw = clamp(even(G.w / 5), 120, 160)`. That is 122 at 640 and 160 at ≥ 800 glass.
- Groove: 2 columns right after the sidebar, `#000000` then `BODY_HI`, from `y0+2` down to `G.bottom`.
- Chat column: from `sidebar + 2` to `G.right`.
- **Collapse rule:** the sidebar is hidden when `G.w < 520`. With the scale fix that only happens on windows
  under about 540 px. Tabs and `Manage` take over, as today.

### 2.3 Sidebar (`L` = `G.x`, `T` = `y0 + 2`)

| Element | Geometry | Style |
|---|---|---|
| Header | `T .. T+24` | "Roster" bold `TXT_2` at `(L+8, T+8)` |
| Row box | `x L+4 .. L+sw-4`, height 16, from `T+24` | hover `ROW_HOVER` fill; selected `row_selected` + 2 px `ACCENT` bar at `(x+1, y+1, x+3, y+15)` |
| Group row | chevron `▸`/`▾` `TXT_4` at `L+8`; name at `L+16`, `TXT`; count right-aligned at `L+sw-10`, `TXT_4` | name truncates first (`…`, tooltip has the full name) |
| Session row | dot sprite at `(L+16, y+5)`; name at `L+26`; `⌂` right-aligned at `L+sw-10`, `TXT_4` | name `TXT_2`; selected: bold `TXT` |
| "+ New session" | text at `L+26` | `TXT_4`, hover `TXT_2`; while adding: "Adding…" `TXT_4`, inactive |
| Note | wrapped at `sw-16`, 10 per line, bottom-aligned above Manage with gap 6 | `TXT_3` (failure notes `AMBER`) |
| Manage agents | `button`, `x L+6 .. L+sw-6`, h 16, bottom edge `G.bottom-6` | label `TXT` |
| Empty roster | "No agents yet" at `(L+8, T+28)` | `TXT_3` |
| Scroll | wheel, as today; a 6 wide `scroll_track`/`thumb` at `L+sw-8` when rows overflow | row boxes then end at `L+sw-10` |

The status dot moves from the far right to before the name, matching tool rows and the chat header. The count
moves out of the label so long names never push it off.

### 2.4 Chat column (`C` = column x, `cw` = column width, `T` = `y0 + 2`)

```
T      ┌ header 24: [dot] name  Session 3  Working…        [opus][effort high][New][Dismiss] ┐
T+24   ├ well (sunken)  x C+6 .. C+cw-6                                                     ┤
       │   transcript ... scrollbar inside right edge                                       │
       ├ gap 6                                                                              ┤
       ├ [attention plate 22] / [approval plates], each followed by gap 6                   ┤
       ├ composer row: [field ...................................... ][Stop][Send|Queue]   ┤
bottom └ gap 6                                                                              ┘
```

**Header** (height 24, on `CARD`; no divider line because the well's bevel separates it).

- Left: status dot sprite at `(C+6, T+9)`. Agent name bold `TXT` at `(C+16, T+8)`. Then gap 6, the session
  name `TXT_3`. Then gap 6, the status word: `Working…` `ACCENT_SOFT`, `Needs attention` `AMBER`,
  `Idle` `TXT_4`. Flash messages replace the status word in `ACCENT_SOFT`.
- **The project name is no longer in the header.** The selected tab already shows it, and it was the
  second line that made the header 30 tall and truncated ("agent-of").
- Right, right-aligned to `C+cw-6`, all `y = T+4`, height 16, gap 4, reading right to left: `Dismiss`
  (only when a body is placed), `New`, effort chip, model chip.
- Widths: buttons are `font.width(label) + 16`, min 34. Chips are the same formula, min 40.
- **Chips**: `button` sprites. The effort label is `effort` in `TXT_4` plus a space plus the value in `TXT`.
  The model label is the value in `TXT`. Tooltip: "Click: next · Right-click: previous".
- **Overflow order** (applied in turn until the title fits in `buttonsLeft - 8`):
  1. The status word goes; the dot stays.
  2. The session name truncates with `…`, then goes.
  3. The effort chip drops its `effort ` key.
  4. The agent name truncates with `…` down to 36 wide (tooltip on hover: name, session, status).
  5. The model chip and then the effort chip hide. **`New` and `Dismiss` never hide.**

  At 640 with normal names none of this triggers: the title gets about 258 of 476.

**Well**

- `well` sprite at `x C+6 .. C+cw-6`, `y T+24 .. above-6`.
- Inside: scrollbar `scroll_track` 6 wide at `well.right-7`, `y well.y+1 .. well.bottom-1`. `scroll_thumb`
  (hover variant on hover) inside it, at least 12 tall. Allow dragging the thumb as well as the wheel.
- Content box: `x well.x+7`, width `min(well.w - 2 - 6 - 6 - 8, 640)`, left-aligned.
  Top and bottom padding is 6.
- Scissor to the well's interior (`well.x+1 .. well.right-1`).

**Composer row.** It is bottom-aligned at `G.bottom - 6`.

- Field `x C+6 .. buttonsLeft-4`.
- Height is `9 + 9·N`, where N is the wrapped line count, clamped to 1..`maxLines`. `maxLines = 6`, also capped
  so the well keeps ≥ 96 tall. One line is 18.
- MultiLineEditBox's inner padding (4) puts the text at `y+4`. If `innerPadding()` is overridable in
  1.21.1, return 5 for an exactly centred single line.
- Growth: listen via `setValueListener`. When the line count changes, re-run the layout maths
  (`input.setRectangle`, move the buttons, `view.setBounds`) **without** `rebuildWidgets`, so focus and the
  cursor are kept. Beyond `maxLines` the field scrolls.
- `Composer.renderBackground` draws `field` or `field_focused`. Vanilla's internal scrollbar may stay.
- Buttons are 18 high and **bottom-aligned with the field** (they stay at the bottom as it grows).
  - Idle: `Send` = `button_primary`, width `font.width(bold) + 16`, min 44, at the far right.
  - Running: `Queue` (`button_primary`) takes Send's spot. `Stop` (`button_danger`, min 40) sits to its
    left, gap 4. They are side by side, no longer stacked. The primary action never moves.
  - `Send`/`Queue` labels are bold `PRIMARY_TXT`. Disabled uses `button_disabled` with `TXT_4`.
- Placeholder: `Message <agent>…` only, in `TXT_4`. The Enter/Shift+Enter hint moves to the empty-chat state.

**Attention plate.**

- `card_warn`, full well width, height 22, sits above the composer with gap 6. A 2 px `AMBER` bar is at
  `(x+1, y+1, x+3, y+21)`.
- Text: bold `AMBER` at `(x+8, y+7)`. Buttons (h 16, `y+3`, gap 4, right edge `x+w-4`) read right to
  left: `Retry` primary, `Resume`, `Skip` (normal).
- Text priority: "Needs attention: the last turn failed or was stopped.", then "Needs attention", then
  truncate with `…`. Buttons never hide.

**Approval plates.**

- `card_warn` with an `AMBER` bar, stacked oldest first above the attention plate, gap 6.
- Title "Allow <tool>?" bold `AMBER` at `(x+8, y+6)`, with `+N more waiting` in `TXT_3` after it.
- Detail: up to 4 lines in `TXT_2` from `y+20`, at 10 per line, then "hover for the full input" in `TXT_4`.
  Bottom padding is 6.
- `Deny` (`button_danger`) and `Allow` (`button_primary`): h 16 at `y+4`, right edge `x+w-4`, gap 4,
  width 44 each. Detail text wraps at `w - 16 - 92` beside the buttons.
- Plates stop being added while the well would drop below 80 tall (`MIN_TRANSCRIPT` 60 → 80).

### 2.5 Concrete numbers

| | 640×360 | 1000×562 |
|---|---|---|
| frame | x 6..634, y 6..354 | x 64..936 (872), y 6..556 |
| glass G | 14..626 (612) × 14..346 (332) | 72..928 (856) × 14..548 (534) |
| tab strip | y 14..34 | y 14..34 |
| sidebar | x 14..136 (122) | x 72..232 (160) |
| chat column | x 138..626 (488) | x 234..928 (694) |
| header | y 36..60 | y 36..60 |
| well | x 144..620 (476), y 60..316 (256) | x 240..922 (682), y 60..518 (458) |
| transcript content | width 456 | width 640 (capped) |
| composer (1 line) | x 144..572, y 322..340 | x 240..874, y 524..542 |
| Send | x 576..620 | x 878..922 |
| sidebar rows visible | 15 | 27 |

## 3. Transcript

### 3.1 Spacing

| Between | Gap |
|---|---|
| any two items (default) | 8 |
| consecutive tool rows / chain rows | 0 |
| before a `You` card (turn boundary) | 12 |
| agent label and its first block | 0 (the label is a line of its own) |
| markdown blocks inside one reply | 4 |
| before a heading (not the first block) | 8 |
| divider (done row) | its own 13 height, plus the default gap above and below |

The line box is 11, with text drawn at `y+1`.

### 3.2 Items

| Item | Rendering |
|---|---|
| **You** | `card`, 2 px `ACCENT` bar at `(x+1,y+1,x+3,y+h-1)`. Padding: left 8 (from the card edge), right 7, top 5, bottom 4, so the visible text inset is 6 top and bottom. Label "You" bold `ACCENT_SOFT`, then body `TXT`. System messages: bar and label "System" in `AMBER`. Full content width. |
| **Agent text** | No card. Label = agent name bold `GREEN`, once per turn as today. Body `TXT_2`; bold spans and headings `TXT`. |
| Heading | bold `TXT`. |
| List | bullet `TXT_4` at `indent+2`; text at `indent + max(10, bulletW+4)`; indent 12 per depth. |
| Link | `ACCENT`, underlined (unchanged). |
| **Inline code** | Same font. Colour `ACCENT_SOFT`. Background `CODE_BG_WELL` in the well, `CODE_BG_CARD` inside a card. See 3.3. |
| **Code block** | `code` sprite, full content width. Header text "`lang · N lines`" `TXT_4` at `(x+8, y+4)`. A 1 px `TABLE_LINE` separator at row `y+14`, from `x+2` to `x+w-2`. Lines in `TXT_2`, **regular font**, at `x+8`, `y+17+i·11`. Height `17 + n·11 + 3`. Tabs become 4 spaces. Wrapped continuation lines indent by 8. |
| **Table** | See 3.4. |
| **Tool row** | Height 14, **no background or top line**. Dot sprite at `(x+2, y+4)`. Name bold `TXT_2` at `x+12`. Arg `TXT_4` after the name + 6, truncated with `…`. "running" `ACCENT_SOFT` right-aligned when running. |
| **Chain row** | Same layout. Label "`N tool calls ▸`" (lowercase, `▾` when open) in `TXT_3`. Hover: `CHAIN_HOVER` fill on the row and the label goes `TXT`. The dot pulses if any tool in the chain runs. |
| **Divider (done)** | Height 13. Centred text `TXT_4` (`RED` for a non-zero exit) at `y+3`. Each side gets an etched groove at rows `y+6` (`#000000`) and `y+7` (`TABLE_LINE`), ending 6 short of the text. |
| **Error** | `card_error`, `RED` bar, title "Error · …" bold `RED`, detail `TXT_2`. Same padding as You. |
| **Rate limit** | `card_warn`, `AMBER` bar (`RED` title when the limit is reached), message `TXT_2`. |
| **Sub-agent** | `card`, bar `OK` while running, `TXT_4` when done. Title "↳ name" bold `TXT` plus status `TXT_3`; detail `TXT_4`. |
| **Note** | Italic `TXT_3` (`AMBER` when it's a warning), no card. |
| **Image** | Unchanged size rule. 1 px `#000000` ring; `ACCENT` ring on hover. |
| Streaming cursor | 5×8 `ACCENT` block, blinking (unchanged). |

### 3.3 Inline code background

Mark code spans with `Style.withInsertion("code")`; the field is harmless and survives `font.split`.

When drawing a `LinesPart` / `ListItemPart` line, walk it with
`line.accept((i, style, cp) -> …)`. Accumulate x with `font.getSplitter().stringWidth`, or measure each
code point with that style. Collect runs where `"code".equals(style.getInsertion())`, then
`g.fill(runX - 1, y, runX + runW, y + 10, bg)` **before** drawing the text.

The 1 unit to the left falls into the previous glyph's trailing space column. The run's own trailing space
column already gives 1 unit on the right. Nothing reflows, and adjacent letters never touch the box.

### 3.4 Tables

Width algorithm (`CELL_PAD = 4`, bold measured for the header row):

1. `natural[c]` = widest full cell in the column + 8.
2. `min[c]` = widest **single word** in the column, capped at `available/3` + 8. Words longer than the
   cap (paths, URLs) hard-break, which `font.split` already does as a last resort.
3. If `Σnatural ≤ available`, use `natural`.
4. Otherwise, if `Σmin ≤ available`: `colW[c] = min[c] + extra·(natural[c]-min[c]) / Σ(natural-min)`,
   with `extra = available - Σmin`. Give rounding leftovers to the widest column. This fixes "Opti/on":
   no column is ever narrower than its longest word.
5. Otherwise, use a **stacked fallback**. Each body row becomes a block. For each cell there is one line
   `Header: ` (bold `TXT_3`) followed by the value (`TXT_2`), wrapping at the full width with a hanging
   indent of 8. Blocks are separated by a 1 px `TABLE_LINE`, with padding 3 above and below. The header
   row itself is not drawn.

Visuals:

- 1 px `TABLE_EDGE` outline around the table.
- Header row: `CARD_2` fill, 1 px `BODY_HI` top line, text bold `TXT`.
- Body rows: no fill. Row separators 1 px `TABLE_LINE`, column separators 1 px `TABLE_LINE`. Text `TXT_2`;
  inline code and bold as in paragraphs.
- Cell padding: 4 left/right, 2 top, 1 bottom (inside the 11 line box: `rowH = lines·11 + 3`).
- Alignment from the markdown, as today.

### 3.5 Empty states

- **Empty chat** (no items): centred in the well. Line 1 is the agent name in bold `GREEN`. Line 2,
  12 below, is "No messages yet" in `TXT_3`. Line 3, 11 below, is "Enter sends · Shift+Enter adds a line"
  in `TXT_4`.
- **`ProjectScreen`**: draw the same chat column frame: a header with "Pick a session" bold `TXT` at the
  title position and no buttons, and an empty well. In the well, centred and **wrapped** to
  `min(well.w - 24, 280)` rather than truncated: the reason, or "Pick a session on the left." in `TXT_3`.
  Under it, "Manage agents adds new ones." in `TXT_4`. Connection problems use `AMBER`.
- **Loading transcript**: "Loading…" `TXT_4`, centred in the well.

## 4. Typography and colour

Everything is in the bitmap font, without a drop shadow (`drawString(..., false)`). Bold = `withBold(true)`
and is measured with bold.

| Text | Colour | Bold |
|---|---|---|
| Tab, selected | `TXT` | no |
| Tab, unselected / hover | `TXT_3` / `TXT_2` | no |
| `+N` overflow tabs | `TXT_4` (hover `TXT_2`) | no |
| "Roster" | `TXT_2` | yes |
| Group (agent) name / count / chevron | `TXT` / `TXT_4` / `TXT_4` | no |
| Session name / selected session | `TXT_2` / `TXT` | no / yes |
| "+ New session", "Adding…" | `TXT_4` (hover `TXT_2`) | no |
| Sidebar note / failure | `TXT_3` / `AMBER` | no |
| Header agent name | `TXT` | yes |
| Header session name | `TXT_3` | no |
| Header status: working / attention / idle / flash | `ACCENT_SOFT` / `AMBER` / `TXT_4` / `ACCENT_SOFT` | no |
| Button label: normal / primary / danger / disabled | `TXT` / `PRIMARY_TXT` / `RED` / `TXT_4` | no / yes / no / no |
| Chip key / value | `TXT_4` / `TXT` | no |
| Composer text / placeholder | `TXT` / `TXT_4` | no |
| Agent label in transcript | `GREEN` | yes |
| Agent body / bold span / heading | `TXT_2` / `TXT` / `TXT` | no / yes / yes |
| You label / body | `ACCENT_SOFT` / `TXT` | yes / no |
| System label | `AMBER` | yes |
| Inline code | `ACCENT_SOFT` on `CODE_BG_*` | no |
| Code block header / body | `TXT_4` / `TXT_2` | no |
| Table header / cells / stacked keys | `TXT` / `TXT_2` / `TXT_3` | yes / no / yes |
| Link | `ACCENT`, underlined | no |
| Tool name / arg / "running" | `TXT_2` / `TXT_4` / `ACCENT_SOFT` | yes / no / no |
| Chain label | `TXT_3` (hover `TXT`) | no |
| Done divider / non-zero exit | `TXT_4` / `RED` | no |
| Error title / detail | `RED` / `TXT_2` | yes / no |
| Attention + approval title | `AMBER` | yes |
| Approval detail / hint | `TXT_2` / `TXT_4` | no |
| Note / warning note | `TXT_3` / `AMBER` | italic |
| Empty-state title / body / hint | `GREEN` or `TXT` / `TXT_3` / `TXT_4` | yes / no / no |

Contrast check (AA 4.5:1, on the fill under the text):

- `TXT_4` on `CANVAS` / `CARD` / `button_disabled`: 5.7 / 5.7 / 5.6.
- White on `#6A5AE0`: 5.1. White on `#7060E8` (hover): 4.7.
- `RED` on `#4A1F26`: 5.0. `RED` on `#54222A` (hover): 4.6.
- `ACCENT` on `CANVAS`: 6.0.

White on the brand `#8B7BFF` is only 3.3:1. That is why the primary fill is darker and `#8B7BFF` is kept
as the highlight bevel.

## 5. Changes vs today, in build order (highest impact first)

1. **Table widths** (§3.4). The longest-word minimum plus the stacked fallback. This alone fixes the worst
   screenshot ("Opti/on", "LDLi/b2", the 2026-10-04 date split over 3 lines).
2. **Drop `UNIFORM_FONT`** for inline code and code blocks. Add the inline-code background (§3.3) and the
   `code` block (§3.2).
3. **Single-line chat header** (§2.4). Drop the project name, add the status dot and word, apply the overflow
   order, and use measured button widths. This fixes "Sessio" and "agent-of".
4. **Composer** (§2.4). One 18-high line that grows to 6. Send 44×18. Queue and Stop side by side. Short
   placeholder. Re-layout without a rebuild.
5. **Sprite generator + `frame` + buttons** (§1). One `sprite(...)` function, 27 PNGs + mcmeta.
   `FlatButton.renderWidget` becomes `blitSprite(kind sprite)` plus the label. `GHOST` stays sprite-less
   for rows. `TabletScreen.BEZEL` goes 6 → 8. Header and sidebar `New` / `Dismiss` / `Manage agents` become
   `NORMAL`, no longer `GHOST`.
6. **Body structure** (§2.2). One `CARD` body with the black + `BODY_HI` top edge, a groove after the sidebar,
   the sunken `well` for the transcript, and the composer on `CARD`. Remove the `EDGE_2` divider fills.
7. **Sidebar** (§2.3). Width `clamp(G.w/5, 120, 160)`, rows 16, dot before the name, count right-aligned,
   `row_selected` + accent bar, truncation with tooltip, scrollbar.
8. **Tabs** (§2.2). `tab` / `tab_selected` with the creative-tab join, equal shrinking, and the `+N`
   overflow label.
9. **Transcript polish** (§3.1–3.2). New gaps, `card*` sprites with bars, flat tool rows, dot sprites with
   the 2-frame pulse, the etched done divider, scrollbar sprites with drag.
10. **Plates and empty states** (§2.4, §3.5). Attention/approval `card_warn`, empty chat, the `ProjectScreen`
    frame and wrapped message.

Verification after each step: screenshots at GUI 640×360 and at about 1000×562, plus one with a long agent
name (`frontend-craftsman`), a 3-column table holding a long word, a running session (Queue/Stop), and 2
pending approvals.
