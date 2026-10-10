# Minecraft mod — plan

Library research for the next phase (UI frameworks, version choice, integrations): `minecraft-mod-libraries.md`.
PR review in the world (Review Lectern): `minecraft-review-lectern.md`.

Status: **phase 1 built, awaiting the user's proof run** (`apps/minecraft-mod/`). Target: Minecraft
**1.21.1**, **NeoForge 21.1** (ModDevGradle 2), Java 21 — ported from Forge 1.20.1 on 2026-10-10 (why: `minecraft-mod-libraries.md`). App change 1 (discovery) done; 3 partly (the monorepo split, 2026-10-10, added `packages/api-contract` and a standalone `apps/server` — contract tests not written); 2 and 4 not started.

## Shape (as built, phase 1)

- Agent Office runs on the same PC as Minecraft. No hub, no network exposure; the mod only accepts
  loopback URLs (config override > advertised servers, newest first > `:3000`) and only trusts a `/api/health` that
  answers `{available, version}`.
- **Client-only** (`@Mod(dist = CLIENT)`, no network channels registered): servers never need the mod, other players never see or
  reach your agents, prompts and replies never touch the Minecraft server.
- `K` opens the agent picker (every project roster seat). In a world each seat has **Place/Move**.
- **Bodies are client-only villagers** (`AgentBody`, negative entity ids, nothing registered). Clicks
  on them are handled and cancelled client-side, so no packet about them reaches the server.
  Positions persist in `<gameDir>/config/agentoffice-bodies.json` per world + dimension. Dismissing a
  body never touches Agent Office. Nameplate status is polled (read-only GET) every 5 s.
