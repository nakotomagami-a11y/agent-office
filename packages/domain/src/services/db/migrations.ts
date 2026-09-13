import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_DIR, DEFAULT_ACCOUNT_ID, DEFAULT_GITHUB_ACCOUNT_ID, SYSTEM_GH_CONFIG_DIR } from "../infra/paths";
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
  // v13 → v14: server-authoritative conversations (chat refactor). A
  // conversation is one chat thread for an (agent, instance) slot; a turn is
  // one top-level run tagged with its conversationId; the queue is a durable
  // server-owned FIFO. Replaces the client-authored transcript blob + client
  // queue. See docs/chat-refactor.md. Backfills one conversation per existing
  // slot and tags historical top-level runs so old threads still render.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        instance_id TEXT NOT NULL DEFAULT 'default',
        project_id TEXT,
        session_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',   -- 'idle' | 'running' | 'needs_attention'
        active_run_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_slot ON conversations(agent_id, instance_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS queued_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        attachments TEXT,
        position INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queued_messages_conv ON queued_messages(conversation_id, position);

      ALTER TABLE runs ADD COLUMN conversation_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_runs_conversation ON runs(conversation_id, started_at);
    `);
    backfillConversations(db);
  },
  // v14 → v15: prompt-cache token breakdown, for the Context & Cost tab — see
  // execution/runs.ts's usage parsing and agents/context-cost.ts. Nullable
  // (not NOT NULL DEFAULT 0) because a run predating this migration truly has
  // no known value, vs. a post-migration run that measured zero cache use.
  (db) => {
    db.exec(`
      ALTER TABLE runs ADD COLUMN cache_creation_tokens INTEGER;
      ALTER TABLE runs ADD COLUMN cache_read_tokens INTEGER;
    `);
  },
  // v15 → v16: background shells an agent started via a `run_in_background`
  // Bash call — tracked so the Servers modal can surface (and let the user
  // kill) one even after the owning `claude` process has long since exited.
  // See execution/runs.ts's tool_use/tool_result handling and
  // execution/processes.ts's listProcesses(). No `ended_at`/status column:
  // liveness is always checked live against /proc when read, and a row is
  // deleted the moment it's found dead — a row existing means "believed
  // alive", not a historical record.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS background_shells (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        instance_id TEXT,
        instance_label TEXT,
        project_id TEXT,
        pid INTEGER NOT NULL,
        command TEXT NOT NULL,
        description TEXT,
        started_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_background_shells_pid ON background_shells(pid);
    `);
  },
  // v16 → v17: "Measure exactly" — a real (not estimated) split of an
  // agent's native overhead into CC base + built-in tools vs. MCP servers,
  // from actually spawning a throwaway probe session and diffing its real
  // cache-write usage across two turns (see agents/context-cost-measure.ts).
  // One row per agent (not per instance — built-in tools/MCP come from the
  // agent definition, not per-instance state). `mcp_server_names` is a JSON
  // array; empty when the agent declares no `mcp__*` tools (nothing to wait
  // on, so `measureAgentContextCost` skips straight to a single-number result).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_context_measurements (
        agent_id TEXT PRIMARY KEY,
        cc_base_and_tools_tokens INTEGER NOT NULL,
        mcp_tokens INTEGER NOT NULL,
        mcp_server_names TEXT NOT NULL,
        measured_at INTEGER NOT NULL
      );
    `);
  },
  // v17 → v18: composite index for the per-run message read. Loading a
  // conversation runs `SELECT ... FROM messages WHERE run_id = ? ORDER BY ts`,
  // which under the old run_id-only index still needed a temp B-tree to sort.
  // `(run_id, ts)` satisfies both the filter and the order, so the sort is
  // free. The old single-column `idx_messages_run` becomes redundant (the
  // composite's leading column covers every run_id lookup), so drop it.
  (db) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_run_ts ON messages(run_id, ts);
      DROP INDEX IF EXISTS idx_messages_run;
    `);
  },
];

/**
 * Create one conversation per legacy (agent, instance) slot that lacks one and
 * tag that slot's top-level runs with it. Idempotent: only ever creates a
 * conversation for a slot with none, and only assigns runs whose
 * `conversation_id` is still NULL — safe to call repeatedly (the v14 migration
 * calls it once; tests call it after seeding legacy rows).
 *
 * Session carry-over: the slot's transcript sessionId wins, else the newest
 * top-level run's sessionId, so a resumed thread keeps its claude session.
 */
export function backfillConversations(db: Database.Database): void {
  const now = Date.now();
  const slots = db
    .prepare(
      `SELECT agent_id, instance_id FROM transcripts
       UNION
       SELECT agent_id, instance_id FROM runs WHERE parent_run_id IS NULL AND conversation_id IS NULL`,
    )
    .all() as Array<{ agent_id: string; instance_id: string }>;

  // rowid tie-break — see getActiveConversation's doc comment in db/conversations.ts.
  const findConv = db.prepare(
    "SELECT id FROM conversations WHERE agent_id = ? AND instance_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  );
  const transcriptSession = db.prepare(
    "SELECT session_id, updated_at FROM transcripts WHERE agent_id = ? AND instance_id = ?",
  );
  const newestRunSession = db.prepare(
    "SELECT session_id FROM runs WHERE agent_id = ? AND instance_id = ? AND parent_run_id IS NULL AND session_id IS NOT NULL ORDER BY started_at DESC LIMIT 1",
  );
  const newestProject = db.prepare(
    "SELECT project_id FROM runs WHERE agent_id = ? AND instance_id = ? AND project_id IS NOT NULL ORDER BY started_at DESC LIMIT 1",
  );
  const insertConv = db.prepare(
    `INSERT INTO conversations (id, agent_id, instance_id, project_id, session_id, status, active_run_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'idle', NULL, ?, ?)`,
  );
  const assignRuns = db.prepare(
    "UPDATE runs SET conversation_id = ? WHERE agent_id = ? AND instance_id = ? AND parent_run_id IS NULL AND conversation_id IS NULL",
  );

  db.transaction(() => {
    for (const s of slots) {
      let convId = (findConv.get(s.agent_id, s.instance_id) as { id: string } | undefined)?.id;
      if (!convId) {
        const t = transcriptSession.get(s.agent_id, s.instance_id) as
          | { session_id: string | null; updated_at: number }
          | undefined;
        const runSession = newestRunSession.get(s.agent_id, s.instance_id) as { session_id: string | null } | undefined;
        const proj = (newestProject.get(s.agent_id, s.instance_id) as { project_id: string | null } | undefined)?.project_id ?? null;
        const session = t?.session_id ?? runSession?.session_id ?? null;
        convId = randomUUID();
        insertConv.run(convId, s.agent_id, s.instance_id, proj, session, t?.updated_at ?? now, now);
      }
      assignRuns.run(convId, s.agent_id, s.instance_id);
    }
  })();
}

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
    if (v < 14) { MIGRATIONS[13]!(db); v = 14; db.pragma("user_version = 14"); }
    if (v < 15) { MIGRATIONS[14]!(db); v = 15; db.pragma("user_version = 15"); }
    if (v < 16) { MIGRATIONS[15]!(db); v = 16; db.pragma("user_version = 16"); }
    if (v < 17) { MIGRATIONS[16]!(db); v = 17; db.pragma("user_version = 17"); }
    if (v < 18) { MIGRATIONS[17]!(db); v = 18; db.pragma("user_version = 18"); }
  })();
}
