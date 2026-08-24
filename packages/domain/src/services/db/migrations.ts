import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { APP_STATE_DIR, AGENTS_DIR, CLAUDE_DIR, DEFAULT_ACCOUNT_ID, DEFAULT_GITHUB_ACCOUNT_ID, SYSTEM_GH_CONFIG_DIR } from "../infra/paths";
import type { PersistedRun } from "../../types/index";
import { STARTER_WORKFLOWS, STARTER_WORKFLOW_CATEGORY } from "../execution/workflow-seed";

const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // v0 → v1: initial schema
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        instance_id TEXT NOT NULL DEFAULT 'default',
        instance_label TEXT,
        project_id TEXT,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        exit_code INTEGER,
        prompt TEXT NOT NULL,
        output TEXT NOT NULL DEFAULT '',
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        dur_ms INTEGER,
        model TEXT NOT NULL DEFAULT '',
        effort TEXT NOT NULL DEFAULT '',
        cwd TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL DEFAULT 'default',
        role TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        ts INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        name TEXT NOT NULL,
        input TEXT,
        ts INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        used_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL DEFAULT 'default',
        items TEXT NOT NULL DEFAULT '[]',
        active_run_id TEXT,
        session_id TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(agent_id, instance_id)
      );

      CREATE TABLE IF NOT EXISTS drafts (
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL DEFAULT 'default',
        text TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(agent_id, instance_id)
      );

      CREATE TABLE IF NOT EXISTS ui_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content, content=messages, content_rowid=rowid
      );

      CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_instance ON runs(agent_id, instance_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id);
      CREATE INDEX IF NOT EXISTS idx_messages_ai ON messages(agent_id, instance_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_agent ON recent_prompts(agent_id, used_at DESC);

      CREATE TRIGGER IF NOT EXISTS messages_ai_fts AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_ad_fts AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_au_fts AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
    `);
  },
  // v1 → v2: pipelines tables
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipelines (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        interrupted INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pipeline_steps (
        pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
        step_index INTEGER NOT NULL,
        parallel_group INTEGER,
        agent_id TEXT NOT NULL,
        run_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        output TEXT,
        exit_code INTEGER,
        PRIMARY KEY(pipeline_id, step_index)
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_steps_pipeline ON pipeline_steps(pipeline_id);
      CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id, created_at DESC);
    `);
  },
  // v2 → v3: index on started_at for unfiltered quota queries
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs (started_at DESC);
    `);
  },
  // v3 → v4: parent_run_id for sub-agent tracking
  (db) => {
    db.exec(`
      ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id);
      CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs (parent_run_id);
    `);
  },
  // v4 → v5: saved_prompts global prompt library
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_prompts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        created_at INTEGER NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_saved_prompts_category ON saved_prompts(category);
      CREATE INDEX IF NOT EXISTS idx_saved_prompts_created ON saved_prompts(created_at DESC);
    `);
  },
  // v5 → v6: per-transcript queued-message backlog. Messages typed while a
  // run is in flight used to live in `useState` on the chat panel, so a reload
  // or app crash dropped them silently. Stored as a JSON array of
  // `{ id, text }` so a schema change isn't needed if the shape grows.
  (db) => {
    db.exec(`
      ALTER TABLE transcripts ADD COLUMN queued_messages TEXT NOT NULL DEFAULT '[]';
    `);
  },
  // v6 → v7: workflows rebrand. Old free-form saved prompts are noise; the
  // starter set is a small, curated library of reusable multi-step prompts.
  // We keep the underlying table name `saved_prompts` (renaming risks live
  // data), wipe all legacy rows, and seed the starter workflows in a
  // dedicated `starter` category. User-created workflows added later will
  // sit alongside these in other categories.
  (db) => {
    db.exec(`DELETE FROM saved_prompts;`);
    const insert = db.prepare(
      "INSERT INTO saved_prompts (id, title, body, category, created_at, use_count) VALUES (?, ?, ?, ?, ?, 0)",
    );
    const now = Date.now();
    for (const w of STARTER_WORKFLOWS) {
      insert.run(randomUUID(), w.title, w.body, STARTER_WORKFLOW_CATEGORY, now);
    }
  },
  // v7 → v8: multi-account support. Adds the `accounts` table and auto-inserts
  // the `default` row pointing at ~/.claude when its .credentials.json exists.
  // The per-project accountId lives in project.md frontmatter, not in SQLite —
  // projects are scanned from disk, not persisted here.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        config_dir TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);
    if (existsSync(join(CLAUDE_DIR, ".credentials.json"))) {
      db.prepare(
        "INSERT OR IGNORE INTO accounts (id, label, config_dir, created_at) VALUES (?, ?, ?, ?)",
      ).run(DEFAULT_ACCOUNT_ID, "Default", CLAUDE_DIR, Date.now());
    }
  },
  // v8 → v9: tag each run with the account that spawned it, for per-account
  // analytics (slice 5). NULL = default account (backward compat with runs
  // logged before this migration).
  (db) => {
    db.exec(`
      ALTER TABLE runs ADD COLUMN account_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_runs_account ON runs (account_id, started_at DESC);
    `);
  },
  // v9 → v10: record which OS process spawned each run so orphan detection can
  // ask "is that process still alive?" instead of assuming every 'running' row
  // belongs to a crash. NULL = pre-migration row, treated as orphaned.
  (db) => {
    db.exec("ALTER TABLE runs ADD COLUMN owner_pid INTEGER;");
  },
  // v10 → v11: per-project GitHub account support. Adds the `github_accounts`
  // table and seeds the `default` row pointing at the system gh config so the
  // picker/list have a stable "Default (system)" option. The default row maps
  // to NO GH_CONFIG_DIR injection (see paths.githubAccountConfigDir), so a
  // project on the default github account behaves exactly as before this
  // migration. The per-project githubAccountId lives in project.md frontmatter,
  // not in SQLite — projects are scanned from disk, not persisted here.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS github_accounts (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        config_dir TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);
    db.prepare(
      "INSERT OR IGNORE INTO github_accounts (id, label, config_dir, created_at) VALUES (?, ?, ?, ?)",
    ).run(DEFAULT_GITHUB_ACCOUNT_ID, "Default", SYSTEM_GH_CONFIG_DIR, Date.now());
  },
  // v11 → v12: scheduled work. A job is a serialized SummonRequest plus a fire
  // time; the server-side scheduler ticks and fires due jobs (manual "run X at
  // T" and rate-limit auto-resume). `rate_limited_resets_at` on runs lets the
  // scheduler tell whether a fired resume hit the limit again (→ reschedule).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        fire_at INTEGER NOT NULL,
        summon_request TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT 'manual',
        label TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        attention TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        fired_run_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status ON scheduled_jobs(status, fire_at);
      ALTER TABLE runs ADD COLUMN rate_limited_resets_at INTEGER;
    `);
  },
  // v12 → v13: per-project reusable secrets. A secret is a free-form named env
  // var (`name` = the exact var injected into a run, `value` = the token) plus
  // optional expiry + a shell test command for live validity checks. Stored
  // once in `secrets`; the many-to-many `project_secrets` link lets the same
  // key be attached to multiple projects ("bring existing key to another
  // project" = one link row). Values are plaintext — same threat model as the
  // already-plaintext gh hosts.yml / .credentials.json on this disk.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL,
        expires_at INTEGER,
        test_cmd TEXT,
        verify_before_run INTEGER NOT NULL DEFAULT 0,
        last_tested_at INTEGER,
        last_test_ok INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_secrets (
        project_id TEXT NOT NULL,
        secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(project_id, secret_id)
      );

      CREATE INDEX IF NOT EXISTS idx_project_secrets_project ON project_secrets(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_secrets_secret ON project_secrets(secret_id);
    `);
  },
];

