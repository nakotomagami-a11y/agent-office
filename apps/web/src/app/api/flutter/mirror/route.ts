import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

let mirrorPid: number | null = null;

export async function POST(req: Request) {
  let body: { deviceId?: string } = {};
  try { body = await req.json() as { deviceId?: string }; } catch { /* no body */ }

  // Kill existing mirror if running
  if (mirrorPid !== null) {
    try { process.kill(mirrorPid, "SIGTERM"); } catch { /* already gone */ }
    mirrorPid = null;
  }

  const args: string[] = [];
  if (body.deviceId) args.push("-s", body.deviceId);
  args.push("--always-on-top", "--window-title", "Phone Mirror");

  const child = spawn("scrcpy", args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();
  mirrorPid = child.pid ?? null;

  return NextResponse.json({ pid: mirrorPid });
}

export async function DELETE() {
  if (mirrorPid !== null) {
    try { process.kill(mirrorPid, "SIGTERM"); } catch { /* already gone */ }
    mirrorPid = null;
  }
  return NextResponse.json({ ok: true });
}
