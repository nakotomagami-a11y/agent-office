import { NextResponse } from "next/server";
import { rmSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readdirSync } from "node:fs";
import { db, agents, projects, paths } from "@agent-office/domain/services";
import { seedShowcase, clearShowcase } from "./showcase";

const DECORATIONS = `{"12,12":["house1"],"15,17":["house2"],"15,22":["tower"],"20,10":["castle"],"24,18":["gold_mine_active"],"23,18":["cursed_chest"],"16,9":["tree2"],"17,8":["tree2"],"17,9":["tree"],"24,8":["tree"],"17,21":["tree3","mushroom2"],"16,21":["tree4","mushroom1"],"14,21":["shrub3"],"16,16":["shrub5"],"11,13":["sheep"],"13,15":["sheep"],"18,17":["pumpkin2"],"17,14":["pumpkin1"],"21,13":["gravestone"],"16,10":["bush3"],"10,10":["bush3"],"17,17":["bush3"],"16,24":["bush3"],"23,17":["bush3"],"22,18":["bush4"],"19,18":["bush"],"22,16":["bush"],"20,19":["rock2"],"23,21":["mushroom2"],"19,15":["mushroom2"],"23,12":["mushroom2"],"15,13":["mushroom2"],"16,14":["bridge_h"],"23,14":["duck"],"12,20":["duck"],"14,7":["duck"],"16,15":["water_rock2"],"18,16":["water_rock"],"24,9":["water_rock2"],"14,10":["water_rock4"],"25,18":["bones1","bone_sign"],"13,12":["bones1"],"17,13":["tree3"],"24,11":["tree4"],"25,20":["tree4"],"23,20":["shrub4"],"20,14":["shrub4"],"19,11":["shrub4","bush2"],"23,10":["shrub4"],"19,10":["shrub5"],"21,10":["shrub5"],"19,16":["shrub5"],"22,19":["shrub5"],"16,22":["shrub5"],"14,22":["shrub5"],"13,13":["shrub5"],"14,15":["shrub5"],"13,16":["shrub5"],"10,13":["shrub4"],"16,17":["shrub4"],"22,13":["shrub4"],"19,20":["stump3"],"25,10":["stump1"]}`;

const AGENTS_POS = {
  "20,8":  { agentId: "orchestrator",        instanceId: "orchestrator-j6n2w5" },
  "22,11": { agentId: "business-strategist", instanceId: "business-strategist-x5c1p2" },
  "25,13": { agentId: "web-researcher",      instanceId: "web-researcher-n9d6m8" },
  "19,13": { agentId: "developer",           instanceId: "developer-k4t8v3" },
  "22,15": { agentId: "frontend-craftsman",  instanceId: "frontend-craftsman-sc3en1" },
  "24,14": { agentId: "qa-codebase",         instanceId: "qa-codebase-r8h4z1" },
  "13,19": { agentId: "explore",             instanceId: "explore-b3f7q9" },
  "18,22": { agentId: "backend-builder",     instanceId: "backend-builder-m2p9x7" },
};

const PROJECT_MEMORY = `# Project Memory

## Stack
- Frontend: Next.js 15, React 19, Tailwind v4 CSS-first, TypeScript
- Desktop: Tauri 2 (Rust) + embedded Node.js standalone server
- Database: SQLite via better-sqlite3 (synchronous, no ORM)
- Packages: @agent-office/domain (DB, services, types)

## Conventions
- Token classes only — never \`style={{ color: "var(--acc)" }}\`, use \`text-acc\`
- All element resets in \`@layer base\` so Tailwind utilities always win
- Agent roster in project.md YAML frontmatter; memory in per-agent .memory.md files
- SSE endpoint \`/api/runs/:id/stream\` — NDJSON; never poll for output
- bypassPermissions on all agents; passwordless sudo on dev machine

## Architecture
- Isometric office floor: CSS transforms (rotateX + rotateZ), tile map in ui_settings SQLite table
- Run status derived client-side: running→working, done/error within 90s→done/error, else idle
- Sub-agent tracking: parent_run_id FK on runs table, children shown grouped in sidebar

## Current sprint
- Landing page polish (docs shared component, custom scrollbar, @layer base fix)
- Office floor tile placement UX improvements
- Pipeline orchestration UI for multi-step agent workflows`;