export function createSchema(db: Database.Database): void {
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  db.transaction(() => {
    let v = current;
    if (v < 1) { MIGRATIONS[0]!(db); v = 1; db.pragma("user_version = 1"); }
    if (v < 2) { MIGRATIONS[1]!(db); v = 2; db.pragma("user_version = 2"); }
    if (v < 3) { MIGRATIONS[2]!(db); v = 3; db.pragma("user_version = 3"); }
    if (v < 4) { MIGRATIONS[3]!(db); v = 4; db.pragma("user_version = 4"); }
    if (v < 5) { MIGRATIONS[4]!(db); v = 5; db.pragma("user_version = 5"); }
    if (v < 6) { MIGRATIONS[5]!(db); v = 6; db.pragma("user_version = 6"); }
    if (v < 7) { MIGRATIONS[6]!(db); v = 7; db.pragma("user_version = 7"); }
    if (v < 8) { MIGRATIONS[7]!(db); v = 8; db.pragma("user_version = 8"); }
    if (v < 9) { MIGRATIONS[8]!(db); v = 9; db.pragma("user_version = 9"); }
    if (v < 10) { MIGRATIONS[9]!(db); v = 10; db.pragma("user_version = 10"); }
    if (v < 11) { MIGRATIONS[10]!(db); v = 11; db.pragma("user_version = 11"); }
    if (v < 12) { MIGRATIONS[11]!(db); v = 12; db.pragma("user_version = 12"); }
    if (v < 13) { MIGRATIONS[12]!(db); v = 13; db.pragma("user_version = 13"); }
  })();
}

