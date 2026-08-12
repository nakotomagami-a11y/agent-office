import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function wlPasteAsync(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("wl-paste", ["--no-newline", "-t", "image/png"], {
      timeout: 3000,
      env: process.env,
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`wl-paste exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

// Reads the current clipboard image directly from the Wayland compositor via
// wl-paste, bypassing WebKit2GTK's clipboard cache which causes stale images
// on repeated pastes inside Tauri.
export async function POST(): Promise<NextResponse> {
  let buf: Buffer;
  try {
    buf = await wlPasteAsync();
  } catch {
    return NextResponse.json({ error: "No image in clipboard" }, { status: 404 });
  }

  if (buf.length === 0) {
    return NextResponse.json({ error: "No image in clipboard" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}