- Placing a body uses an **existing** roster seat. Creating seats from the game (`POST roster`) is later.
- Chat follows `docs/chat-refactor.md`: render the server's turns, stream the active run, re-read on end.
- No extra Java deps: `java.net.http.HttpClient` (pinned to HTTP/1.1 — the default h2c upgrade makes
  Agent Office's Node server drop the connection) and Gson (ships with Minecraft).
- Server entities, a wand item and owner checks move to phase 2 with world tools.

## App changes

### 1. Discovery — let the mod find the app (DONE)

Each running server writes `~/.claude/agent-office/servers/<pid>.json` = `{ baseUrl, pid, startedAt }`
(`packages/domain/src/services/infra/discovery.ts`, called from `apps/server/src/boot.ts`).

- One file per process: a single shared file let the last server started, or stopped, hide the others.
- Never during `next build` (no PORT). Dev servers do advertise (the user runs dev code).
- Own entry removed on `exit`; entries of killed processes pruned at boot (`isPidAlive`, now in `infra/pid.ts`).
- `appBaseUrl()` (AO_BASE_URL > PORT > 3000) is shared with the permission bridge (`runs.ts`).
- The mod tries entries newest first, then `:3000`, and keeps the first `/api/health` that answers
  `{available, version}`; a `baseUrl` override in the mod config wins outright.

### 2. Agent status for the mod

Today `/api/events` sends `{ at }` per event type and no ids — fine for the browser (it refetches),
useless for "which entity should look busy". Do the cheap thing, not an event-payload rewrite:

- **New `GET /api/agent-status`** → `[{ agentId, instanceId, projectId, conversationId, state }]`,
  `state ∈ idle | working | needs_you`. Built from the `conversations` rows (`status`, `activeRunId`)
  plus `permissions.listPending()` (a parked approval on the active run ⇒ `needs_you`;
  conversation `needs_attention` ⇒ `needs_you`).
  - Domain service `services/execution/agent-status.ts` (pure mapping, unit-tested);
    states as a const array in `config/agent-status.ts` (convention: const array + type + guard).
  - Route stays a thin controller.
- **New app event `permissions:changed`** — emitted when a permission request parks and when it
  resolves/times out (`permissions.ts`). Today parking only goes to that run's SSE stream, so
  nothing app-wide hears it.
- Mod: one `/api/events` connection; on `runs:changed` / `conversations:changed` /
  `permissions:changed` it refetches `/api/agent-status` and pushes the owner's states to the server.
- Browser benefits too: the iso view can show "needs you" without a per-run stream.

### 3. Contract tests — pin what the mod depends on

`apps/server/src/routes/mod-contract.test.ts`, same style as `generated-images-route.test.ts`
(temp HOME, import the route, call the handler), or through `createHandler(ROUTES)` from
`apps/server/src/index.ts` to cover routing too. Response schemas for these endpoints go in
`packages/api-contract` next to the request schemas. One test per endpoint the mod uses, asserting
the **response shape the Java side parses**, not internals:

| Mod needs | Endpoint |
|---|---|
| is the app up | `GET /api/health` |
| agent picker | `GET /api/agents` |
| project picker | `GET /api/projects` |
| place entity | `POST /api/projects/:id/roster` |
| dismiss entity | `DELETE /api/projects/:id/roster/:instanceId` |
| open chat | `POST /api/conversations` |
| send message | `POST /api/conversations/:id/messages` |
| live reply | `GET /api/runs/:id/stream` (event names: chunk/tool/usage/done/error) |
| approvals | `GET/PATCH /api/runs/:id/permission` |
| entity status | `GET /api/agent-status`, `GET /api/events` |
| world tools (4) | the world-action endpoints below |

Plus a short "Minecraft mod" section in `docs/architecture.md` pointing at this table, so whoever
renames a field sees the test fail and knows why.

### 4. World tools — agents act in Minecraft

Same park-and-answer pattern the permission bridge already uses (`scripts/mcp-permission-server.mjs`
→ `POST /api/runs/:id/permission` parks → UI answers via `PATCH`):

```
agent ──calls──► mcp__minecraft__walk_to(x,y,z)
                 (stdio MCP server, scripts/mcp-minecraft-server.mjs, spawned by claude)
          ──POST──► /api/runs/:id/world-action          parks, emits world:changed
mod (owner's client) ◄── /api/events + GET pending actions
          ──packet──► Minecraft server: validates (owner, range, loaded chunk), executes
          ──PATCH──► /api/runs/:id/world-action          result back to the agent
```

- Only attached to runs that belong to a Minecraft-placed instance (flag on the roster instance,
  e.g. `embodied: "minecraft"`), via the existing `mcpArgs` in `summon.ts`.
- Fail closed like the permission bridge: no mod connected / timeout ⇒ the tool returns an error.
- **The server validates every action** as if a player with limited abilities asked. The agent never
  gets anything the owner couldn't do, and never touches other players' stuff.
- Start read-only + harmless: `where_am_i`, `look_around` (nearby blocks/entities), `walk_to`,
  `follow_owner`, `say` (chat bubble, owner only). Mining/placing comes after that works.

## Mod (NeoForge 1.21.1; built first on Forge 1.20.1)

Code split so other loaders/versions are cheap later:
- **core** (plain Java, no Minecraft imports): discovery, HTTP + SSE client, JSON models, chat state.
- **client** (thin, NeoForge): entity, wand item, screens, packets, keybind.

Phase 1 — "fuck around with the tech":
1. Gradle project from the Forge 1.20.1 MDK; core client tested outside Minecraft against the running app.
2. Wand item: right-click a block → screen lists agents + projects (from the local app) → client sends a
   packet → server spawns the owned villager entity → owner's client adds the roster instance.
3. Owner right-clicks the entity → chat screen (history + input + streamed reply).
4. Status over the entity's head from `/api/agent-status`.
5. Wand shift-right-click on own entity → dismiss (removes roster instance after confirm).

Phase 2: world tools (app change 4). Phase 3: looks — skins per agent, sprites from the app, etc.

## Prior art: wrxck/AgentCraft (reviewed 2026-10-09)

Spigot 1.21.1 **server plugin** (Bukkit API + ProtocolLib, Java 21, Maven), not Forge. Brains run on
the server (`claude` via `sudo -u claude … --dangerously-skip-permissions`), plus Postgres, Qdrant and
an embeddings service. **License: "TBD", none on GitHub ⇒ all rights reserved — do not copy code.**
Not a starter (wrong platform, opposite architecture). Ideas worth re-implementing ourselves:

- **Compact ASCII surroundings** (`CompactScanner`): 21×21 top-down grid + small vertical slice + a
  one-line char legend, ~200 tokens. Use as the output format of our `look_around` tool.
- **Tool catalogue** (35 tools: goto, follow, mine, gather, place, craft, smelt, farm, store_items, …) —
  a ready-made roadmap for phase 2+. Their tool shape (name, description, JSON schema, execute) maps 1:1
  onto MCP tool definitions.
- **Action queue on the server tick**: tool calls become sequential multi-tick actions. Our
  world-action should resolve when the action *finishes* (arrived / failed / timed out), not when queued.
- Later: chunk force-loading around working agents; long "expedition" jobs.

Avoid: their text-parsed `TOOL_CALL:` protocol (their own last commit fixes agents "just talking about"
tools) — we use real MCP tools. Custom A* and packet-faked NPCs — Forge gives us real entities and
vanilla `PathNavigation`.

## Prior art: blendi-remade/agentcraft (reviewed 2026-10-09)

**MIT** (cherry-pick allowed; keep its copyright + license notice on anything copied — GPL-compatible).
611★, created 2026-10-03, very active. Same split as ours: a Node backend ("Foreman") owns all state and
runs the agents; the mod is "the window and the controls", talking over **localhost WebSocket, no
Origin header** (same guard as our `proxy.ts`). Close the game, agents keep working.

Not a starter for us: **Fabric, Minecraft 26.3, Java 25**, singleplayer, dev-client only, and it builds
its own HQ studio into the world. Its client code (~90% of the mod) is written against 26.x rendering/
GUI/entity APIs that differ heavily from 1.20.1 — that is a rewrite, not a port. The Foreman duplicates
Agent Office (own orchestrator, task graph, worktrees; API key by default).

Worth taking (re-written against Forge 1.20.1; plain-Java parts port almost directly):
- **Client-only agent entities** (`ClientAgentEntity`: "never exists on the server", client-side
  `GridPathfinder`, seats, speech bubbles, nameplates). Changes our design — see Decision below.
- **Richer agent state** for nameplates/particles: `thinking | reading | editing | running | testing |
  waiting_user | blocked | done | error` + a ≤48-char activity line ("editing src/cli.ts"). Derivable
  from tool events Agent Office already streams.
- **Link pattern** (`ForemanLink`): snapshot on connect then deltas, reconnect with backoff
  (0.25 s → 5 s), silence watchdog, all network off the render thread.
- **Decision queue UX**: one key answers the oldest open question/permission; desktop notification.
- **DevBridge**: localhost bridge inside the mod for scripted camera + screenshots → agents can QA the
  mod visually. **Sim backend** + `fake-mod.ts`: scripted agents for free dev/testing, no tokens.
- **Protocol doc generated from schemas** with a check — same goal as our contract tests.
- Unrelated to Minecraft but good for Agent Office: `foreman/src/gitsafety.ts` blocks `git push`
  via env-scoped git config, not just a command filter.

### Decision needed: where do agent bodies live?

- **Client-only (their approach):** nothing installed on the server, works on any server, only the
  owner sees their agents — privacy for free. Can't change the world (mining/placing needs the server).
  No registered wand item; placing via keybind/client command (or detect a vanilla item in hand).
- **Server entities (our current plan):** everyone sees them, they can act on the world; mod required
  on the server, owner checks needed.
- Hybrid: client-only bodies for phase 1, optional server half later for world actions.

## Phase 2: the Agent Tablet + chat parity (designed 2026-10-09; first slice built, see "Built (0.3.0)")

### The Agent Tablet (handheld, map-style)

Prior art borrowed (ideas, not code, unless noted):
- **CC:Tweaked pocket computer** — live screen drawn on the held item exactly like a map: one-handed when
  something is in the other hand, two-handed and bigger when not. Hook: `RenderHandEvent` (cancel it, draw our
  own), mirroring vanilla `ItemInHandRenderer.renderOneHandedMap/renderTwoHandedMap`. Its
  `ItemMapLikeRenderer`/`PocketItemRenderer` are **MPL-2.0** (file-level, GPL-compatible) — those two may be adapted
  with their headers kept; `PocketComputerItem` is CCPL, don't copy.
- **AE2 / Mekanism + Curios** — a hotkey opens the device while it's anywhere in the inventory (our `K`).
- **MineColonies clipboard** — bind by using it on something: use the tablet on an agent's body to bind it.
- **Create** — Engineer's Goggles HUD tooltip (look at a body → status, current tool, cost); Linked
  Controller's animated in-hand model; Clipboard opens a client-only screen.

Behaviour:
- Hold it → the bound agent's live face in first person: name, status light (idle / working / needs you),
  current tool, last lines of the reply. Unbound → list of agents with status lights.
- Right-click → full chat screen. Sneak + right-click a body → bind. Tablet in inventory + an agent needs you
  → sound + toast.

**Real item vs client-only.** Inventories are server-side, so a registered item (`agentoffice:tablet`)
exists only where the server has the mod: singleplayer/LAN (the integrated server runs our jar) and modded
servers. Checked in NeoForge 21.1.257 source: on a NeoForge server without the mod the client's extra item is
dropped from the id map without disconnecting (`RegistryManager.applySnapshot`); vanilla servers have no registry
check (`NetworkRegistry.initializeOtherConnection`). So the mod stays installable client-only — the tablet simply
isn't there, `K` still is. Alternative: re-skin a vanilla item (a book renamed "Agent Tablet" gets our model via a
client item property) — works on every server but needs an anvil and looks like a book to others.
**Recommended: real item**, `@Mod` dist widened so the integrated server registers it.

