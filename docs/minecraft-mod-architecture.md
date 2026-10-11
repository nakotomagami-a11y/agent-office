# Minecraft mod — architecture

Status: **approved 2026-10-10, being built in four parts, each reviewed by QA before the next.** Started from two
read-only reviews of `main` at ff64d3a (a maintainability inventory and an architecture review).

| Part | Scope | State |
|---|---|---|
| 1. Structure | package moves, layer rules, one home per value, contract test, pre-0.6.0 migration deleted | done (#193) |
| 2. Client services | `AgentOffice.call`, one status poller (`AgentState`/`AgentStatus`), `WorkspaceStore`, `core/ChatSession` | done (#195) |
| 3. Behaviour and stats | `ai/` package, payload split, Minecraft-side tests, levels | built, in review |
| 4. Docs | every mod doc checked against the code | last |

## Verdict (from the review)

The skeleton was sound; the inside of the client was not.

- **Solid, kept:** `core/` is pure Java and tested; nothing common imports client code; every client→server payload
  is validated (owner, reach, limits, cooldown); items live in the world record, not the entity; scripted dev checks
  run read-only. Moving packages is save- and network-safe (registry ids and payload ids, never class names, are
  persisted).
- **Fixed in part 1:** the API contract was copied by hand with nothing checking it, and had drifted (the mod
  handled `auth_required`/`rate_limited`; the server sends `auth_expired` and has no `rate_limited`).
- **Fixed in part 2:** status was polled three times per seat; `ChatScreen` (963 lines) held a whole chat state
  machine; app state hid in `WorkspaceScreen` statics; failures other than I/O could leave a screen waiting forever.
- **Fixed in part 3:** agent behaviour was spread over `AgentEntity`, `AgentGoals` and the mod constructor;
  nothing Minecraft-side was tested.
- **Not a problem:** `TranscriptView` (a markdown/table/code renderer — its size is its job), `ReviewScreen`'s size,
  `AgentMenu`'s pixel layout (vanilla does the same).

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
                              AgentState, Ids, formats, stores
```

`ArchitectureTest` (in `apps/minecraft-mod`, part of `gradlew test`) checks the source with comments removed. Rule
ids and their reasons are in `docs/conventions.md`.

| Rule | Meaning | State |
|---|---|---|
| `mod.core-pure` | `core` imports only `java.*`, Gson, SLF4J, `core` | enforced |
| `mod.common-no-client` | nothing outside `client` names `client`, `net.minecraft.client`, `com.mojang.blaze3d` | enforced |
| `mod.ui-leaf` | `client.ui` names no screen/service/render code | enforced |
| `mod.api-paths-one-place` | `"/api/` only in `core/Routes` | enforced |
| `mod.status-vocab` | server words compared only through `core/Protocol` / `core/RunErrors` | enforced |
| `mod.screen-no-io` | screens start no threads/executors and hold no mutable statics | enforced |
| `mod.ai-no-net` | `ai` never names payloads, menus or client code | enforced |

## Single sources (the "one place" for values)

| What | Home | Pinned by |
|---|---|---|
| API paths | `core/Routes`: one method per `API_ROUTES` key; `fill()` encodes each segment | `apps/server/src/minecraft-mod-contract.test.ts` |
| Server words: statuses, stream events, conversation actions, review and API error codes, PR link sources | `core/Protocol` (one nested class per TypeScript vocabulary) | contract test: every value is one the server sends |
| Run error codes and their titles | `core/RunErrors` (the web's `errors.run.*.title`) | contract test: exactly `RUN_ERROR_CODES`, titles equal the web's |
| Values copied from the server/web: model, effort and permission lists, 50 MB upload cap, gh timeout, attachments intro, agent-name variants | `core/ServerMirror` | contract test reads each source |
| Mod id, logger, daemon threads | `core/Ids` | — |
| Files and dirs: lecterns JSON, skins dir, temp paste file, home, SavedData name | `ModPaths` (root package: it needs `FMLPaths`) | — |
| Timing: status report every 5 s, server floor 1 s, "working" holds 30 s, 1 work XP per 5 min | `Tuning` (root package) | — |
| Tablet colours, vanilla container greys, panel and slot drawing | `client/ui/Theme` (+ `Theme.Vanilla`), `client/ui/VanillaGui` | — |
| Dev flags | `build.gradle` passes every `-PaoName` through as `agentoffice.dev.name`; `DevHooks` owns the defaults | `ArchitectureTest.everyDevFlagReachesTheGame` |
| Payload records, codecs, limits | `AgentPayloads` (handlers: `AgentNet`). **Rule:** add payloads freely (an optional channel tolerates one the other side lacks); a payload older jars still send stays registered as a no-op (`Migrate`); changing a codec needs a version bump, which refuses every login between mismatched jars | `PayloadsTest` (round trips; the exact bytes, so a codec change fails until the version is bumped; oversized input refused on decode) |

Kept out on purpose: single-use constants stay next to the one place that uses them, sizes and row heights included
(the proposal's `Theme.Metrics` was dropped: each is used by one screen).

The API copy stays hand-written (≈20 endpoints, lenient Gson parsing): generating Java from zod would add a toolchain
to two builds. The TS-side contract test makes a server rename fail `pnpm -r test`.

## Client services (part 2)

- `core/Async` runs work off the main thread and always reports how it ended, failures of any kind included.
  `client/service/AgentOffice` is its Minecraft side: the connection, `call(...)`, `later(...)`.
- `core/ChatSession` is a chat without its screen: reading, following the live run, retries and reconnecting, approvals,
  seat changes, attachments, send/stop/act. Tested against a fake Agent Office (`ChatSessionTest`).
- `client/service/AgentStatus` is the one status poller: screens and the world's bodies say which agents they watch;
  each is asked once a round. The owner's nameplate shows its `AgentState`, drawn by `AgentRenderer`.
- `client/service/WorkspaceStore` holds what the tablet knows of the office across screens.
- `client/service/SeatAdder` is the only way a seat is added, so a slow worktree that times out never becomes two seats.

## Behaviour and stats (part 3)

- `ai/Schedule` decides where an agent keeps near: a shell its spot; its lectern while it works; the village bell at
  meeting time (9000-11000), the village otherwise; where it was put when there is no village. One pure function, tested.
- `ai/VillageSense` finds and keeps its village's bell; `ai/Combat` holds who it fights and how (threat, foe, hostile,
  the shot) and the world's combat listeners; the goals (`WanderGoal`, `MeleeGoal`, `BowGoal`) moved unchanged.
  The same fight (an armed agent, a zombie 6 blocks away) logs the same before and after the move.
- Tests now run with the game loaded (ModDevGradle `unitTest`): `PayloadsTest` (every payload round-trips, limits
  refused), `AgentRecordsTest` (records with enchanted items, Curios and XP survive save and load), `ScheduleTest`.
- **Stats are gameplay.** An agent has health, takes damage and can be killed (its items are kept). Only armor and
  weapons change what it can do in a fight; everything else it wears is cosmetic.
- **Levels:** XP from kills (the mob's own XP reward, as a player would get) and, slowly, from work (1 XP per 5 minutes
  working). Every agent starts at level 1; level *n*→*n*+1 costs `20 + 10·n` XP (`core/Levels`). Kept on
  `AgentRecords.Record`, so a level survives death, moves and a dismiss (placed again, it is the same level). Sent to
  its owner only, in the optional `Stats` payload (another entity data field would disconnect older clients, and nobody
  else needs it); shown on the owner's nameplate ("Lv 3") and the inventory screen; the owner is told of each new
  level. No effects yet. Kill XP follows vanilla's rules (no baby, no `doMobLoot`, once per death). Work XP trusts the
  owner's client to say its agent works (the server can't ask Agent Office), so a modified client earns at most that:
  12 XP an hour.
- Also in part 3, from the security review: placing an agent asks land-claim mods first (it posts the block-place event
  a claim mod listens for, as if the player put something there); a player's snow golem no longer counts as hostile.

## Decisions (answered 2026-10-10)

1. Stats: they already change gameplay (health, death); levels come on top, from kills and slowly from work.
2. The pre-0.6.0 migration (`BodyStore`, the client's migration, the server's handler): deleted in part 1. The
   `Migrate` payload stays registered and ignored, and the channel stays `"1"`, so 0.7.x and 0.8.0 still play
   together. (QA caught the first attempt: bumping the version to `"2"` makes NeoForge refuse every mixed login,
   optional channel or not.)
3. Package moves: done in part 1.
