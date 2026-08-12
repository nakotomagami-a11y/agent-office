/**
 * Docs content server.
 *
 *   GET /api/docs/content            → returns the tab config from
 *      `apps/web/docs/_index.json`. The /docs page uses this to know
 *      which tabs exist, their labels, and the file for each.
 *
 *   GET /api/docs/content?file=<f>   → returns the raw markdown body of
 *      one file at `apps/web/docs/<f>`. `<f>` is validated against the
 *      basename allow-list from the index so only intentional files can
 *      be requested. Content-Type is `text/markdown; charset=utf-8`.
 *
 * The docs live inside the repo so a fresh clone works. The Next dev
 * server picks up file edits via HMR because the read path is dynamic.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Resolve the docs dir relative to the app cwd. Runs in both dev
// (apps/web is cwd) and Next `standalone` build (cwd differs).
function resolveDocsDir(): string | null {
  const candidates = [
    process.env["AGENT_OFFICE_DOCS_DIR"],
    join(process.cwd(), "docs"),
    join(process.cwd(), "apps", "web", "docs"),
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

interface DocsTabConfig {
  id: string;
  label: string;
  file: string;
}

interface DocsIndex {
  version: number;
  tabs: DocsTabConfig[];
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