interface AgentDef {
  agentId: string;
  instanceId: string;
  prompt: string;
  model: string;
  toolCalls: Array<{ name: string; input: unknown }>;
}

const RUNNING_AGENTS: AgentDef[] = [
  {
    agentId: "frontend-craftsman",
    instanceId: "frontend-craftsman-sc3en1",
    prompt: "Redesign sidebar nav with framer-motion transitions and keyboard shortcuts",
    model: "claude-opus-4-5",
    toolCalls: [
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/components/layout/sidebar.tsx" } },
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/app/globals.css" } },
      { name: "Bash", input: { command: "grep -r 'framer-motion' /path/to/agent-office/apps/web/package.json" } },
    ],
  },
  {
    agentId: "backend-builder",
    instanceId: "backend-builder-m2p9x7",
    prompt: "Implement SSE reconnect logic with exponential backoff and run resume",
    model: "claude-opus-4-5",
    toolCalls: [
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/lib/sse.ts" } },
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/app/api/runs/[id]/stream/route.ts" } },
      { name: "Bash", input: { command: "grep -r 'EventSource\\|ReadableStream' /path/to/agent-office/apps/web/src --include='*.ts' --include='*.tsx' -l" } },
    ],
  },
  {
    agentId: "developer",
    instanceId: "developer-k4t8v3",
    prompt: "Add GitHub + Google OAuth2 SSO, session management, PKCE flow",
    model: "claude-opus-4-5",
    toolCalls: [
      { name: "Bash", input: { command: "ls /path/to/agent-office/apps/web/src/app/api/account/" } },
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/middleware.ts" } },
      { name: "Bash", input: { command: "cat /path/to/agent-office/apps/web/package.json | jq '.dependencies | keys'" } },
    ],
  },
  {
    agentId: "orchestrator",
    instanceId: "orchestrator-j6n2w5",
    prompt: "Orchestrate auth migration: research→implement→QA→UI across 4 agents",
    model: "claude-opus-4-5",
    toolCalls: [
      { name: "Read", input: { file_path: "/path/to/agent-office/packages/domain/src/services/summon.ts" } },
      { name: "Bash", input: { command: "curl -s http://localhost:3000/api/agents | jq '.[].name'" } },
    ],
  },
  {
    agentId: "qa-codebase",
    instanceId: "qa-codebase-r8h4z1",
    prompt: "Audit TypeScript: dead code, any-casts, missing error boundaries, coverage",
    model: "claude-opus-4-5",
    toolCalls: [
      { name: "Bash", input: { command: "cd /path/to/agent-office && pnpm tsc --noEmit 2>&1 | head -50" } },
      { name: "Bash", input: { command: "grep -r ': any' /path/to/agent-office/apps/web/src --include='*.ts' --include='*.tsx' | wc -l" } },
      { name: "Read", input: { file_path: "/path/to/agent-office/apps/web/src/app/providers.tsx" } },
    ],
  },
];

interface DoneAgentDef {
  agentId: string;
  instanceId: string;
  prompt: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durMs: number;
  hoursAgo: number;
}

const DONE_AGENTS: DoneAgentDef[] = [
  {
    agentId: "explore",
    instanceId: "explore-b3f7q9",
    prompt: "Research isometric tile approaches: canvas vs CSS transforms for office view",
    model: "claude-sonnet-4-5",
    tokensIn: 92_400,
    tokensOut: 7_800,
    costUsd: 1.34,
    durMs: 310_000,
    hoursAgo: 5,
  },
  {
    agentId: "business-strategist",
    instanceId: "business-strategist-x5c1p2",
    prompt: "Competitive analysis: Agent Office vs Cursor, Windsurf, GH Copilot Workspace",
    model: "claude-sonnet-4-5",
    tokensIn: 155_000,
    tokensOut: 12_200,
    costUsd: 2.41,
    durMs: 480_000,
    hoursAgo: 4,
  },
  {
    agentId: "web-researcher",
    instanceId: "web-researcher-n9d6m8",
    prompt: "SQLite WAL mode concurrent read benchmarks for 100k+ run history",
    model: "claude-sonnet-4-5",
    tokensIn: 67_800,
    tokensOut: 5_100,
    costUsd: 0.98,
    durMs: 195_000,
    hoursAgo: 3,
  },
];

