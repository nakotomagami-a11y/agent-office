// GET /api/power — is the machine on AC or battery?
//
// This is a local desktop app: the server process and the battery are the same
// physical machine, so reading Linux sysfs here is authoritative (and dodges
// the Battery Status API's "plugged-in-but-full reports not charging" trap).
// Returns `{ onAc: null }` when no power supplies are exposed (macOS/Windows,
// desktop-in-browser, CI) so the client can fall back to navigator.getBattery.
import { readdir, readFile } from "node:fs/promises";

const SYSFS = "/sys/class/power_supply";

async function read(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

export async function GET() {
  let entries: string[];
  try {
    entries = await readdir(SYSFS);
  } catch {
    return Response.json({ onAc: null });
  }

  // 1) A Mains/USB adapter's `online` flag is the most direct signal.
  for (const name of entries) {
    const type = await read(`${SYSFS}/${name}/type`);
    if (type === "Mains" || type === "USB") {
      const online = await read(`${SYSFS}/${name}/online`);
      if (online === "1") return Response.json({ onAc: true, source: name });
      if (online === "0") return Response.json({ onAc: false, source: name });
    }
  }

  // 2) No adapter node — infer from a battery's charge status.
  for (const name of entries) {
    const type = await read(`${SYSFS}/${name}/type`);
    if (type === "Battery") {
      const status = await read(`${SYSFS}/${name}/status`);
      if (status === "Discharging") return Response.json({ onAc: false, source: name });
      if (status === "Charging" || status === "Full") {
        return Response.json({ onAc: true, source: name });
      }
    }
  }

  return Response.json({ onAc: null });
}
