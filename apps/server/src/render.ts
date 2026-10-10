// The in-process reads apps/web's server-rendered pages make before any API call
// could: the one seam where the UI reaches the brains without HTTP. Keep it to
// reads, and keep it small — if the UI ever runs out of process, each of these
// becomes a fetch.
import { agents, db } from "@agent-office/domain/services";

export type Theme = "dark" | "light";

export function readTheme(): Theme {
  const stored = db.getUiSetting("theme");
  return stored === "light" ? "light" : "dark";
}

export const readAgent = agents.readAgent;
