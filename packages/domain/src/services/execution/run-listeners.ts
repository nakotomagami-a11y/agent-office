// What a finished run sets off: the conversation queue advances, loops step, a mission seat posts
// its outbox. Called once by boot(); each install keeps its own HMR guard, so a second call is a no-op.
import { installConversationWiring } from "./conversation-wiring";
import { installLoopWiring } from "./loop-wiring";
import { installMissionsWiring } from "../missions/wiring";

export function installRunListeners(): void {
  installConversationWiring();
  installLoopWiring();
  installMissionsWiring();
}
