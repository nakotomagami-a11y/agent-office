# Minecraft mod

`apps/minecraft-mod`: Agent Office inside Minecraft. NeoForge 1.21.1, Java 21, Gradle (not part of the pnpm
workspace). It is a second client of the same API as the web UI. Code structure and rules:
`minecraft-mod-architecture.md`. PR review: `minecraft-review-lectern.md`. The tablet's look: `minecraft-tablet-design.md`.

## How it reaches Agent Office

- Agent Office runs on the same PC and has no login, so the mod only talks to loopback URLs: the `baseUrl` in its
  client config if set, else the servers advertised in `~/.claude/agent-office/servers/<pid>.json` (newest first),
  else `:3000`. It keeps the first one whose `/api/health` answers like Agent Office.
- Only the player's own client talks to Agent Office. Prompts and replies never touch the Minecraft server.

## What the player gets

- **The tablet** (`K`, or the Agent Tablet item: 7 iron ingots around a glass pane, redstone below): Agent Office's
  window in the game. Project tabs, each project's roster, and the chat: markdown, tool rows, images (paste one to
  send it), model and effort, Stop / Queue, Retry / Resume / Skip, Allow / Deny for permission requests. **Manage
  agents** places agents in the world, changes a seat's settings, and adds or removes seats.
- **Agents in the world** (`agentoffice:agent`): one body per agent per project, owned by whoever placed it, drawn as a
  player with its agent's skin (`config/agentoffice-skins/<agentId>[.slim].png`, else a built-in character, else a
  default skin). Use = its chat, sneak-use = its inventory. Its nameplate shows its status and level to its owner only.
- **Agent Spawn Egg** (egg + emerald + redstone): places an unassigned shell; right-click it to pick the agent and
  project.
- **Review Lectern**: a project's open pull requests and their diffs (read-only for now).

The mod also joins servers that don't have it: `K` and the chat still work, but there are no agents in the world, no
items and no Review Lectern.

## Agents in the world: the rules

- **Items** live in the world's record of the agent (`AgentRecords`), not in the entity: a moved, unloaded or dead
  body never loses or duplicates them. Its inventory is shaped like the player's, Curios slots included. **Only armor
  and weapons count**; everything else it wears is cosmetic (no curio effects, no totems).
- **Where it goes** (villager-like): at its desk while it works; at the village bell during the villagers' meeting
  (day time 9000-11000); around the village otherwise; around where it was put when there is no village.
- **Working**: only its owner's client can ask Agent Office, so while the agent is in sight it tells the server every
  5 s whether the agent is running or waiting on you, and at which desk: of the Review Lecterns its owner has set up
  within 64 blocks of the agent, the nearest showing its project (or All projects), else the nearest. No lectern, no
  work. A report holds 30 s, so an agent whose owner left goes back to roaming.
- **Fighting**: it goes after monsters near its place, even while working. It spares creepers, wardens, calm neutral
  mobs, named ones, ones being cured, and ones in a boat or minecart or ridden by a player. Melee with what it holds
  (a crossbow too), or a bow. Its blows and arrows never land on a player, villager, golem, pet or another agent.
- **Damage**: only mobs that fight it can hurt it (and a fall right after their hit, `/kill`, the void). Nothing a
  player does hurts it. It heals slowly out of a fight.
- **Death**: its items stay in its record; its owner is told and places it again from the tablet. **It loses all its
  XP.** A **dismiss** gives its items back to the owner and keeps its level for when it is placed again.
- **Levels**: XP from kills (the mob's own reward, under vanilla's rules: `doMobLoot`, once per death; nothing for
  babies) and, slowly, from work (1 XP per 5 minutes at its desk). Level 1 to start; level *n* to *n*+1 costs
  `20 + 10·n` XP. Shown to its owner (nameplate, inventory screen, a chat line per new level). No effects yet.

## Multiplayer and trust

- Everything an agent does checks its owner: chat, inventory, every packet. Others see the body, its gear and its
  name; its project and status reach only its owner (though anyone can see it standing at its desk).
- The server checks every client packet as if a modified client sent it: lengths and counts are capped, positions
  must be finite, in the world border, within 32 blocks of the player, and somewhere the player may build.
- Land-claim mods are asked (the mod posts the block-place event they listen for) when an agent is placed from the
  tablet and when it takes a new desk. **Not when a Spawn Egg is used**: there the claim mod's own item-use
  protection is all there is.
- What a modified client can still do: say its agent works at any Review Lectern within 64 blocks of the agent
  (someone else's too), which earns at most 12 XP an hour, at that desk.

## Not built yet

- **World tools**: agents acting in the world through MCP tools (`walk_to`, `look_around`, …), only for seats placed
  in a world. Each action is checked by the server as if a player with limited abilities asked, and it fails closed
  (no mod connected or a timeout returns an error), like the permission bridge (`scripts/mcp-permission-server.mjs`).
  Start read-only.
- **Pushed status**: today the client polls each watched agent. An `/api/agent-status` endpoint plus a
  `permissions:changed` app event would let one `/api/events` connection replace the polling.
- Review actions at the lectern (comment, merge, reject) and the review screen on the tablet.
- The held tablet drawn like a map in first person; binding a tablet to one agent.
- Integrations (optional, one at a time): Jade, a Create display source, Ponder scenes, CC:Tweaked
  (`minecraft-mod-libraries.md`).

## Dev loop

```bash
cd apps/minecraft-mod
./gradlew build                 # compile + tests (the game is loaded for them)
./gradlew runGameTestServer     # in-world tests (src/gametest), also in CI
./gradlew runClient             # dev client: NeoForge + this mod, its own run/ folder
./gradlew runServer             # dedicated server in run-server/
```

- `runClient` opens the dev world (`dev_world` in `gradle.properties`) once it exists; create it once from the title
  screen.
- **Scripted checks**: `-PaoOpen=…` and friends drive the client and take a screenshot; `-PaoQuit=true` quits after
  it (`build.gradle` lists the flags, `DevHooks` every form). They are read-only: the client refuses every call that
  would change Agent Office.
- **Multiplayer check**: in `run-server/` accept `eula.txt`, set `online-mode=false` in `server.properties` (the dev
  users are offline accounts) and op them. Then `runServer`, the owner with `runClient -PaoServer=localhost`, and a
  second player with `runClient -PaoServer=localhost -PaoUser=Dev2 -PaoGameDir=run-client2`.
- Before a release, drop the jar into a real modpack (CurseForge) and play a little.

## Credits

The built-in agent skins are from blendi-remade/agentcraft (MIT; notice in
`assets/agentoffice/textures/entity/agent/LICENSE-agentcraft.txt`), as is the idea of the review screen.