### Chat parity (API inventory: all endpoints exist; mod covers send/stream only)

| Feature | API | Notes |
|---|---|---|
| Markdown | stored output and `chunk` text are markdown | Same subset as the web (`apps/web/src/lib/markdown.ts`, `message-format.ts`): headings, bold/italic, inline + fenced code, lists, links, GFM tables. Parse with commonmark-java (BSD-2, jar-in-jar) in `core/` → Minecraft `Component`s; code in the `minecraft:uniform` font on a dark box; links clickable |
| Model | `PATCH /api/projects/:p/roster/:i {model}` | Per seat (instance), wins over the agent default; next run. Aliases `haiku, sonnet, opus, fable` (`config/models.ts`); `default` = agent's own |
| Effort | same, `{effort}` | `low, medium, high, xhigh, max` + `default` (`config/agent-opts.ts`) |
| Stop | `POST /api/runs/:id/abort` | conversation goes `needs_attention` |
| Retry / resume / skip | `POST /api/conversations/:id/retry\|resume\|skip` | replaces "open Agent Office to retry" |
| Approvals | `GET/PATCH /api/runs/:id/permission {id, decision}` | `permission-request` isn't replayed → GET after every re-attach; auto-deny after 5 min |
| Tool lines | SSE `tool` / `tool-done` | `tool` arrives twice per call (empty input, then full) → dedupe by `toolUseId` |
| Usage | SSE `usage`, `done` | tokens + cost per turn |
| New thread | `POST /api/conversations/:id/new` | `/clear` in the web |
| Later | uploads (`POST /api/projects/:p/uploads`) | "send a screenshot to the agent" |