interface HistoricalRun {
  agentId: string;
  instanceId: string;
  prompt: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durMs: number;
  daysAgo: number;
}

const HISTORICAL_RUNS: HistoricalRun[] = [
  // frontend-craftsman
  { agentId: "frontend-craftsman", instanceId: "frontend-craftsman-sc3en1", prompt: "Build isometric tile grid component with CSS transforms and viewport culling", model: "claude-opus-4-5", tokensIn: 88_000, tokensOut: 9_200, costUsd: 1.62, durMs: 360_000, daysAgo: 1 },
  { agentId: "frontend-craftsman", instanceId: "frontend-craftsman-sc3en1", prompt: "Implement React.memo + useMemo optimizations across office floor components", model: "claude-opus-4-5", tokensIn: 61_000, tokensOut: 5_800, costUsd: 1.05, durMs: 240_000, daysAgo: 2 },
  // backend-builder
  { agentId: "backend-builder", instanceId: "backend-builder-m2p9x7", prompt: "Design SQLite WAL schema: runs, messages, tool_calls with FK constraints", model: "claude-opus-4-5", tokensIn: 74_000, tokensOut: 6_400, costUsd: 1.21, durMs: 280_000, daysAgo: 1 },
  { agentId: "backend-builder", instanceId: "backend-builder-m2p9x7", prompt: "Migrate JSONL run history to SQLite with zero-downtime transition", model: "claude-opus-4-5", tokensIn: 103_000, tokensOut: 11_000, costUsd: 1.89, durMs: 420_000, daysAgo: 2 },
  // developer
  { agentId: "developer", instanceId: "developer-k4t8v3", prompt: "Wire up sub-agent tracking: parent_run_id FK, children API, SubAgentBlock UI", model: "claude-opus-4-5", tokensIn: 95_000, tokensOut: 8_700, costUsd: 1.55, durMs: 330_000, daysAgo: 1 },
  { agentId: "developer", instanceId: "developer-k4t8v3", prompt: "Implement undo/redo stack for office floor tile placement", model: "claude-opus-4-5", tokensIn: 52_000, tokensOut: 4_900, costUsd: 0.87, durMs: 210_000, daysAgo: 3 },
  // orchestrator
  { agentId: "orchestrator", instanceId: "orchestrator-j6n2w5", prompt: "Orchestrate landing page polish: docs component, scrollbar, @layer base fix", model: "claude-opus-4-5", tokensIn: 178_000, tokensOut: 13_800, costUsd: 2.76, durMs: 590_000, daysAgo: 1 },
  { agentId: "orchestrator", instanceId: "orchestrator-j6n2w5", prompt: "Coordinate perf+UX rewrite: React.memo, viewport culling, rAF throttle", model: "claude-opus-4-5", tokensIn: 142_000, tokensOut: 11_500, costUsd: 2.18, durMs: 510_000, daysAgo: 2 },
  // qa-codebase
  { agentId: "qa-codebase", instanceId: "qa-codebase-r8h4z1", prompt: "Validate 400ms PATCH debounce and SSE reconnect under network throttle", model: "claude-sonnet-4-5", tokensIn: 44_000, tokensOut: 3_900, costUsd: 0.61, durMs: 165_000, daysAgo: 1 },
  { agentId: "qa-codebase", instanceId: "qa-codebase-r8h4z1", prompt: "Audit flood-fill algorithm and shift-click rect selection edge cases", model: "claude-sonnet-4-5", tokensIn: 58_000, tokensOut: 5_200, costUsd: 0.83, durMs: 225_000, daysAgo: 3 },
  // explore
  { agentId: "explore", instanceId: "explore-b3f7q9", prompt: "Prototype pixel-art sprite sheet loader for agent units with animation frames", model: "claude-sonnet-4-5", tokensIn: 39_000, tokensOut: 4_100, costUsd: 0.55, durMs: 150_000, daysAgo: 2 },
  { agentId: "explore", instanceId: "explore-b3f7q9", prompt: "Spike: WebGL2 renderer for office floor vs pure CSS approach — perf report", model: "claude-sonnet-4-5", tokensIn: 81_000, tokensOut: 7_300, costUsd: 1.18, durMs: 300_000, daysAgo: 3 },
  // business-strategist
  { agentId: "business-strategist", instanceId: "business-strategist-x5c1p2", prompt: "Draft go-to-market positioning: dev-team awareness play vs solo-dev tool", model: "claude-sonnet-4-5", tokensIn: 120_000, tokensOut: 9_600, costUsd: 1.72, durMs: 400_000, daysAgo: 1 },
  { agentId: "business-strategist", instanceId: "business-strategist-x5c1p2", prompt: "Analyze pricing models: per-seat SaaS vs one-time desktop license", model: "claude-sonnet-4-5", tokensIn: 88_000, tokensOut: 7_100, costUsd: 1.31, durMs: 320_000, daysAgo: 2 },
  // web-researcher
  { agentId: "web-researcher", instanceId: "web-researcher-n9d6m8", prompt: "Research Tauri 2 plugin ecosystem: updater, single-instance, deeplinks", model: "claude-sonnet-4-5", tokensIn: 55_000, tokensOut: 4_600, costUsd: 0.79, durMs: 205_000, daysAgo: 1 },
  { agentId: "web-researcher", instanceId: "web-researcher-n9d6m8", prompt: "Survey NDJSON streaming libraries compatible with Next.js 15 App Router", model: "claude-sonnet-4-5", tokensIn: 43_000, tokensOut: 3_700, costUsd: 0.62, durMs: 170_000, daysAgo: 2 },
];

