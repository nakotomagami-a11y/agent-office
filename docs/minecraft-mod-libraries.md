# Minecraft mod — platform and libraries

Decisions and the options still open. Numbers are from the Modrinth API, 2026-10-10.

## Platform: NeoForge 1.21.1, Java 21

The criterion was the biggest selection of mods and modpacks a player could use with ours. The mod started on
Forge 1.20.1 and moved while it was small.

| | Forge 1.20.1 | **NeoForge 1.21.1** | NeoForge 26.1 |
|---|---|---|---|
| Top 150 mods with a build | 131 | **141** | 120 |
| Mods updated in the last 3 months | 7,624 | **9,541** | 5,835 |
| Modpacks updated in the last 3 months | 537 | **808** | 44 |
| Create | yes | **yes** | no |

1.20.1 has more all-time projects, but most of what is still made or updated is on 1.21.1, and its library
ecosystem (Parchment, LDLib2, ModernUI) has moved on. Revisit 26.x when Create ships there.

## UI: vanilla widgets plus a small own kit

Checked: LDLib2 (the best app-style toolkit on 1.21.1), ModernUI, owo-lib, ModularUI, an embedded Chromium (Rinku).
None renders markdown, so the transcript is custom drawing either way; LDLib2 also brings native layout libraries,
and Chromium a ~150 MB download per platform. The tablet uses vanilla widgets and `client/ui/` instead
(`minecraft-tablet-design.md`).

## Integrations worth adding (all optional soft dependencies)

| Want | Library | License |
|---|---|---|
| Status when looking at an agent | Jade plugin (`registerEntityComponent`) | CC-BY-NC-SA (fine as a dependency) |
| Agent status on Create display boards | Create 6 `DisplaySource` | MIT |
| Tutorial scenes | Ponder | MIT |
| Agents callable from in-game computers | CC:Tweaked peripheral | CCPL |
| In-game manual | GuideME | mixed OSS |
| Animated bodies | GeckoLib | MIT |

Already used: Curios (optional; the agent's inventory mirrors the player's Curios slots). Pathfinding is vanilla's
`PathNavigation`; player-skin bodies use vanilla's `PlayerModel`.

Skipped: Easy NPC, CustomNPCs, Touhou Little Maid, Patchouli (licenses or no API), FTB Library (all rights reserved),
Catnip (Create's GUI code: no standalone artifact; copy the look, not the code).

Code we may and may not reuse:
- blendi-remade/agentcraft is MIT: the agent skins come from it (keep its notice).
- wrxck/AgentCraft has no license, so all rights reserved: ideas only, no code.
- CC:Tweaked, for the held tablet drawn like a map: `ItemMapLikeRenderer` / `PocketItemRenderer` are MPL-2.0 (adapt
  them with their headers kept); `PocketComputerItem` is CCPL (don't copy).

## Before publishing on Modrinth or CurseForge

- **License**: the repo is GPL-3.0-or-later. Modrinth's licensing guide calls plain GPL incompatible with linking into
  Minecraft and recommends LGPL-3.0 or a GPL linking exception. Decide before the first upload.
- Modrinth's rules allow talking to the user's own app on loopback; say so on the project page.
