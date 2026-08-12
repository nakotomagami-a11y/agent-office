import { execFile } from "node:child_process";
import { NextResponse } from "next/server";

export type FlutterDevice = {
  id: string;
  name: string;
  model: string;
  status: "device" | "offline" | "unauthorized" | "no permissions";
  transportType: "usb" | "tcp";
};

function parseAdbDevices(output: string): FlutterDevice[] {
  const devices: FlutterDevice[] = [];
  const lines = output.split("\n").slice(1); // skip "List of devices attached"

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    // Format: "serial  status  [qualifiers...]"
    const match = trimmed.match(/^(\S+)\s+(device|offline|unauthorized|no permissions)\s*(.*)?$/);
    if (!match) continue;

    const id = match[1]!;
    const status = match[2] as FlutterDevice["status"];
    const qualifiers = match[3] ?? "";

    const modelMatch = qualifiers.match(/model:(\S+)/);
    const productMatch = qualifiers.match(/product:(\S+)/);
    const model = modelMatch
      ? modelMatch[1]!.replace(/_/g, " ")
      : id;
    const name = productMatch
      ? productMatch[1]!.replace(/_/g, " ")
      : model;

    devices.push({
      id,
      name,
      model,
      status,
      transportType: id.includes(":") ? "tcp" : "usb",
    });
  }

  return devices;
}

export async function GET() {
  return new Promise<NextResponse>((resolve) => {
    execFile("adb", ["devices", "-l"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
        resolve(NextResponse.json({ available: !isNotFound, devices: [] }));
        return;
      }
      const devices = parseAdbDevices(stdout);
      resolve(NextResponse.json({ available: true, devices }));
    });
  });
}
