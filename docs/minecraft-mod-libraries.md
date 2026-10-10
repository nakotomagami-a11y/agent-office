# Minecraft mod — library research (2026-10-10)

Goal: turn the phase-1 proof (vanilla widgets, villager bodies) into a UI "as good as Agent Office,
Minecraft-styled", heavily integrated with the game. Versions and dates were checked on the Modrinth
v2 API / GitHub on 2026-10-10. Companion to `minecraft-mod-plan.md`.

## Decided (2026-10-10, user criterion: biggest selection of mods and modpacks)

- **Target: NeoForge 1.21.1, Java 21.** Measured on the Modrinth API the same day:

  | | Forge 1.20.1 | **NeoForge 1.21.1** | NeoForge 26.1.2 |
  |---|---|---|---|
  | Top 150 Forge/NeoForge mods with an exact build | 131 | **141** | 120 |
  | Mods created in the last 12 months | 9,312 | **10,631** | 3,967 |
  | Mods updated in the last 3 months | 7,624 | **9,541** | 5,835 |
  | Modpacks updated in the last 3 months | 537 | **808** | 44 |
  | Create | 6.0.8 | **6.0.10** | none |
  | "create" search hits (addons) | 1,472 | **1,762** | 168 |

  All-time totals still favour 1.20.1 (25.1k mods / 3,030 packs vs 21.2k / 2,150), but that includes
  dead projects; everything still being made or updated is on 1.21.1. 26.x has no Create yet — revisit
  when Create ships there. Of the top 150, 1.21.1 only lacks client tweaks (Zoomify, Litematica/MaLiLib,
  Oculus — Iris itself runs on NeoForge there).
- **License: stays GPL-3.0-or-later** (whole repo; personal use, not published).
- "Integrated like Create" = work with Create's mechanics (display boards, Ponder, contraptions), not
  copy its GUI library.

## Refresh (2026-10-10, UI rework): NeoForge 1.21.1 builds + what real packs already ship

Modrinth API, same day. "Packs" = the user's CurseForge instances All of Create (207 mods), Craftoria (523),
Create'a Colony (122). A lib already in packs costs players nothing as a soft dependency.

| Lib | NeoForge 1.21.1 build | In packs | License | Use for us |
|---|---|---|---|---|
| **LDLib2** (Modrinth slug `ldlib`, v2.x) | 2.2.42, 2026-10-04 | none | LGPL-3.0 | Native app-style UI: TabView, SplitView, VirtualScrollerView, TextArea, SearchComponent, TreeList, LSS styles, UI editor, smooth fonts. Still no markdown element |
| **Rinku** (Chromium) | 3.0.4, 2026-08-27 | none | LGPL-2.1+ | Show the real web UI on the tablet |
| **Curios** | 9.5.1, 2025-05-14 | all 3 | LGPL-3.0 | Tablet slot + keybind, no hotbar slot |
| **Jade** | 15.10.6, 2026-08-06 | all 3 | CC-BY-NC-SA | Look at a body → status / model / current tool |
| Searchables | 1.0.2, 2024-10 | all 3 | MIT | Search/filter helper for long lists |
| Chat Heads | 0.15.7, 2026-08-13 | 2 | MPL-2.0 | Agent faces next to their messages in vanilla chat |
| GuideME | 21.1.19, 2026-09-16 | Craftoria | mixed OSS | Markdown in-game manual for the mod |
| Caxton | 0.6.4, 2026-04-17 | none | MIT | TrueType font for transcript/code; check the fallback when it's missing |
| Cloth Config / YACL | 15.0.140 / 3.8.2 | Cloth: 2 | LGPL-3.0 | Settings screen, only if settings grow |
| CC:Tweaked, Create 6.0.10 | yes | Craftoria / all 3 | — | Integrations (§3), not UI |

Skip, checked again: owo-lib (NeoForge build is a 2025-07 beta), ModernUI (legacy line + font-mod conflicts),
ModularUI (no 1.21.1 NeoForge), MCEF (last 2024-10), FancyMenu (menu skinning, custom license),
Iceberg / Legendary Tooltips (NC-ND), `pane` (307 downloads).

## 1. The decision under everything: Forge 1.20.1 or NeoForge 1.21.1

The mod is ~1.5k lines and `core/` has no Minecraft imports, so switching is cheapest **now**.

| Signal | Forge 1.20.1 | NeoForge 1.21.1 |
|---|---|---|
| Flagship pack | ATM9 — last file 2025-10-12 (stale) | ATM10 — 22.2M dl, file 2026-09-22 |
| Next gen | — | ATM11 is on NeoForge **26.1.2** (beta, Java 25) |
| Best UI framework | LDLib **v1** (old API), ModularUI 3 (young) | **LDLib2** (rewrite, active daily) |
| ModernUI | 3.12.0.1, 2025-09-02, README says EOL | 3.13.0.1 (legacy; mainline is 26.1) |
| Parchment mappings | last 2023-09-03 | maintained |
| Kotlin for Forge | 4.x only | 6.x |
| Create 6 / Ponder / GeckoLib / Jade / JEI / EMI | yes | yes |
| Build plugin | NeoForged recommends MDG `legacyforge` over ForgeGradle 6 | MDG |

Forge 1.20.1 still gets loader builds (47.4.26, 2026-10-02) and big legacy packs, but the library
ecosystem is in maintenance mode there. 26.1 (no obfuscation) is the likely *next* stable target;
libraries are still landing on it.

## 2. In-game UI