async function seedOffice() {
  const now = Date.now();

  const officeDir = join(homedir(), "Documents", "Lab", "office");
  mkdirSync(officeDir, { recursive: true });

  const roster = [
    ...RUNNING_AGENTS.map(a => ({ instanceId: a.instanceId, agentId: a.agentId })),
    ...DONE_AGENTS.map(a => ({ instanceId: a.instanceId, agentId: a.agentId })),
  ];

  try {
    projects.createProject({ id: "office", name: "Agent Office", description: "Agent Office app — the app itself is the project.", roster });
  } catch {
    projects.updateProject("office", {
      meta: { name: "Agent Office", description: "Agent Office app — the app itself is the project.", roster },
      memory: PROJECT_MEMORY,
    });
  }

  try {
    projects.updateProject("office", { memory: PROJECT_MEMORY });
  } catch { /* ignore */ }

  // Running agents
  for (const agent of RUNNING_AGENTS) {
    const runId = crypto.randomUUID();
    const startedAt = now - Math.floor(Math.random() * 30 + 5) * 60 * 1000;
    db.insertRun({
      id: runId,
      agentId: agent.agentId,
      agentName: agent.agentId,
      instanceId: agent.instanceId,
      projectId: "office",
      status: "running",
      prompt: agent.prompt,
      model: agent.model,
      effort: "high",
      startedAt,
    });
    const callTs = startedAt + 15_000;
    for (const tc of agent.toolCalls) {
      db.insertToolCall(runId, tc.name, tc.input, callTs);
    }
  }

  // Done agents (ended 3-8 hours ago so they appear idle, not "done")
  for (const agent of DONE_AGENTS) {
    const runId = crypto.randomUUID();
    const endedAt = now - agent.hoursAgo * 60 * 60 * 1000;
    const startedAt = endedAt - agent.durMs;
    db.insertRun({
      id: runId,
      agentId: agent.agentId,
      agentName: agent.agentId,
      instanceId: agent.instanceId,
      projectId: "office",
      status: "running",
      prompt: agent.prompt,
      model: agent.model,
      effort: "high",
      startedAt,
    });
    db.updateRun(runId, {
      status: "done",
      exitCode: 0,
      output: "Task completed successfully.",
      tokensIn: agent.tokensIn,
      tokensOut: agent.tokensOut,
      costUsd: agent.costUsd,
      durMs: agent.durMs,
      endedAt,
    });
  }

  // Historical runs (1-3 days ago)
  for (const run of HISTORICAL_RUNS) {
    const runId = crypto.randomUUID();
    const endedAt = now - run.daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 4) * 60 * 60 * 1000;
    const startedAt = endedAt - run.durMs;
    db.insertRun({
      id: runId,
      agentId: run.agentId,
      agentName: run.agentId,
      instanceId: run.instanceId,
      projectId: "office",
      status: "running",
      prompt: run.prompt,
      model: run.model,
      effort: "high",
      startedAt,
    });
    db.updateRun(runId, {
      status: "done",
      exitCode: 0,
      output: "Task completed successfully.",
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      costUsd: run.costUsd,
      durMs: run.durMs,
      endedAt,
    });
  }

  // UI settings
  db.setUiSetting("office-agents:office", JSON.stringify(AGENTS_POS));
  db.setUiSetting("office-decorations:office", DECORATIONS);
  db.setUiSetting("office-grass-color:office", '"green"');
  db.setUiSetting("office-map-custom:office", "false");
}

