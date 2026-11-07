import type { ChatMessage } from '../../shared/types';
import { getConversation } from './api';

function waitForNextRead(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

/** A dropped stream may have finished on the server. Resume this turn by ID
 * without repeating the user's POST or borrowing a reply from another tab. */
export async function recoverChatReply(conversationId: string, userMessageId: string, signal: AbortSignal): Promise<ChatMessage | undefined> {
  if (signal.aborted) return;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 120_000);
  let wait = 0;
  try {
    while (!controller.signal.aborted) {
      if (wait) await waitForNextRead(wait, controller.signal);
      if (controller.signal.aborted) return;
      try {
        const saved = await getConversation(conversationId, controller.signal);
        if (saved.id !== conversationId) return;
        const reply = saved.messages.find(message => message.role === 'assistant' && message.replyToUserMessageId === userMessageId);
        if (reply) return reply;
      } catch { /* The same network interruption can affect the first GET. */ }
      wait = Math.min(wait ? wait * 2 : 1000, 10_000);
    }
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
    cancel();
  }
}