| Option | Fit | Loaders | License | Notes |
|---|---|---|---|---|
| **LDLib2** | Best native match for an app-like UI | NeoForge 1.21.1 + 26.x (no Forge) | LGPL-3.0 | TextArea, TextField, **CodeEditor**, VirtualScrollerView, TreeList, TabView, SplitView; LSS stylesheets, XML UIs, data bindings, style animations. `ModularUIScreen` = pure client screen, no server menu. Docs site. 254★, pushed 2026-10-09 |
| LDLib v1 | Same author, older API | Forge 1.20.1 (2026-09-07) | LGPL-3.0 (GitHub says GPL-3.0) | GregTech Modern lineage; separate API from v2 |
| ModularUI 3 | Window/panel widget trees, JSON themes | Forge 1.20.1 only | LGPL-3.0 | Standalone since 2026-02; "improved text rendering" still planned |
| BlockUI | XML layouts (MineColonies) | Forge 1.20.1, NeoForge snapshot | GPL-3.0 | README-only docs, 6★ |
| ModernUI (+ Markflow) | Real fonts (TTF/OTF, SDF, emoji, bidi), CommonMark | Forge 1.20.1 EOL; NeoForge legacy | LGPL-3.0 | 25 MB, GL 3.3+, conflicts with Caxton/ImmediatelyFast/Emojiful |
| owo-lib | Nice API | **no Forge**; NeoForge betas only | MIT | Out |
| FTB Library | FTB Quests' GUI | both | **All Rights Reserved** | Out |
| Catnip (Create's GUI code) | The "Create look" | ships inside Ponder | MIT (Ponder) | No standalone artifact, no API-stability promise; package paths moved in 2025. Copy the *look* (our own nine-slice textures), don't depend on it |
| Vanilla widgets (today) | Works, looks basic | any | — | — |

**Markdown in native UIs:** `commonmark-java` (BSD-2, no deps, AST visitor) → map the AST to vanilla
`Component`s in `core/`. Nothing on Forge renders code blocks or syntax highlighting; LDLib2's
CodeEditor is the only off-the-shelf option.

### Embedded browser (render the real Agent Office UI)

| | Status |
|---|---|
| **Rinku** (Keksuccino, ex-"MCEF fork") | Forge 1.20.1 3.0.4 (2026-08-27), NeoForge, Fabric, 26.x. Chromium 151. LGPL-2.1+. 150k dl |
| CinemaMod MCEF | 1.20.1 last 2024-10-20, Chromium 116, open 1.20.1 crash/download issues |
| WebDisplays | needs MCEF, last 2024-10 |
| Ultralight | proprietary engine, Java wrapper archived |

Cost: **~150–180 MB native download per platform** on first run, antivirus blocks reported, 60 fps
cap by default, CPU→texture copy. Gains full UI parity for free (diffs, markdown, tool output).

## 3. In-world integration (all optional soft dependencies)

| Want | Library | Loaders | License |
|---|---|---|---|
| Status when looking at an agent | **Jade** plugin (`registerEntityComponent`) / The One Probe | both | Jade CC-BY-NC-SA (fine as a dep) / TOP MIT |
| Agent status on Create display boards | **Create 6 `DisplaySource`** (one method, `provideText`) | both | MIT code |
| Agents callable from in-game computers | CC:Tweaked peripheral (`@LuaFunction`) | both | CCPL |
| Tutorial scenes ("how to summon an agent") | **Ponder** (MIT) | both | MIT |
| Markdown guidebook | **GuideME** (AE2's) | both, active | mixed OSS |
| Animated agent bodies | **GeckoLib** (MIT, Blockbench) or AzureLib (MIT) | both | MIT |
| Player-skin bodies | vanilla `PlayerModel` renderer — no dep needed | — | — |
| Pathfinding | vanilla `PathNavigation` (server entity). Baritone drives the player only; Automatone/PlayerEngine are Fabric | — | — |

Skip: Easy NPC (assets not reusable), CustomNPCs/Touhou Little Maid (NC licenses, no API), Patchouli
(own markup, NC), JEI/EMI as an agent list (built for item stacks), PlayerAnimator (abandoned).

## 4. Build and tooling

- Deps: each library's own Maven first; Modrinth Maven (`maven.modrinth:<slug>:<ver>`, **non-transitive**)
  or CurseMaven as fallback. Jar-in-jar only small plain libs (commonmark).
- Forge 1.20.1 → MDG `legacyforge` plugin (2.0.148); NeoForge → MDG.
- Multi-loader (Architectury / MultiLoader-Template / Stonecutter): not now — one target, `core/` already isolates logic.
- Kotlin: no.
- **License:** the mod is GPL-3.0-or-later. Modrinth's licensing guide calls plain GPL-3.0 incompatible
  with linking into Minecraft and recommends LGPL-3.0 or a GPL linking exception. Decide before publishing.
- Platform rules: Modrinth §1.11 only forbids undisclosed uploads to servers the user didn't choose;
  loopback to the user's own app is fine, but disclose it on the project page.

## 5. Recommendation

1. **Move to NeoForge 1.21.1** now, while the port is ~1.5k lines (`core/` + its 36 tests unchanged).
2. ~~**Spike LDLib2**~~ — **decided 2026-10-09: vanilla + own small UI kit** (no markdown widget in LDLib2, so the
   transcript is custom drawing anyway; avoids native layout libs). See plan § "Built (0.3.0)". Original note: spike it with one screen: the chat (VirtualScrollerView + TextArea + markdown). Keep it if it
   beats vanilla in a day; it becomes the Agent Office shell (sidebar of projects/agents, tabs, split view).
3. Own Create-style textures + LSS theme for the look; don't depend on Catnip.
4. Integrations one at a time, all optional: Jade → Create display source → Ponder scenes → CC:Tweaked.
5. Rinku only as a later "open in in-game browser" escape hatch for diffs etc., not the main UI.
6. GeckoLib when bodies get their own look (phase 3).
