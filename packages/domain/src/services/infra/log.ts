// Tiny structured logger - JSON lines to stderr.
//
// warn/error are additionally appended to APP_STATE_DIR/server.log: the dev
// server's stderr lives only in whatever terminal started it, which makes
// post-mortems of a 500 impossible once that scrollback is gone.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_STATE_DIR } from "./paths";

type Level = "debug" | "info" | "warn" | "error";

const SERVER_LOG = join(APP_STATE_DIR, "server.log");

function persist(line: string): void {
  try {
    mkdirSync(APP_STATE_DIR, { recursive: true });
    appendFileSync(SERVER_LOG, line + "\n");
  } catch {
    /* logging must never throw */
  }
}

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...extra,
  });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
    persist(line);
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
