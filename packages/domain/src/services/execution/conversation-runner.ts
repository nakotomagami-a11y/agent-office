// The production ConversationRunner: a conversation's messages go to its live CLI process
// (execution/chat-session.ts). Tests inject a fake instead (conversation.test.ts).
import * as chatSession from "./chat-session";
import type { ConversationRunner } from "./conversation";

export const productionConversationRunner: ConversationRunner = {
  deliver: (conv, input, opts) => chatSession.deliver(conv, input, opts),
  redeliver: (conv) => chatSession.redeliverPending(conv),
  isBusy: (convId) => chatSession.isBusy(convId),
  hasLiveProcess: (convId) => chatSession.hasLiveProcess(convId),
  close: (convId) => chatSession.closeSession(convId),
};
