// Side-effect module, like execution/conversation-wiring.ts: posts a mission seat's outbox when
// its run finishes. Imported once from the services barrel; returns at once for any other run.
import { registerRunFinishedListener } from "../execution/runs";
import { emitAppEvent } from "../infra/events";
import { log } from "../infra/log";
import { postRunOutbox } from "./posting";

declare global {
  // HMR re-runs this module; a second listener would post every outbox twice.
  var __agentOfficeMissionsWiringInstalled: boolean | undefined;
}

if (!globalThis.__agentOfficeMissionsWiringInstalled) {
  registerRunFinishedListener((runId) => {
    void postRunOutbox(runId)
      .then((seat) => { if (seat) emitAppEvent("missions:changed"); })
      .catch((err: unknown) => log.error("missions.post_failed", { runId, err: err instanceof Error ? err.message : String(err) }));
  });
  globalThis.__agentOfficeMissionsWiringInstalled = true;
}
