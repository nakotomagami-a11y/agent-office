// Parses `git diff` / `gh pr diff` unified output into files → hunks → numbered lines.
import { MAX_DIFF_LINES_PER_FILE } from "../../config/review";
import type { DiffFile, DiffHunk } from "../../types/index";

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Git C-quotes a path with non-ASCII or special characters: `"caf\303\251.txt"` is the
 *  UTF-8 bytes of `café.txt`. The path must round-trip exactly: review comments send it back. */
export function unquotePath(raw: string): string {
  if (!(raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"'))) return raw;
  const bytes: number[] = [];
  const s = raw.slice(1, -1);
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\") { bytes.push(...Buffer.from(c, "utf8")); continue; }
    const next = s[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(s.slice(i + 1));
    if (octal) { bytes.push(parseInt(octal[0], 8)); i += 3; }
    else { bytes.push(ESCAPES[next] ?? next.charCodeAt(0)); i += 1; }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** `a/src/x.ts` → `src/x.ts`; `/dev/null` → null. */
function headerPath(raw: string): string | null {
  const p = raw.startsWith('"') ? raw : raw.replace(/\t.*$/, "");
  if (p === "/dev/null") return null;
  return unquotePath(p).replace(/^[ab]\//, "");
}

/** Only for a binary or mode-only file, which has no ---/+++ lines: `diff --git a/x b/x`. */
function gitLinePath(line: string): string {
  const rest = line.slice("diff --git ".length);
  const quoted = rest.lastIndexOf(' "b/');
  const b = quoted >= 0 ? rest.slice(quoted + 1) : rest.slice(Math.floor(rest.length / 2)).trim();
  return unquotePath(b).replace(/^b\//, "");
}

function newFile(line: string): DiffFile {
  const path = gitLinePath(line);
  return { path, oldPath: path, status: "modified", binary: false, additions: 0, deletions: 0, truncated: false, hunks: [] };
}

/** A line between `diff --git` and the first hunk. Inside a hunk these prefixes are content. */
function applyHeader(file: DiffFile, line: string): void {
  if (line.startsWith("new file mode")) file.status = "added";
  else if (line.startsWith("deleted file mode")) file.status = "deleted";
  else if (line.startsWith("rename from ")) { file.oldPath = unquotePath(line.slice(12)); file.status = "renamed"; }
  else if (line.startsWith("rename to ")) file.path = unquotePath(line.slice(10));
  else if (line.startsWith("Binary files ") || line === "GIT binary patch") file.binary = true;
  else if (line.startsWith("--- ")) file.oldPath = headerPath(line.slice(4)) ?? file.oldPath;
  else if (line.startsWith("+++ ")) file.path = headerPath(line.slice(4)) ?? file.path;
}

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let kept = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      file = newFile(line);
      files.push(file);
      hunk = null;
      kept = 0;
      continue;
    }
    if (!file) continue;

    if (!hunk) applyHeader(file, line);

    const m = HUNK.exec(line);
    if (m) {
      oldLine = Number(m[1]);
      newLine = Number(m[2]);
      hunk = { header: line, oldStart: oldLine, newStart: newLine, section: m[3] ?? "", lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    const mark = line[0];
    if (mark === "+") file.additions++;
    else if (mark === "-") file.deletions++;
    else if (mark !== " ") continue; // "\ No newline at end of file", or the trailing empty line
    if (kept >= MAX_DIFF_LINES_PER_FILE) { file.truncated = true; continue; }
    kept++;

    const body = line.slice(1);
    if (mark === "+") hunk.lines.push({ kind: "add", text: body, oldLine: null, newLine: newLine++ });
    else if (mark === "-") hunk.lines.push({ kind: "del", text: body, oldLine: oldLine++, newLine: null });
    else hunk.lines.push({ kind: "context", text: body, oldLine: oldLine++, newLine: newLine++ });
  }
  return files;
}
