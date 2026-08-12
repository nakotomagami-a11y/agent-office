// In-app `claude auth login` driver. Spawns the official CLI under a given
// account's CLAUDE_CONFIG_DIR, captures the OAuth URL it prints, lets the UI
// paste back the authorization code, and reports when credentials land — so
// the user never has to touch a terminal to (re)authenticate.
//
// The `claude` CLI works fine non-TTY: it prints
//   "If the browser didn't open, visit: <oauth-url>"
//   "Paste code here if prompted > "
// then waits on stdin for the code, writes `.credentials.json`, and exits 0.
// On this machine it can also self-complete via the OS keychain (exit 0 with
// no code), which we detect the same way — by watching for process exit.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { accountConfigDir, buildAugmentedPath, DEFAULT_ACCOUNT_ID, CLAUDE_DIR, isValidIdSegment } from "./paths";
import { ensureAccountDir } from "./accounts";
import { log } from "./log";

export type LoginPhase = "starting" | "awaiting-code" | "success" | "error";

export interface LoginState {
  phase: LoginPhase;
  url?: string;
  /** Non-fatal hint (e.g. "Invalid code") shown inline while awaiting-code. */
  message?: string;
}

interface LoginSession extends LoginState {
  proc: ChildProcessWithoutNullStreams;
  buf: string;
  timer: NodeJS.Timeout;
}

const sessions: Map<string, LoginSession> =
  globalThis.__agentOfficeLoginSessions ??
  (globalThis.__agentOfficeLoginSessions = new Map());

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeLoginSessions: Map<string, LoginSession> | undefined;
}

const URL_RE = /(https:\/\/\S*oauth\S+)/i;
const LOGIN_TIMEOUT_MS = 5 * 60_000;

function configDirFor(id: string): string {
  return id === DEFAULT_ACCOUNT_ID ? CLAUDE_DIR : accountConfigDir(id);
}

function publicState(s: LoginState): LoginState {
  return { phase: s.phase, url: s.url, message: s.message };
}

/** Start (or return the in-flight) login for `accountId`. */
export function startLogin(accountId: string): LoginState {
  if (!isValidIdSegment(accountId)) throw new Error(`invalid account id: ${accountId}`);

  const existing = sessions.get(accountId);
  if (existing && (existing.phase === "starting" || existing.phase === "awaiting-code")) {
    return publicState(existing);
  }
  // Clear any finished session before starting fresh.
  if (existing) cancelLogin(accountId);

  if (accountId !== DEFAULT_ACCOUNT_ID) ensureAccountDir(accountId);
  const configDir = configDirFor(accountId);

  const proc = spawn("claude", ["auth", "login", "--claudeai"], {
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      PATH: buildAugmentedPath(),
    },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  const session: LoginSession = {
    phase: "starting",
    proc,
    buf: "",
    timer: setTimeout(() => {
      log.warn("account.login_timeout", { accountId });
      cancelLogin(accountId);
    }, LOGIN_TIMEOUT_MS),
  };
  session.timer.unref?.();
  sessions.set(accountId, session);

  const onData = (chunk: Buffer) => {
    session.buf += chunk.toString();
    if (!session.url) {
      const m = session.buf.match(URL_RE);
      if (m) {
        session.url = m[1];
        if (session.phase === "starting") session.phase = "awaiting-code";
      }
    }
    if (/invalid code/i.test(chunk.toString())) {
      session.message = "That code didn't work — copy the full code and try again.";
    }
    if (/login successful/i.test(session.buf)) session.phase = "success";
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);

  proc.on("error", (err) => {
    session.phase = "error";
    session.message = String(err);
    clearTimeout(session.timer);
    log.warn("account.login_spawn_error", { accountId, err: String(err) });
  });

  proc.on("close", (code) => {
    clearTimeout(session.timer);
    if (session.phase === "success" || code === 0) {
      session.phase = "success";
    } else if (session.phase !== "error") {
      session.phase = "error";
      session.message =
        session.buf.trim().split("\n").filter(Boolean).at(-1) ?? `claude exited with code ${code}`;
    }
    log.info("account.login_closed", { accountId, code, phase: session.phase });
  });

  log.info("account.login_started", { accountId, configDir });
  return publicState(session);
}

/** Feed a pasted authorization code to the waiting login process. */
export function submitCode(accountId: string, code: string): LoginState {
  const session = sessions.get(accountId);
  if (!session) throw new Error("no active login for this account");
  const trimmed = code.trim();
  if (!trimmed) throw new Error("code required");
  session.message = undefined;
  try {
    session.proc.stdin.write(trimmed + "\n");
  } catch (err) {
    throw new Error(`failed to submit code: ${String(err)}`);
  }
  return publicState(session);
}

export function getLoginState(accountId: string): LoginState | null {
  const session = sessions.get(accountId);
  return session ? publicState(session) : null;
}

export function cancelLogin(accountId: string): void {
  const session = sessions.get(accountId);
  if (!session) return;
  clearTimeout(session.timer);
  try {
    session.proc.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(accountId);
}
