/**
 * At-rest encryption for secret values.
 *
 * Secret tokens are AES-256-GCM encrypted with a machine-local key at
 * `~/.claude/agent-office/secret.key` (0600, generated once). The DB only ever
 * holds ciphertext, so an accidental DB commit, an Export/Import bundle, or a
 * cloud-synced `db.sqlite` leaks nothing without the local keyfile — which is
 * never exported.
 *
 * Threat model: this defends against accidental disclosure (shared exports,
 * synced backups, casual disk inspection). It does NOT defend against a local
 * attacker who can read BOTH the DB and the keyfile — but such an attacker
 * already has your `~/.claude/.credentials.json` and gh `hosts.yml`, so this is
 * consistent with the platform's existing threat model. Upgrade path: move the
 * key into the OS keychain (libsecret / Keychain / Credential Manager).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_STATE_DIR } from "../infra/paths";

const KEY_PATH = join(APP_STATE_DIR, "secret.key");
const PREFIX = "aes1:";
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (existsSync(KEY_PATH)) {
    cachedKey = readFileSync(KEY_PATH);
  } else {
    mkdirSync(dirname(KEY_PATH), { recursive: true });
    const key = randomBytes(32);
    writeFileSync(KEY_PATH, key, { mode: 0o600 });
    try { chmodSync(KEY_PATH, 0o600); } catch { /* non-POSIX filesystems */ }
    cachedKey = key;
  }
  return cachedKey;
}

/** Encrypt a secret value → `aes1:<base64(iv | ciphertext | tag)>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, ct, tag]).toString("base64");
}

/**
 * Decrypt a stored value. Values written before encryption existed have no
 * `aes1:` prefix and are returned verbatim (transparent legacy support); they
 * get encrypted on their next write.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const ct = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