async function seedMemory() {
  agents.writeAgentMemory("frontend-craftsman", `## Codebase knowledge

### Component patterns
- All UI components in \`apps/web/src/components/\` — use \`cn()\` from \`@/lib/cn\` for class merging
- Tailwind v4 CSS-first: tokens defined in \`globals.css\` as \`@theme\` block, never inline CSS vars
- React.memo wraps every heavy office floor tile to prevent cascade re-renders

### Isometric floor
- Grid rendered via CSS \`rotateX(60deg) rotateZ(45deg)\` on the tile container
- Viewport culling: only tiles within \`±2\` of visible range are mounted in DOM
- Decoration sprites: \`unit-sprite.tsx\` maps string keys to PNG asset imports

### Known gotchas
- \`@layer base\` resets must come before Tailwind utilities or specificity breaks
- Framer Motion \`layoutId\` causes flash if the key changes on re-mount — use stable IDs
- SSR hydration: \`useEffect\` gate any \`window\` access, never read localStorage in render

### Recent work
- Sidebar nav redesign: keyboard shortcut overlay, focus trap, escape-to-close
- rAF-throttled drag handler for tile placement (60fps cap)
- Custom scrollbar via \`@layer base\` on \`::-webkit-scrollbar\``);

  agents.writeAgentMemory("backend-builder", `## Codebase knowledge

### Database layer
- \`packages/domain/src/services/db.ts\` — single better-sqlite3 instance via \`globalThis.__agentOfficeDb\`
- WAL mode + \`synchronous=NORMAL\` — safe for concurrent reads, single writer
- Schema migrations: array of functions indexed by \`PRAGMA user_version\`, idempotent

### SSE streaming
- \`/api/runs/[id]/stream\` — NDJSON lines, each line is a JSON object with \`type\` field
- Client in \`lib/sse.ts\`: \`ReadableStream\` wrapper, reconnects on network drop
- Never poll \`/api/runs\` for status — always subscribe to the stream

### Run lifecycle
- \`insertRun\` → status \`running\` → \`updateRun\` → status \`done\`/\`error\`
- \`getDb()\` on startup marks any \`running\` rows as \`error\` (orphan cleanup)
- \`parent_run_id\` FK enables sub-agent tree — query via \`getChildRuns(parentRunId)\`

### Known gotchas
- \`better-sqlite3\` is sync — never \`await\` db calls; they block the event loop intentionally
- \`INSERT OR IGNORE\` guards all insertions to prevent duplicate key errors on retry
- Tool calls FK refs runs — delete tool_calls before runs to satisfy FK constraint`);

  agents.writeAgentMemory("developer", `## Codebase knowledge

### Project structure
- Monorepo: pnpm workspaces — \`apps/web\` (Next.js), \`packages/domain\`, \`packages/ui\`
- \`@agent-office/domain/services\` barrel exports all service namespaces
- Types in \`packages/domain/src/types/index.ts\` — \`PersistedRun\`, \`AgentInstance\`, \`Project\`

### Auth & middleware
- \`src/middleware.ts\` — currently a no-op placeholder; PKCE flow goes here
- Session tokens: store in \`ui_settings\` table keyed \`session:*\` or httpOnly cookies
- OAuth callback route pattern: \`/api/auth/[provider]/callback/route.ts\`

### API conventions
- Route handlers use \`validateBody\` / \`validateQuery\` + Zod schemas
- Errors: \`badRequest\` (400), \`notFound\` (404), \`serverError\` (500) from \`@/lib/api-helpers\`
- \`tryService(fn)\` wraps service calls and maps ENOENT → 404

### Known gotchas
- \`params\` in App Router route handlers is \`Promise<{ id: string }>\` — always \`await params\`
- \`crypto.randomUUID()\` is Node built-in from v19 — no import needed in route handlers
- \`isValidIdSegment\` gate before any \`path.join\` with user input`);

  agents.writeAgentMemory("orchestrator", `## Codebase knowledge

### Orchestration patterns
- Pipeline API: \`/api/pipeline\` — creates a multi-step run chain with \`parallel_group\` support
- Sub-agent dispatch via \`summon.ts\`: spawns \`claude\` CLI process, streams stdout as NDJSON
- \`parent_run_id\` on each child run links back to the orchestrator's own run ID

### Agent roster
- Agents defined as \`.md\` files in \`~/.claude/agents/\` — YAML frontmatter + system prompt body
- \`listAgents()\` reads directory at request time — no caching, always fresh
- Instance IDs are unique per project-roster entry; same agent can run as multiple instances

### Coordination strategy
- Research → Implement → QA → UI: sequential pipeline with output passed as context
- Broadcast endpoint \`/api/broadcast\` sends a message to all running agent instances
- Check \`/api/runs?project=office&limit=50\` for current team status before dispatching

### Known gotchas
- Claude process inherits augmented PATH from \`buildAugmentedPath()\` — NVM bins included
- \`bypassPermissions\` mode: agents act without confirmation prompts — scope prompts tightly
- SSE streams close on agent exit; orchestrator must re-open to read child output`);

  agents.writeAgentMemory("qa-codebase", `## Codebase knowledge

### TypeScript setup
- Strict mode enabled; \`noUncheckedIndexedAccess\` catches most array access bugs
- Path aliases: \`@/*\` → \`apps/web/src/*\`; \`@agent-office/domain/*\` via workspace protocol
- Run \`pnpm tsc --noEmit\` from monorepo root — checks all packages simultaneously

### Test coverage
- Vitest for unit tests; \`*.test.ts\` co-located with source files
- \`/api/docs/export/route.test.ts\` is the only route test — pattern to follow for new routes
- No E2E tests yet; Playwright MCP is available for browser automation

### Common defect patterns
- \`any\` casts in API response shapes — replace with \`satisfies\` or explicit generics
- Missing \`ErrorBoundary\` around async client components that throw during data fetch
- \`useEffect\` dependencies array omissions — use \`eslint-plugin-react-hooks\` exhaustive-deps

### Known gotchas
- \`better-sqlite3\` synchronous calls inside \`useEffect\` → must be server-only; guard with \`server-only\` package
- \`"use client"\` boundary leaks: importing a server-only module in a client component crashes build
- Tailwind class purging: dynamic class strings \`\`text-\${color}\`\` are not purged — use full class names`);

  agents.writeAgentMemory("explore", `## Codebase knowledge

### Isometric rendering research
- CSS approach chosen over Canvas/WebGL: simpler DOM integration, accessibility, no texture atlas
- Tile size: 64×32px logical; CSS transform \`rotateX(60deg) rotateZ(45deg)\` on grid container
- Sprite sheets: individual PNGs imported via Next.js \`next/image\` static import — auto-optimized

### Performance findings
- 30×30 tile grid: 900 DOM nodes — acceptable with React.memo; beyond that needs virtualization
- rAF throttle at 60fps for drag events — \`requestAnimationFrame\` + \`cancelAnimationFrame\` pattern
- CSS containment: \`contain: layout style paint\` on each tile drops repaint cost ~40%

### Tooling explored
- \`@pixi/react\` — WebGL renderer, 5× faster for large maps but loses CSS token integration
- \`react-three-fiber\` — overkill for 2D isometric; ruled out
- Pure CSS transforms — chosen for v1; switch to PixiJS if grid exceeds 50×50

### Known gotchas
- Isometric depth sort: tiles must render back-to-front; sort by \`row + col\` descending
- \`z-index\` stacking inside CSS 3D context breaks — use \`translateZ\` nudges instead
- Safari: \`rotateX\` + \`overflow: hidden\` on parent clips child at wrong boundary — use clip-path`);

  agents.writeAgentMemory("business-strategist", `## Project context

### Positioning
- Primary angle: "your AI agents, visualized as a living office" — makes multi-agent feel tangible
- Target: senior developers who run 3+ Claude agents simultaneously on complex projects
- Differentiator: isometric office metaphor + real-time status vs terminal-only or chat-only tools

### Competitive landscape
- Cursor / Windsurf: editor-embedded, single-agent focus — no multi-agent orchestration view
- GitHub Copilot Workspace: issue → PR pipeline, no persistent agent roster concept
- Agent Office moat: the "office floor" mental model and the persistent memory + history per agent

### Go-to-market
- Launch on Product Hunt + HN Show HN simultaneously — dev-tool audience overlap
- Pricing hypothesis: free desktop app (open-source core) + hosted sync/team plan at $29/seat/mo
- Early adopter hook: seed with 8-agent demo project that self-demonstrates the product

### Known gotchas
- "Agent" term overloaded — competitors use it differently; may need "colleague" framing in copy
- Desktop-first distribution (Tauri) limits SEO; landing page at agent-office.dev is critical
- OSS strategy: MIT license core, proprietary cloud sync — Gitpod / Zed model`);

  agents.writeAgentMemory("web-researcher", `## Research findings

### SQLite performance
- WAL mode: concurrent readers don't block writer — confirmed via \`litestream\` benchmarks
- 100k rows: full-table scan in ~12ms on SSD with proper index; \`started_at DESC\` index critical
- \`PRAGMA cache_size = -64000\` (64 MB) improves repeated query performance significantly

### Next.js App Router specifics
- Route handlers run in Node.js runtime by default — can import \`better-sqlite3\` directly
- \`export const runtime = "nodejs"\` explicit declaration prevents accidental Edge runtime
- Streaming responses: \`ReadableStream\` in route handlers works; \`TransformStream\` for NDJSON

### Tauri 2 findings
- \`tauri-plugin-single-instance\` prevents duplicate app windows — important for tray apps
- \`tauri-plugin-updater\` supports auto-update from GitHub Releases — straightforward setup
- Sidecar Node.js server: \`tauri.conf.json\` \`externalBin\` + \`beforeDevCommand\` pattern

### Known gotchas
- \`fetch\` in route handlers uses Next.js cache by default — use \`{ cache: "no-store" }\` for live data
- \`EventSource\` browser API doesn't support custom headers — auth must go via cookie or URL param
- \`better-sqlite3\` native module: must match Node.js ABI; \`electron-rebuild\` equivalent for Tauri`);

  agents.writeGlobalMemory(`## Machine
- HP EliteBook, Intel Core Ultra 5 228V (Lunar Lake), 30 GB RAM, Intel Arc 130V iGPU
- Ubuntu 26.04 LTS, kernel 7.0.0-15-generic, Wayland/GNOME
- No CUDA — ML workloads use IPEX-LLM / SYCL builds

## Shell environment
- Default shell: zsh with starship + atuin
- Node.js v24 via nvm — source \`~/.nvm/nvm.sh\` if not available
- pnpm preferred; bun at \`~/.bun/bin/bun\`; Python 3.14 + uv at \`~/.local/bin/uv\`
- Passwordless sudo via \`/etc/sudoers.d/<user>-nopasswd\`

## Key paths
- Projects root: \`~/code/\`
- Agent Office dev: \`~/code/agent-office/\`
- Agent definitions: \`~/.claude/agents/\`
- App state + SQLite: \`~/.claude/agent-office/\`
- Settings: \`~/.claude/agent-office-settings.json\`

## Dev preferences
- Token classes only — never \`style={{ color: "var(--acc)" }}\`, use \`text-acc\`
- bypassPermissions on all agents; act without asking for routine work
- Commit only when explicitly asked; never amend unless told
- pnpm/bun over npm; uv over pip; caddy over nginx for dev`);
}

