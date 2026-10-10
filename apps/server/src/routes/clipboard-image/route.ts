// POST /api/clipboard-image — read the current clipboard image (PNG) from the
// Wayland compositor via `wl-paste` and return it. Host convenience for pasting.
// Fallback for WebKit2GTK only; needs `wl-clipboard`. A missing binary returns
// 503, never "no image" — conflating the two hid a missing dependency.
import { spawn } from "node:child_process";

/** `wl-paste` is missing from PATH, as opposed to present-but-empty-clipboard. */
class WlPasteMissing extends Error {}

/** Clipboard payload exceeded the read cap. */
class ClipboardTooLarge extends Error {}

function wlPasteAsync(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("wl-paste", ["--no-newline", "-t", "image/png"], {
      timeout: 3000,
      env: process.env,
    });

    // Cap the read: a large clipboard image (or a compositor offering a huge
    // image/png) otherwise buffers unbounded, and Buffer.concat doubles peak.
    const MAX_BYTES = 32 * 1024 * 1024;
    const chunks: Buffer[] = [];
    let total = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        child.kill();
        reject(new ClipboardTooLarge());
        return;
      }
      chunks.push(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new WlPasteMissing() : err);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`wl-paste exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

export async function POST(): Promise<Response> {
  let buf: Buffer;
  try {
    buf = await wlPasteAsync();
  } catch (err) {
    if (err instanceof ClipboardTooLarge) {
      return Response.json({ error: "clipboard_image_too_large" }, { status: 413 });
    }
    if (err instanceof WlPasteMissing) {
      return Response.json(
        {
          error: "wl_paste_missing",
          detail:
            "Image paste needs the `wl-paste` command (package `wl-clipboard`), which is not installed. " +
            "Install it and restart the app — e.g. `sudo pacman -S wl-clipboard` on Arch, " +
            "`sudo apt install wl-clipboard` on Debian/Ubuntu.",
        },
        { status: 503 },
      );
    }
    return Response.json({ error: "no_clipboard_image" }, { status: 404 });
  }

  if (buf.length === 0) {
    return Response.json({ error: "no_clipboard_image" }, { status: 404 });
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": "image/png" },
  });
}
