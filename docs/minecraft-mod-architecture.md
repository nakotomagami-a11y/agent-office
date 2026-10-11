# Minecraft mod — architecture

How `apps/minecraft-mod` is put together. What it does for the player: `minecraft-mod.md`.

## Layers and rules

```
dev.agentoffice.mc            both sides: registries, entity, records, menu, AgentNet (handlers), AgentPayloads, ModPaths, Tuning
  .ai                         behaviour: Schedule, Anchor, VillageSense, Combat, the goals
  .client                     setup, dev hooks
    .service                  work and shared state: AgentOffice, AgentStatus, WorkspaceStore, SeatAdder, Bodies,
                              Lecterns, ClipboardImages
    .screen                   screens
    .render                   renderers, skins, Curios layer
    .ui                       widgets, Theme, VanillaGui, TranscriptView (a leaf)
  .core                       pure Java: HTTP client, ChatSession, Async, Routes, Protocol, RunErrors, ServerMirror,
                              AgentState, Levels, Ids, formats, stores
```

`ArchitectureTest` (part of `gradlew test`) checks the source with comments removed. Rule ids and their reasons are
in `docs/conventions.md`.

| Rule | Meaning |
|---|---|
| `mod.core-pure` | `core` imports only `java.*`, Gson, SLF4J, `core` |
| `mod.common-no-client` | nothing outside `client` names `client`, `net.minecraft.client`, `com.mojang.blaze3d` |
| `mod.ui-leaf` | `client.ui` names no screen/service/render code |
| `mod.api-paths-one-place` | `"/api/` only in `core/Routes` |
| `mod.status-vocab` | server words compared only through `core/Protocol` / `core/RunErrors` |
| `mod.screen-no-io` | screens start no threads/executors and hold no mutable statics |
| `mod.ai-no-net` | `ai` never names payloads, menus or client code |

## One place for each value

| What | Home | Pinned by |
|---|---|---|
| API paths | `core/Routes`: one method per `API_ROUTES` key; `fill()` encodes each segment | `apps/server/src/minecraft-mod-contract.test.ts` |
| Server words: statuses, stream events, conversation actions, review and API error codes, PR link sources | `core/Protocol` (one nested class per TypeScript vocabulary) | contract test: every value is one the server sends |
| Run error codes and their titles | `core/RunErrors` (the web's `errors.run.*.title`) | contract test: exactly `RUN_ERROR_CODES`, titles equal the web's |
| Values copied from the server/web: model, effort and permission lists, 50 MB upload cap, gh timeout, attachments intro, agent-name variants | `core/ServerMirror` | contract test reads each source |
| Mod id, logger, daemon threads | `core/Ids` | — |
| Files and dirs: lecterns JSON, skins dir, temp paste file, home, SavedData name | `ModPaths` (root package: it needs `FMLPaths`) | — |
| Timing: status report every 5 s, server floor 1 s, "working" holds 30 s, 1 work XP per 5 min | `Tuning` | — |
| Level curve | `core/Levels` | `LevelsTest` |
| Tablet colours, vanilla container greys, panel and slot drawing | `client/ui/Theme` (+ `Theme.Vanilla`), `client/ui/VanillaGui` | — |
| Dev flags | `build.gradle` passes every `-PaoName` through as `agentoffice.dev.name`; `DevHooks` owns the defaults | `ArchitectureTest.everyDevFlagReachesTheGame` |
| Payload records, codecs, limits | `AgentPayloads` (handlers: `AgentNet`) | `PayloadsTest` |

Single-use constants stay next to the one place that uses them, sizes and row heights included.

The API copy is hand-written (≈20 endpoints, lenient Gson parsing): generating Java from zod would add a toolchain to
two builds. The TS-side contract test makes a server rename fail `pnpm -r test`.

## Client side

- `core/AgentOfficeClient` is the HTTP + SSE client: `java.net.http.HttpClient` pinned to HTTP/1.1 (the default h2c
  upgrade makes Agent Office's Node server drop the connection), JSON through Gson. No other dependencies.
- `core/Async` runs work off the main thread and always reports how it ended, failures of any kind included.
  `client/service/AgentOffice` is its Minecraft side: the connection, `call(...)`, `later(...)`.
- `core/ChatSession` is a chat without its screen: reading, following the live run, retries and reconnecting, approvals,
  seat changes, attachments, send/stop/act. `ChatScreen` only lays out, takes input and draws.
- `client/service/AgentStatus` is the one status poller: screens and the world's bodies say which agents they watch;
  each is asked once a round.
- `client/service/WorkspaceStore` holds what the tablet knows of the office across screens.
- `client/service/SeatAdder` is the only way a seat is added, so a slow worktree that times out never becomes two seats.
- `client/service/Bodies` maps the player's bodies to seats (from the server's `Placed`) and, every 5 s, tells the
  server which of them work and at which lectern.

## World side

- `AgentEntity` is the body; `AgentRecords` (world `SavedData`) owns what outlives it: seat, which entity is the body,
  items in vanilla `Inventory` indexing, Curios stacks, XP. Equipment writes through to the record, so vanilla
  attributes, enchantments and syncing just work. A body whose id is no longer its record's discards itself.
- `ai/Schedule` decides where an agent keeps near (one pure function); `ai/VillageSense` finds its village's bell;
  `ai/Combat` holds who it fights, what may hurt it, kill XP and the world's combat listeners; the goals
  (`WanderGoal`, `MeleeGoal`, `BowGoal`) act on that.
- `AgentNet` handles every payload and checks it (owner, reach, limits, cooldown, land claims: `mayBuild`, which the
  Spawn Egg uses too). Curios types stay in `CuriosBridge`/`CuriosLayer`, loaded only when Curios is.

## Network compatibility

The client joins servers without the mod: the payload channel is optional, and a NeoForge server without the mod
drops the client's extra blocks, items and entity from the id map instead of refusing it (vanilla servers don't check;
checked in NeoForge 21.1.257's source). The channel's version is `"1"`:

- **Add payloads freely**: an optional channel tolerates one the other side lacks.
- A payload older jars still send stays registered as a no-op (`Migrate`).
- **Changing a codec needs a version bump**, and a bump refuses every login between mismatched jars. `PayloadsTest`
  pins the exact bytes of Place, Status, Placed, Migrate and Stats, so a change to those fails until the version is
  bumped (the others share their parts).
- A new entity data field disconnects older clients: data only the owner needs goes in an owner-only payload (`Stats`).
- Saves and the network name registry and payload ids, never Java classes, so moving a class is safe.

## Tests

| Command | What | Where |
|---|---|---|
| `gradlew test` (in `build`) | `core/` logic (the HTTP client and chat against fake servers); the game loaded (ModDevGradle `unitTest`) for payloads, records, schedule; `ArchitectureTest` | `src/test` |
| `gradlew runGameTestServer` | in a real world: kill XP, death loses XP, desk-only work XP, agents never hurt villagers, a Spawn Egg asks land claims | `src/gametest` (dev runs only, never in the jar) |

CI runs both (`.github/workflows/ci.yml`, job `minecraft-mod`).
