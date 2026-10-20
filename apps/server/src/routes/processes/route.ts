// GET /api/processes — list listening dev/build server processes (Linux, macOS,
// Windows) plus agent-started background shells, matched to projects by cwd.
import { processes } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(await processes.listProcesses());
}
