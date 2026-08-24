// Docs content server.
//   GET /api/docs/content          → tab config from `docs/_index.json` (repo root):
//      which tabs exist, their labels, and the file for each.
//   GET /api/docs/content?file=<f> → raw markdown body of `docs/<f>`, validated
//      against the index's basename allow-list. Content-Type text/markdown.
// Docs live in-repo so a fresh clone works; the read path is dynamic so Next dev
// picks up edits via HMR.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DocsIndex } from "@agent-office/domain/types";

// Resolve the repo-root `docs/` dir. `next dev`/`start` run with cwd = apps/web,
// so we walk up two levels; when cwd is the repo root the first candidate hits.
// `AGENT_OFFICE_DOCS_DIR` overrides both (needed for a packaged standalone build).
function resolveDocsDir(): string | null {
  const candidates = [
    process.env["AGENT_OFFICE_DOCS_DIR"],
    join(process.cwd(), "docs"),
    join(process.cwd(), "..", "..", "docs"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory() && existsSync(join(c, "_index.json"))) {
        return c;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function loadIndex(dir: string): DocsIndex | null {
  try {
    const raw = readFileSync(join(dir, "_index.json"), "utf8");
    const parsed = JSON.parse(raw) as DocsIndex;
    if (!Array.isArray(parsed.tabs)) return null;
    // Filter out malformed entries so the UI can't crash on partial config.
    parsed.tabs = parsed.tabs.filter(
      (t) => typeof t === "object" && typeof t.id === "string" && typeof t.file === "string" && typeof t.label === "string",
    );
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const dir = resolveDocsDir();
  if (!dir) {
    return Response.json({ error: "docs_dir_missing" }, { status: 500 });
  }
  const index = loadIndex(dir);
  if (!index) {
    return Response.json({ error: "docs_index_invalid" }, { status: 500 });
  }

  const url = new URL(request.url);
  const file = url.searchParams.get("file");
  if (!file) {
    // Index request — return the tab config.
    return Response.json(index);
  }

  // File request — validate against the allow-list.
  const allowed = new Set(index.tabs.map((t) => t.file));
  if (!allowed.has(file)) {
    return Response.json({ error: "file_not_allowed" }, { status: 400 });
  }
  const filePath = join(dir, file);
  if (!existsSync(filePath)) {
    return Response.json({ error: "file_missing" }, { status: 404 });
  }
  const body = readFileSync(filePath, "utf8");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