async function clearDemo() {
  const rawDb = db.getDb();
  rawDb.prepare("DELETE FROM tool_calls WHERE run_id IN (SELECT id FROM runs WHERE project_id='office')").run();
  rawDb.prepare("DELETE FROM messages WHERE run_id IN (SELECT id FROM runs WHERE project_id='office')").run();
  rawDb.prepare("DELETE FROM runs WHERE project_id='office'").run();
  rawDb.prepare("DELETE FROM ui_settings WHERE key IN ('office-agents:office','office-decorations:office','office-grass-color:office','office-map-custom:office','office-grid:office')").run();
  rmSync(join(paths.PROJECTS_DIR, "office"), { recursive: true, force: true });
  const officeDir = join(homedir(), "Documents", "Lab", "office");
  rmSync(officeDir, { recursive: true, force: true });
}

// Dev-only surface. Prod builds get a 404 so the dev toys never ship.
function forbidInProd() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function POST(request: Request) {
  const gate = forbidInProd();
  if (gate) return gate;
  const body = await request.json() as { action?: string };
  const action = body.action;

  if (action === "office") {
    await seedOffice();
    return NextResponse.json({ ok: true, message: "Office project + runs seeded." });
  }

  if (action === "memory") {
    await seedMemory();
    return NextResponse.json({ ok: true, message: "Agent memories written." });
  }

  if (action === "all") {
    await seedOffice();
    await seedMemory();
    return NextResponse.json({ ok: true, message: "Everything seeded." });
  }

  if (action === "clear") {
    await clearDemo();
    return NextResponse.json({ ok: true, message: "Demo data cleared." });
  }

  if (action === "showcase") {
    seedShowcase();
    return NextResponse.json({ ok: true, message: "Showcase world seeded (3 projects, chats, activity, accounts, secrets, schedules)." });
  }

  if (action === "clear-showcase") {
    clearShowcase();
    return NextResponse.json({ ok: true, message: "Showcase data cleared." });
  }

  if (action === "clear-all-runs") {
    const rawDb = db.getDb();
    rawDb.prepare("DELETE FROM tool_calls").run();
    rawDb.prepare("DELETE FROM messages").run();
    rawDb.prepare("DELETE FROM runs").run();
    return NextResponse.json({ ok: true, message: "All runs, messages, and tool calls deleted." });
  }

  if (action === "fix-orphans") {
    const rawDb = db.getDb();
    const result = rawDb.prepare("UPDATE runs SET status='error', exit_code=-1 WHERE status='running'").run();
    return NextResponse.json({ ok: true, message: `${result.changes} orphaned run(s) marked as error.` });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export function GET() {
  const gate = forbidInProd();
  if (gate) return gate;
  const rawDb = db.getDb();
  const runsCount = (rawDb.prepare("SELECT COUNT(*) as n FROM runs").get() as { n: number }).n;
  const messagesCount = (rawDb.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
  const orphansCount = (rawDb.prepare("SELECT COUNT(*) as n FROM runs WHERE status='running'").get() as { n: number }).n;

  let dbSizeBytes = 0;
  try { dbSizeBytes = statSync(paths.DB_PATH).size; } catch { /* ignore */ }

  let agentsCount = 0;
  try { agentsCount = readdirSync(paths.AGENTS_DIR).filter(f => f.endsWith(".md") && !f.startsWith("_")).length; } catch { /* ignore */ }

  return NextResponse.json({
    runsCount,
    messagesCount,
    orphansCount,
    dbSizeBytes,
    agentsCount,
    dbPath: paths.DB_PATH,
  });
}