// ─── One-time JSONL → SQLite migration ───────────────────────────────────────

export function migrateFromJsonl(db: Database.Database): void {
  const already = db.prepare("SELECT value FROM ui_settings WHERE key = '_migrated'").get() as { value: string } | undefined;
  if (already) return;

  // Migrate runs.log
  const RUNS_LOG = join(APP_STATE_DIR, "runs.log");
  const LEGACY_RUNS_LOG = join(AGENTS_DIR, "_runs.log");
  const insertRun = db.prepare(`
    INSERT OR IGNORE INTO runs (id, agent_id, agent_name, instance_id, instance_label, project_id, session_id, status, exit_code, prompt, output, tokens_in, tokens_out, cost_usd, dur_ms, model, effort, cwd, started_at, ended_at)
    VALUES (@id, @agent_id, @agent_name, @instance_id, @instance_label, @project_id, @session_id, @status, @exit_code, @prompt, @output, @tokens_in, @tokens_out, @cost_usd, @dur_ms, @model, @effort, @cwd, @started_at, @ended_at)
  `);

  const migrateRunsFile = db.transaction((path: string) => {
    if (!existsSync(path)) return;
    try {
      const raw = readFileSync(path, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line) as PersistedRun;
          insertRun.run({
            id: r.id, agent_id: r.agentId, agent_name: r.agentName,
            instance_id: r.instanceId ?? "default", instance_label: r.instanceLabel ?? null,
            project_id: r.projectId ?? null, session_id: r.sessionId ?? null,
            status: r.status, exit_code: r.exitCode ?? null,
            prompt: r.prompt, output: r.output,
            tokens_in: r.tokensIn, tokens_out: r.tokensOut, cost_usd: r.cost,
            dur_ms: r.durMs, model: r.model, effort: r.effort,
            cwd: r.cwd ?? null, started_at: r.ts, ended_at: r.ts + r.durMs,
          });
        } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable */ }
  });

  migrateRunsFile(RUNS_LOG);
  migrateRunsFile(LEGACY_RUNS_LOG);

  // Migrate history JSONL files
  const HISTORY_DIR = join(APP_STATE_DIR, "history");
  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messages (id, run_id, agent_id, instance_id, role, content, ts)
    VALUES (@id, @run_id, @agent_id, @instance_id, @role, @content, @ts)
  `);
  // Ensure the run exists for the FK (history messages may reference runs not in the log)
  const ensureRun = db.prepare(`
    INSERT OR IGNORE INTO runs (id, agent_id, agent_name, prompt, status, output, started_at)
    VALUES (@id, @agent_id, @agent_name, '', 'done', '', @started_at)
  `);

  if (existsSync(HISTORY_DIR)) {
    try {
      const files = readdirSync(HISTORY_DIR).filter(f => f.endsWith(".jsonl"));
      const migrateHistory = db.transaction(() => {
        for (const file of files) {
          const key = file.replace(/\.jsonl$/, "");
          const parts = key.split("::");
          const agentId = parts[0] ?? key;
          const instanceId = parts.slice(1).join("::") || "default";
          try {
            const raw = readFileSync(join(HISTORY_DIR, file), "utf8");
            for (const line of raw.split("\n")) {
              if (!line.trim()) continue;
              try {
                const m = JSON.parse(line) as { role: string; content: string; runId: string; ts: number };
                ensureRun.run({ id: m.runId, agent_id: agentId, agent_name: agentId, started_at: m.ts });
                insertMsg.run({
                  id: randomUUID(), run_id: m.runId,
                  agent_id: agentId, instance_id: instanceId,
                  role: m.role, content: m.content, ts: m.ts,
                });
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      });
      migrateHistory();
    } catch { /* skip */ }
  }

  // Migrate recent prompts JSON
  const PROMPTS_FILE = join(APP_STATE_DIR, "recent-prompts.json");
  const LEGACY_PROMPTS = join(AGENTS_DIR, "_recent_prompts.json");
  const insertPrompt = db.prepare(`
    INSERT INTO recent_prompts (agent_id, prompt, used_at) VALUES (?, ?, ?)
  `);
  const migratePrompts = db.transaction((path: string) => {
    if (!existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, string[]>;
      for (const [agentId, prompts] of Object.entries(data)) {
        for (const prompt of prompts) {
          try { insertPrompt.run(agentId, prompt, Date.now()); } catch { /* skip dup */ }
        }
      }
    } catch { /* skip */ }
  });
  migratePrompts(PROMPTS_FILE);
  migratePrompts(LEGACY_PROMPTS);

  // Mark migration done
  db.prepare("INSERT OR REPLACE INTO ui_settings (key, value, updated_at) VALUES ('_migrated', '1', ?)").run(Date.now());
}
