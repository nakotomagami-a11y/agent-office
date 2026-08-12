import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");

  const args: string[] = [];
  if (deviceId) { args.push("-s", deviceId); }
  args.push("exec-out", "screencap", "-p");

  return new Promise<Response>((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn("adb", args, { timeout: 12_000 });

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve(NextResponse.json({ error: "screencap failed" }, { status: 500 }));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        resolve(NextResponse.json({ error: "invalid image data" }, { status: 500 }));
        return;
      }
      resolve(
        new Response(buf, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
          },
        }),
      );
    });
    child.on("error", () => {
      resolve(NextResponse.json({ error: "adb not found" }, { status: 500 }));
    });
  });
}
