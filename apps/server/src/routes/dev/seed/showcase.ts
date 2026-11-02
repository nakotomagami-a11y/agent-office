/**
 * Showcase seed — populates the app with a fully invented, leak-free world for
 * marketing screenshots. NO local/private data: fake identity (`dev`),
 * `~/code/<project>` paths, invented brands. Seeds 3 projects (3 open tabs),
 * activity/runs, accounts, GitHub identities, secrets, and scheduled jobs. `clearShowcase()` fully removes everything it created.
 *
 * Deliberately does NOT call writeGlobalMemory — that would overwrite the real
 * machine's global memory.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";
import { db, projects, accounts, githubAccounts, secrets, scheduler, agents, paths } from "@agent-office/domain/services";
import { parseJson } from "@agent-office/api-contract";

const now = () => Date.now();
const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

// ── Fake identity ────────────────────────────────────────────────────────────
const CODE_ROOT = "~/code";

// Moon-like grey planet for every demo project (per showcase art direction).
const MOON = { type: "rocky" as const, seed: 424242, paletteIdx: 0, pixels: 1000, dither: true, rotation: 0.4 };

const ACCOUNT_LABELS = ["Nova Labs (Max)", "Nova Labs (Team)"];
const GITHUB_LABELS = ["nova-labs", "nova-personal"];
const SECRET_DEFS = [
  { name: "STRIPE_SECRET_KEY", label: "Stripe (live)", value: "sk_live_51NfPk2••••••••••••••••••••" },
  { name: "OPENAI_API_KEY", label: "OpenAI", value: "sk-proj-••••••••••••••••••••••••" },
  { name: "DATABASE_URL", label: "Neon Postgres", value: "postgresql://dev:••••@ep-nova.neon.tech/nebula" },
  { name: "SENTRY_DSN", label: "Sentry", value: "https://••••@o4507.ingest.sentry.io/4507" },
];

interface ProjectDef {
  id: string;
  name: string;
  description: string;
  planetType: string;
  roster: Array<{ agentId: string; suffix: string }>;
}

const PROJECTS: ProjectDef[] = [
  {
    id: "nebula-commerce",
    name: "Nebula Commerce",
    description: "Next.js 15 storefront — headless commerce, Stripe checkout, edge-rendered product pages.",
    planetType: "no_atmosphere",
    roster: [
      { agentId: "orchestrator", suffix: "neb" },
      { agentId: "developer", suffix: "neb" },
      { agentId: "frontend-craftsman", suffix: "neb" },
      { agentId: "backend-builder", suffix: "neb" },
      { agentId: "qa-codebase", suffix: "neb" },
    ],
  },
  {
    id: "atlas-api",
    name: "Atlas API",
    description: "Go microservices backend — gRPC, event sourcing, Postgres + NATS, deployed on Fly.io.",
    planetType: "gas_giant",
    roster: [
      { agentId: "backend-builder", suffix: "atl" },
      { agentId: "developer", suffix: "atl" },
      { agentId: "qa-codebase", suffix: "atl" },
      { agentId: "web-researcher", suffix: "atl" },
    ],
  },
  {
    id: "pulse-mobile",
    name: "Pulse Mobile",
    description: "React Native fitness app — Expo, HealthKit sync, offline-first with WatermelonDB.",
    planetType: "terran_wet",
    roster: [
      { agentId: "frontend-craftsman", suffix: "pul" },
      { agentId: "developer", suffix: "pul" },
      { agentId: "explore", suffix: "pul" },
    ],
  },
];

const inst = (agentId: string, suffix: string) => `${agentId}-${suffix}`;

// ── Activity / runs ─────────────────────────────────────────────────────────
const MODEL_OPUS = "claude-opus-4-5";
const MODEL_SONNET = "claude-sonnet-4-5";

interface DoneRun { agentId: string; suffix: string; prompt: string; model: string; tokensIn: number; tokensOut: number; cost: number; durMs: number; agoMs: number; }
interface RunningRun { agentId: string; suffix: string; prompt: string; tools: Array<{ name: string; arg: string }>; }

const RUNNING: Record<string, RunningRun[]> = {
  "nebula-commerce": [
    { agentId: "backend-builder", suffix: "neb", prompt: "Add inventory reservation with TTL holds on checkout start", tools: [{ name: "Bash", arg: "psql $DATABASE_URL -c '\\d products'" }, { name: "Write", arg: `${CODE_ROOT}/nebula-commerce/db/migrations/0007_reservations.sql` }] },
    { agentId: "orchestrator", suffix: "neb", prompt: "Ship the checkout epic across 4 agents", tools: [{ name: "Read", arg: `${CODE_ROOT}/nebula-commerce/project.md` }] },
  ],
  "atlas-api": [
    { agentId: "developer", suffix: "atl", prompt: "Wire NATS JetStream consumer for order.created events", tools: [{ name: "Read", arg: `${CODE_ROOT}/atlas-api/services/orders/events.go` }] },
  ],
  "pulse-mobile": [
    { agentId: "explore", suffix: "pul", prompt: "Spike offline sync conflict resolution for WatermelonDB", tools: [{ name: "Bash", arg: "grep -r 'synchronize' src/model" }] },
  ],
};

const DONE: Record<string, DoneRun[]> = {
  "nebula-commerce": [
    { agentId: "developer", suffix: "neb", prompt: "Add Stripe checkout session + signature-verified webhook", model: MODEL_OPUS, tokensIn: 128_400, tokensOut: 11_200, cost: 2.14, durMs: 512_000, agoMs: 40 * MIN },
    { agentId: "qa-codebase", suffix: "neb", prompt: "Audit checkout flow for double-charge races", model: MODEL_SONNET, tokensIn: 48_200, tokensOut: 3_900, cost: 0.61, durMs: 142_000, agoMs: 55 * MIN },
    { agentId: "frontend-craftsman", suffix: "neb", prompt: "Masonry product grid with quick-add + skeletons", model: MODEL_OPUS, tokensIn: 71_000, tokensOut: 6_800, cost: 1.28, durMs: 240_000, agoMs: 3 * HR },
    { agentId: "developer", suffix: "neb", prompt: "Edge-render product pages with ISR + on-demand revalidation", model: MODEL_OPUS, tokensIn: 96_000, tokensOut: 8_400, cost: 1.62, durMs: 360_000, agoMs: 1 * DAY },
  ],
  "atlas-api": [
    { agentId: "backend-builder", suffix: "atl", prompt: "gRPC health check + graceful shutdown for orders service", model: MODEL_OPUS, tokensIn: 74_000, tokensOut: 6_400, cost: 1.21, durMs: 268_000, agoMs: 2 * HR },
    { agentId: "web-researcher", suffix: "atl", prompt: "Compare NATS JetStream vs Kafka for event sourcing at our scale", model: MODEL_SONNET, tokensIn: 62_000, tokensOut: 5_100, cost: 0.94, durMs: 210_000, agoMs: 6 * HR },
    { agentId: "qa-codebase", suffix: "atl", prompt: "Load test orders gRPC endpoint to 5k rps, report p99", model: MODEL_SONNET, tokensIn: 55_000, tokensOut: 4_600, cost: 0.79, durMs: 195_000, agoMs: 1 * DAY },
  ],
  "pulse-mobile": [
    { agentId: "frontend-craftsman", suffix: "pul", prompt: "Workout summary screen with animated activity ring", model: MODEL_OPUS, tokensIn: 88_000, tokensOut: 7_300, cost: 1.44, durMs: 331_000, agoMs: 4 * HR },
    { agentId: "developer", suffix: "pul", prompt: "HealthKit steps sync with background fetch", model: MODEL_OPUS, tokensIn: 67_000, tokensOut: 5_900, cost: 1.11, durMs: 240_000, agoMs: 2 * DAY },
  ],
};

// ── Memory content (clean, no real paths) ───────────────────────────────────
function seedMemory(): void {
  agents.writeGlobalMemory(`## Team
- Nova Labs — a 4-person product studio shipping web, backend, and mobile.
- Working style: trunk-based, PRs required, CI green before merge.

## Conventions (all projects)
- TypeScript strict everywhere; Go for services; React Native for mobile.
- Secrets live in the project vault — never committed.
- Every feature ships behind a flag until QA signs off.

## Preferences
- Prefer boring, proven tools over the newest thing.
- Small PRs, descriptive commits, no drive-by refactors.
- Ship the lazy solution that works; add complexity only when measured.`);

  agents.writeAgentMemory("developer", `## Nebula Commerce
- App Router (Next 15). Server Components by default; \`"use client"\` only at leaves.
- Stripe: Checkout Sessions + signature-verified webhooks, idempotent by \`event.id\`.
- Data: Neon Postgres via Drizzle; migrations in \`db/migrations\`.

## Gotchas
- Never trust client cart totals — always re-price server-side before charging.
- Webhooks must be idempotent; Stripe retries on 5xx.`);

  agents.writeAgentMemory("orchestrator", `## Coordination
- Fan out Research → Implement → QA → UI; pass each step's output as context.
- Keep sub-agent prompts tightly scoped — one deliverable each.
- Land backend/schema before UI polish so the UI builds on the final shape.

## Team roster
- developer, backend-builder, frontend-craftsman, qa-codebase, explore.`);

  agents.writeAgentMemory("backend-builder", `## Atlas API
- Go services, gRPC + NATS JetStream for events, Postgres for state.
- Graceful shutdown: drain in-flight streams on SIGTERM before exit.
- Event sourcing: append-only; project read models from the stream.`);
}

// ── Seed ─────────────────────────────────────────────────────────────────────
export function seedShowcase(): void {
  seedMemory();
  const createdFolders: string[] = [];

  // Accounts + GitHub identities
  const accountIds: string[] = [];
  for (const label of ACCOUNT_LABELS) {
    try { accountIds.push(accounts.create({ label }).id); } catch { /* ignore */ }
  }
  const githubIds: string[] = [];
  for (const label of GITHUB_LABELS) {
    try { githubIds.push(githubAccounts.create({ label }).id); } catch { /* ignore */ }
  }

  // Secrets
  const secretIds: string[] = [];
  for (const s of SECRET_DEFS) {
    try { secretIds.push(secrets.create({ name: s.name, label: s.label, value: s.value }).id); } catch { /* ignore */ }
  }

  // Projects
  for (const p of PROJECTS) {
    const roster = p.roster.map((r) => ({ instanceId: inst(r.agentId, r.suffix), agentId: r.agentId }));
    let realCwd: string | undefined;
    try {
      const created = projects.createProject({ id: p.id, name: p.name, description: p.description, roster, planet: MOON });
      realCwd = created.meta.cwd;
      if (realCwd) createdFolders.push(realCwd);
    } catch {
      // Already exists — update in place.
    }
    // Override cwd to a fake path and attach account/github identities.
    try {
      projects.updateProject(p.id, {
        meta: {
          name: p.name,
          description: p.description,
          planet: MOON,
          accountId: accountIds[0],
          githubAccountId: githubIds[0],
        },
        memory: `# ${p.name}\n\n## Stack\n${p.description}\n\n## Conventions\n- Trunk-based, PRs required, CI must be green\n- Secrets via the project secrets vault, never committed\n`,
      });
      projects.replaceRoster(p.id, roster, "seedShowcase");
    } catch { /* ignore */ }

    // Link a couple secrets to the storefront.
    if (p.id === "nebula-commerce") {
      for (const sid of secretIds.slice(0, 3)) { try { secrets.link(p.id, sid); } catch { /* ignore */ } }
    }


    // Running runs
    for (const r of RUNNING[p.id] ?? []) {
      const runId = crypto.randomUUID();
      const startedAt = now() - (5 + Math.floor(Math.random() * 20)) * MIN;
      db.insertRun({ id: runId, agentId: r.agentId, agentName: r.agentId, instanceId: inst(r.agentId, r.suffix), projectId: p.id, status: "running", prompt: r.prompt, model: MODEL_OPUS, effort: "high", startedAt, cwd: `${CODE_ROOT}/${p.id}`, accountId: accountIds[0] });
      for (const tc of r.tools) db.insertToolCall(runId, tc.name, { arg: tc.arg }, startedAt + 12_000);
    }

    // Done runs
    for (const d of DONE[p.id] ?? []) {
      const runId = crypto.randomUUID();
      const endedAt = now() - d.agoMs;
      const startedAt = endedAt - d.durMs;
      db.insertRun({ id: runId, agentId: d.agentId, agentName: d.agentId, instanceId: inst(d.agentId, d.suffix), projectId: p.id, status: "running", prompt: d.prompt, model: d.model, effort: "high", startedAt, cwd: `${CODE_ROOT}/${p.id}`, accountId: accountIds[0] });
      db.updateRun(runId, { status: "done", exitCode: 0, output: "Task completed successfully.", tokensIn: d.tokensIn, tokensOut: d.tokensOut, costUsd: d.cost, durMs: d.durMs, endedAt });
    }
  }

  // Scheduled jobs
  try {
    scheduler.createJob({ fireAt: now() + 3 * HR, reason: "rate-limit", label: "Nebula: resume masonry grid after rate limit", summonRequest: { agentId: "frontend-craftsman", prompt: "Continue the product grid redesign where you left off.", projectId: "nebula-commerce", instanceId: inst("frontend-craftsman", "neb") } });
    scheduler.createJob({ fireAt: now() + 1 * DAY, reason: "manual", label: "Atlas: nightly load-test + p99 report", summonRequest: { agentId: "qa-codebase", prompt: "Run the nightly 5k rps load test on the orders service and post the p99.", projectId: "atlas-api", instanceId: inst("qa-codebase", "atl") } });
  } catch { /* ignore */ }

  // Open 3 tabs (Nebula active)
  const tabs = PROJECTS.map((p) => ({ id: crypto.randomUUID(), projectId: p.id, currentPath: `/projects/${p.id}`, createdAt: now(), lastActiveAt: now() }));
  db.setUiSetting("tabs-state", JSON.stringify({ tabs, activeTabId: tabs[0]!.id, closedStack: [] }));

  // Remember what to clean up.
  db.setUiSetting("showcase:folders", JSON.stringify(createdFolders));
  db.setUiSetting("showcase:seeded", "true");
}