The web UI has no per-seat model picker yet; the mod would be the first user of `PATCH roster {model, effort}`
— pin it in the contract tests (app change 3).

### Proposed order
1. ~~LDLib2 spike~~ — dropped: the vanilla UI is good enough (user, 2026-10-09). Was: LDLib2 spike on the chat screen **with markdown** (parser in `core/` is reusable either way). Decides the
   UI toolkit before pickers, cards and buttons multiply.
2. Chat parity: model/effort, stop, approvals, retry/skip, tool lines, usage.
3. Agent Tablet item (map-style render, bind, notifications).
4. ~~Goggles-style HUD on bodies~~ — not needed for now (user, 2026-10-09). App change 2 (`/api/agent-status`) can
   still replace per-body polling later.

### Built (0.3.0, 2026-10-09) — user decisions: real item, chat like Agent Office, images, seat management

- **UI toolkit: vanilla, no LDLib2.** LDLib2 has no markdown widget, so the transcript is custom drawing either
  way, and it brings native layout libs. Own small kit in `client/ui/`: `Theme` (Agent Office palette),
  `FlatButton`/`FlatCycle`, `Composer` (flat multi-line input), `TabletScreen` (device bezel over the world).
- **Chat** (`ChatScreen` + `TranscriptView`): parity ports in `core/` — `Markdown` (splitProse / ProseBlock /
  inlineMd, streaming-prefix tests ported), `Transcript` (turnToThreadItems + applySseEvent, tool dedupe by
  toolUseId, spawn suppression), `Images` (extractImages, loopback + PNG/JPEG/GIF/BMP only). Renders You cards,
  agent label, headings/paragraphs/lists (source markers kept)/code boxes (uniform font)/tables, tool rows
  (>8 in a row collapse behind "N TOOL CALLS", like the web), done divider (time · tokens · cost), error cards,
  image thumbnails (click → `ImageScreen`), clickable http(s) links. Header: model + effort pickers (PATCH the
  roster seat at once, next message), New thread. Composer: Enter sends, Shift+Enter newline; Send→Queue and
  **Stop** while running; Retry/Resume/Skip bar on needs_attention; Allow/Deny cards for parked permissions
  (polled every 5 s + on attach, since `permission-request` isn't replayed).
- **Tablet home** (`OfficeScreen`, K key or the item): projects sidebar, seats with live status / model / effort /
  permission mode; Chat, Place/Move, ⚙ `SeatSettingsScreen` (label, model, effort, permissions; "" clears),
  ✕ remove (confirm: deletes the seat's worktree), `+ Add agent` (`AddAgentScreen`, filter, 409 soft-cap confirm).
- **Item** `agentoffice:tablet` (`TabletItem`): placeholder texture `minecraft:block/observer_front`; recipe
  iron ×7 + glass pane + redstone; Tools & Utilities tab. Use → tablet home (client hook, no client classes in the
  item). Using it while looking at a body opens that agent's chat (body click wins).
- **Not yet:** map-style first-person render of the held tablet, binding a tablet to an agent, own texture,
  in-game uploads (screenshot → agent), sub-agent cards, rate-limit schedule-resume, queue editing.
- Dev checks: `-PaoOpen=office|chat:p:i:a|hold|tablet|egg|shell`, `-PaoScroll=N -PaoScrollDown=M` (wheel notches before the
  shot), `-PaoPress=Label` (press the first button with that label). **Scripted checks are read-only**: their client
  refuses every mutating call (`AgentOfficeClient.readOnly()`), because the window opens on the user's desktop.

### Built (0.4.0, 2026-10-09) — Agent Spawn Egg

- `agentoffice:agent_spawn_egg` (`AgentEggItem`): vanilla `template_spawn_egg` model, villager brown `#563C33` with
  lavender spots `#B49BE0` (vanilla: tan `#BD8B72`). Spawn Eggs tab; recipe egg + emerald + redstone (shapeless).
  Used on a block (vanilla SpawnEggItem placement rule) → an unassigned **shell**: client-only body, nitwit robe,
  nameplate "Unassigned agent · right-click to set up". The egg is used up outside creative (server half).
- A shell has no seat, so it can never open a chat: right-click → `AgentSetupScreen`: agent (filter) → project.
  It talks to that agent's first seat there, or a new one when it has none (POST roster, 409 soft-cap confirm). The
  shell then becomes the agent's body in place (`BodyStore.assign`) and the chat opens. "Remove shell" deletes it.
  Why a project at all: a projectless agent chat runs with no cwd (wherever the app process runs), so setup always
  lands on a real project seat.
- `BodyStore.Body` carries `shell` (id) when `slot` is null; old files (no `shell`) load unchanged.

### Changed (0.5.0, 2026-10-10) — agents look like people (player model + skins)

User: wants agents like AgentCraft's cast sheet. AgentCraft draws agents with the vanilla player model and 64x64
two-layer skins; we do the same.
- A set-up body is still a client-only villager to the game, but `AgentBodyRenderer` (cancels `RenderLivingEvent.Pre`)
  draws it with `PlayerModel` (wide or slim) and the agent's skin. Shells stay nitwit villagers.
- Skin, first found wins (`AgentSkins`): `config/agentoffice-skins/<agentId>.slim.png` or `<agentId>.png` (64x64,
  the folder is made with a README; F3+T re-reads it) → built-in character by agent-name prefix (`core/AgentLooks`) →
  a Minecraft default skin picked from the agent name.
- Built-in cast: AgentCraft's six skins (MIT, `assets/agentoffice/textures/entity/agent/LICENSE-agentcraft.txt`):
  Kit (developer, devops, …), Rowan (qa-*, security, sre), Tove (tech-writer, qa-visual, web-qa), Wren (designer,
  frontend*), Marlow (orchestrator, planner, cs-*, product-manager), Juniper (explore, researchers, analysts).
- Later: a real 3D outer layer (voxels, like the 3D Skin Layers mod, which only does players) in our own renderer.

### Changed (0.5.0, 2026-10-10) — one body per agent per project

User: "there wouldnt be 5 developers, instead its 1 developer that manages all developer instances in this project".
- The egg setup no longer asks for a seat (above). Bodies are keyed `projectId/agent:agentId`. A shell set up for an
  agent already standing in that world moves that body here, still talking to the same seat (an overlay says so).
- Old `agentoffice-bodies.json` files (a body per seat) load as one body per agent: the last placed wins.
- Tablet rows: **Place** (no body), **Move** (the seat the body talks to), **Use** (another of its seats: moves the body
  and switches it to this seat). Removing a seat (✕) takes the body only if the body talks to that seat.
- The chat header's **Seats N** button (`SeatPickerScreen`) lists the agent's seats in the project with their status,
  marking "this chat" and "body". **Use** switches the chat, and the body keeps standing where it is
  (`BodyStore.retarget`). Back/Esc returns to the same chat (draft kept). **+ New seat** adds one (`SeatAdder`,
  shared with the egg setup: soft-cap confirm, and after a timeout it waits up to 2 min for the seat to appear, since
  the server makes the worktree before listing the seat, rather than letting a retry make a second).



## Dev loop

- **Phase 1 = client-only bodies** (agreed 2026-10-09). Server half only when world actions arrive.
- `gradlew runClient` (ModDevGradle) = NeoForge + this mod only, own `run/` folder, separate from the
  real `.minecraft` and CurseForge instances.
- Auto-join a dev world on launch: `--quickPlaySingleplayer <world>` in the `runClient` args (1.20+).
  The world: superflat, peaceful, `doDaylightCycle`/`doWeatherCycle`/`doMobSpawning` false, low render distance.
- Fewer restarts: debug-run + JVM hotswap for method-body edits (JetBrains Runtime's enhanced class
  redefinition also allows new methods/fields); `F3+T` reloads textures/models/lang. Restart needed for
  new classes, mixins, registrations (phase 1 registers nothing).
- Most logic lives in the plain-Java core → JUnit tests, no game launch.
- Agent Office "sim" mode (scripted agents) to iterate on visuals without spending tokens.
- Compatibility check at milestones only: drop the built jar into a CurseForge test profile with a real pack.
- Machine setup: Gradle 9 runs on the installed Temurin JDK 17; the foojay toolchain resolver downloads JDK 21 for compiling and `runClient` by itself.

## Order of work

1. App change 1 (discovery) + its tests.
2. App change 2 (status endpoint + `permissions:changed`) + tests.
3. App change 3 (contract tests + doc section).
4. Mod phase 1.
5. App change 4 + mod phase 2.

## Open question

- Where does the mod code live — `apps/minecraft-mod/` in this repo (API and mod change together,
  contract tests next door) or its own repo like `pixel-planets`? Recommendation: this repo for now.