// ── Clear ────────────────────────────────────────────────────────────────────
export function clearShowcase(): void {
  const raw = db.getDb();
  const ids = PROJECTS.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");

  // Runs / tool_calls / messages for showcase projects
  // Same FK order the cleanup service had to fix: `background_shells` and the
  // `runs.parent_run_id` self-FK both throw if the run goes first.
  const scoped = `SELECT id FROM runs WHERE project_id IN (${placeholders})`;
  for (const t of ["tool_calls", "messages", "background_shells"]) {
    raw.prepare(`DELETE FROM ${t} WHERE run_id IN (${scoped})`).run(...ids);
  }
  raw.prepare(`UPDATE runs SET parent_run_id = NULL WHERE parent_run_id IN (${scoped})`).run(...ids);
  raw.prepare(`DELETE FROM runs WHERE project_id IN (${placeholders})`).run(...ids);

  // Scheduled jobs referencing showcase projects
  raw.prepare(`DELETE FROM scheduled_jobs WHERE summon_request LIKE '%nebula-commerce%' OR summon_request LIKE '%atlas-api%' OR summon_request LIKE '%pulse-mobile%'`).run();

  // Accounts / github / secrets we invented (by label)
  raw.prepare("DELETE FROM accounts WHERE label LIKE 'Nova Labs%'").run();
  raw.prepare("DELETE FROM github_accounts WHERE label LIKE 'nova-%'").run();
  raw.prepare(`DELETE FROM project_secrets WHERE secret_id IN (SELECT id FROM secrets WHERE name IN ('STRIPE_SECRET_KEY','OPENAI_API_KEY','DATABASE_URL','SENTRY_DSN'))`).run();
  raw.prepare("DELETE FROM secrets WHERE name IN ('STRIPE_SECRET_KEY','OPENAI_API_KEY','DATABASE_URL','SENTRY_DSN')").run();

  raw.prepare("DELETE FROM ui_settings WHERE key IN ('tabs-state','showcase:seeded')").run();

  // Project metadata + created folders
  let folders: string[] = [];
  try {
    const parsed = parseJson(db.getUiSetting("showcase:folders") ?? "[]");
    folders = Array.isArray(parsed) ? parsed.filter((f): f is string => typeof f === "string") : [];
  } catch { /* ignore */ }
  for (const f of folders) { try { rmSync(f, { recursive: true, force: true }); } catch { /* ignore */ } }
  for (const id of ids) { try { rmSync(join(paths.PROJECTS_DIR, id), { recursive: true, force: true }); } catch { /* ignore */ } }
  raw.prepare("DELETE FROM ui_settings WHERE key = 'showcase:folders'").run();
}
